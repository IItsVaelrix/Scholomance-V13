/**
 * CommandResolver — deterministic action resolution.
 *
 * Given world state + a bound command + a ResolutionContext, produces domain events or a refusal.
 * Pure function. No side effects. No I/O. No Date.now(). No Math.random().
 *
 * The ResolutionContext supplies all identity and temporal metadata:
 *   - eventIds: pre-derived deterministic IDs
 *   - occurredAt: timestamp assigned by the application boundary
 *   - startingSequence: next ledger sequence number
 *   - startingWorldRevision: resulting world revision
 *
 * LAW: This module MUST NOT import crypto, Date, or any I/O.
 */

import type {
  WorldState,
  BoundCommand,
  CommandResolution,
  DomainEvent,
  ActionType,
  EventType,
  ResolutionContext,
} from "@polaris/contracts";

export class CommandResolver {
  private rulesetVersion: string;

  constructor(rulesetVersion: string) {
    this.rulesetVersion = rulesetVersion;
  }

  /**
   * Resolve a command against world state.
   * The context provides deterministic metadata for any events produced.
   */
  resolve(state: WorldState, command: BoundCommand, context: ResolutionContext): CommandResolution {
    const handler = this.handlers[command.action];
    if (!handler) {
      return { accepted: false, refusal: "INVALID_ACTION" };
    }
    return handler.call(this, state, command, context);
  }

  private eventIndex = 0;

  private makeEvent(
    state: WorldState,
    command: BoundCommand,
    eventType: EventType,
    payload: unknown,
    context: ResolutionContext,
  ): DomainEvent {
    const idx = this.eventIndex++;
    return {
      eventId: context.eventIds[idx] ?? `evt_overflow_${command.commandId}_${idx}`,
      worldId: state.worldId,
      roomId: command.roomId,
      sequence: context.startingSequence + idx,
      worldRevision: context.startingWorldRevision,
      eventType,
      actorId: command.actorId,
      payload,
      rulesetVersion: this.rulesetVersion,
      occurredAt: context.occurredAt,
    };
  }

  private handlers: Record<ActionType, (state: WorldState, cmd: BoundCommand, ctx: ResolutionContext) => CommandResolution> = {
    LOOK: (_state, _cmd, _ctx) => {
      return { accepted: true, events: [] };
    },

    EXAMINE: (state, cmd, _ctx) => {
      const targetId = cmd.targetIds[0];
      if (!targetId || !state.entities[targetId]) {
        return { accepted: false, refusal: "TARGET_NOT_FOUND" };
      }
      return { accepted: true, events: [] };
    },

    MOVE: (state, cmd, ctx) => {
      const room = state.rooms[cmd.roomId];
      const player = state.players[cmd.actorId];
      if (!room || !player) {
        return { accepted: false, refusal: "TARGET_NOT_FOUND" };
      }
      const byDirection = room.exitDirections ?? {};
      const directionArg = cmd.arguments["direction"] as string | undefined;
      // The binder normally resolves a direction to a room ID already; the
      // direction-map fallback here makes resolution robust regardless of caller.
      const destinationId =
        cmd.targetIds[0]
        ?? (directionArg !== undefined ? byDirection[directionArg] ?? directionArg : undefined);
      if (!destinationId || !room.exitIds.includes(destinationId)) {
        return { accepted: false, refusal: "TARGET_NOT_FOUND" };
      }
      const destRoom = state.rooms[destinationId];
      if (!destRoom) {
        return { accepted: false, refusal: "TARGET_NOT_FOUND" };
      }

      this.eventIndex = 0;
      const leftEvent = this.makeEvent(state, cmd, "PLAYER_LEFT_ROOM", {
          playerId: cmd.actorId,
          displayName: player.displayName,
          toRoomId: destinationId,
        }, ctx);
      const enteredEvent = this.makeEvent(state, cmd, "PLAYER_ENTERED_ROOM", {
          playerId: cmd.actorId,
          displayName: player.displayName,
          fromRoomId: cmd.roomId,
        }, ctx);
      // The ENTER event must reference the destination room, not the source
      enteredEvent.roomId = destinationId;
      const events: DomainEvent[] = [leftEvent, enteredEvent];
      return { accepted: true, events };
    },

    TAKE: (state, cmd, ctx) => {
      const targetId = cmd.targetIds[0];
      if (!targetId) {
        return { accepted: false, refusal: "TARGET_NOT_FOUND" };
      }

      if (cmd.targetIds.length > 1) {
        return {
          accepted: false,
          refusal: "TARGET_AMBIGUOUS",
          alternatives: cmd.targetIds.map((id) => ({
            entityId: id,
            label: state.entities[id]?.definitionId ?? id,
          })),
        };
      }

      const entity = state.entities[targetId];
      if (!entity) {
        return { accepted: false, refusal: "TARGET_NOT_FOUND" };
      }

      if (entity.location.type !== "room" || entity.location.roomId !== cmd.roomId) {
        return { accepted: false, refusal: "TARGET_UNAVAILABLE" };
      }

      if (entity.entityType !== "object") {
        return { accepted: false, refusal: "PERMISSION_DENIED" };
      }

      this.eventIndex = 0;
      const event = this.makeEvent(state, cmd, "ENTITY_TAKEN", {
        entityId: targetId,
        entityName: entity.definitionId,
        fromRoomId: cmd.roomId,
      }, ctx);
      return { accepted: true, events: [event] };
    },

    DROP: (state, cmd, ctx) => {
      const targetId = cmd.targetIds[0];
      if (!targetId) {
        return { accepted: false, refusal: "TARGET_NOT_FOUND" };
      }

      const entity = state.entities[targetId];
      if (!entity) {
        return { accepted: false, refusal: "TARGET_NOT_FOUND" };
      }

      if (entity.location.type !== "inventory" || entity.location.playerId !== cmd.actorId) {
        return { accepted: false, refusal: "TARGET_UNAVAILABLE" };
      }

      this.eventIndex = 0;
      const event = this.makeEvent(state, cmd, "ENTITY_DROPPED", {
        entityId: targetId,
        entityName: entity.definitionId,
        toRoomId: cmd.roomId,
      }, ctx);
      return { accepted: true, events: [event] };
    },

    ACTIVATE: (state, cmd, ctx) => {
      const targetId = cmd.targetIds[0];
      if (!targetId) {
        return { accepted: false, refusal: "TARGET_NOT_FOUND" };
      }

      const entity = state.entities[targetId];
      if (!entity) {
        return { accepted: false, refusal: "TARGET_NOT_FOUND" };
      }

      const inRoom = entity.location.type === "room" && entity.location.roomId === cmd.roomId;
      const inInventory = entity.location.type === "inventory" && entity.location.playerId === cmd.actorId;
      if (!inRoom && !inInventory) {
        return { accepted: false, refusal: "TARGET_UNAVAILABLE" };
      }

      if (entity.entityType === "character") {
        return { accepted: false, refusal: "PERMISSION_DENIED" };
      }

      this.eventIndex = 0;
      const activation = (cmd.arguments["activation"] as string) ?? "activate";
      const event = this.makeEvent(state, cmd, "ENTITY_ACTIVATED", {
        entityId: targetId,
        entityName: entity.definitionId,
        activation,
      }, ctx);
      return { accepted: true, events: [event] };
    },

    INVENTORY: (_state, _cmd, _ctx) => {
      return { accepted: true, events: [] };
    },

    SAY: (state, cmd, ctx) => {
      const player = state.players[cmd.actorId];
      if (!player) {
        return { accepted: false, refusal: "TARGET_NOT_FOUND" };
      }
      this.eventIndex = 0;
      const message = (cmd.arguments["message"] as string) ?? "";
      const event = this.makeEvent(state, cmd, "PLAYER_SPOKE", {
        playerId: cmd.actorId,
        displayName: player.displayName,
        message,
      }, ctx);
      return { accepted: true, events: [event] };
    },
  };
}

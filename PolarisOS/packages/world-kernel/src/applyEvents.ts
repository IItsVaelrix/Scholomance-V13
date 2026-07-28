/**
 * applyEvents — pure state transition function.
 *
 * Given a WorldState and a list of domain events, returns the new WorldState.
 * This is the ONLY place state mutations happen in the kernel.
 * Deterministic: same input always produces same output.
 */

import type { WorldState, DomainEvent } from "@polaris/contracts";

export function applyEvents(state: WorldState, events: DomainEvent[]): WorldState {
  let next = structuredClone(state);

  for (const event of events) {
    next = applySingleEvent(next, event);
  }

  return next;
}

function applySingleEvent(state: WorldState, event: DomainEvent): WorldState {
  switch (event.eventType) {
    case "PLAYER_ENTERED_ROOM": {
      const payload = event.payload as { playerId: string; displayName: string; fromRoomId: string | null };
      const room = state.rooms[event.roomId!];
      if (!room) break;
      // Auto-create the player record if absent so this event is self-sufficient
      // for replay (restart restoration). Backward compatible: a pre-existing
      // player record is reused unchanged.
      let player = state.players[payload.playerId];
      if (!player) {
        player = {
          playerId: payload.playerId,
          displayName: payload.displayName,
          roomId: event.roomId!,
          inventoryIds: [],
          connectionState: "connected",
        };
        state.players[payload.playerId] = player;
      }
      if (!room.occupantIds.includes(payload.playerId)) {
        room.occupantIds.push(payload.playerId);
      }
      player.roomId = event.roomId!;
      player.connectionState = "connected";
      room.revision += 1;
      break;
    }

    case "PLAYER_LEFT_ROOM": {
      const payload = event.payload as { playerId: string; toRoomId: string | null };
      // The roomId on this event is the room being left
      const room = state.rooms[event.roomId!];
      const player = state.players[payload.playerId];
      if (room && player) {
        room.occupantIds = room.occupantIds.filter((id) => id !== payload.playerId);
        room.revision += 1;
      }
      break;
    }

    case "PLAYER_CONNECTED": {
      const payload = event.payload as { playerId: string };
      const player = state.players[payload.playerId];
      if (player) {
        player.connectionState = "connected";
      }
      break;
    }

    case "PLAYER_DISCONNECTED": {
      const payload = event.payload as { playerId: string };
      const player = state.players[payload.playerId];
      if (player) {
        player.connectionState = "disconnected";
      }
      break;
    }

    case "ENTITY_TAKEN": {
      const payload = event.payload as { entityId: string; fromRoomId: string };
      const entity = state.entities[payload.entityId];
      const room = state.rooms[payload.fromRoomId];
      const player = state.players[event.actorId!];
      if (entity && room && player) {
        entity.location = { type: "inventory", playerId: event.actorId! };
        room.entityIds = room.entityIds.filter((id) => id !== payload.entityId);
        player.inventoryIds.push(payload.entityId);
        room.revision += 1;
      }
      break;
    }

    case "ENTITY_DROPPED": {
      const payload = event.payload as { entityId: string; toRoomId: string };
      const entity = state.entities[payload.entityId];
      const room = state.rooms[payload.toRoomId];
      const player = state.players[event.actorId!];
      if (entity && room && player) {
        entity.location = { type: "room", roomId: payload.toRoomId };
        room.entityIds.push(payload.entityId);
        player.inventoryIds = player.inventoryIds.filter((id) => id !== payload.entityId);
        room.revision += 1;
      }
      break;
    }

    case "ENTITY_ACTIVATED": {
      const payload = event.payload as { entityId: string; activation: string };
      const entity = state.entities[payload.entityId];
      if (entity) {
        entity.flags["activated"] = true;
        entity.flags["activation"] = payload.activation;
        // Also set room flag for environmental mutations
        if (entity.location.type === "room") {
          const room = state.rooms[entity.location.roomId];
          if (room) {
            room.flags[`${payload.entityId}_${payload.activation}`] = true;
            room.revision += 1;
          }
        }
      }
      break;
    }

    case "ROOM_FLAG_CHANGED": {
      const payload = event.payload as { flagKey: string; newValue: boolean | string | number };
      const room = state.rooms[event.roomId!];
      if (room) {
        room.flags[payload.flagKey] = payload.newValue;
        room.revision += 1;
      }
      break;
    }

    case "PLAYER_SPOKE": {
      // No state mutation — narrative only
      break;
    }

    case "COMMAND_REFUSED": {
      // No state mutation — diagnostic only
      break;
    }
  }

  return state;
}

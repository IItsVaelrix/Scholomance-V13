/**
 * CommandBinder — transforms raw text into a BoundCommand or a refusal.
 *
 * Deterministic. No LLM. No guessing.
 * If ambiguous, returns TARGET_AMBIGUOUS with alternatives.
 */

import type { ActionType, BoundCommand, WorldState } from "@polaris/contracts";
import { SYNONYMS, DIRECTION_WORDS, ACTION_PATTERNS } from "./vocabulary.js";

export interface BindResult {
  success: boolean;
  command?: BoundCommand;
  refusal?: "INVALID_ACTION" | "TARGET_NOT_FOUND" | "TARGET_AMBIGUOUS";
  alternatives?: Array<{ entityId: string; label: string }>;
}

export class CommandBinder {
  /**
   * Bind raw input to a command given the current world context.
   */
  bind(
    rawInput: string,
    context: {
      commandId: string;
      actorId: string;
      roomId: string;
      state: WorldState;
    },
  ): BindResult {
    const input = rawInput.trim().toLowerCase();
    if (!input) {
      return { success: false, refusal: "INVALID_ACTION" };
    }

    // Try multi-word patterns first
    for (const { pattern, action } of ACTION_PATTERNS) {
      const match = input.match(pattern);
      if (match) {
        const targetText = match[1]?.trim() ?? "";
        return this.buildCommand(action, targetText, context);
      }
    }

    // Single-word direction shortcut (e.g. "east")
    if (DIRECTION_WORDS[input]) {
      return this.buildCommand("MOVE", input, { ...context, directionOverride: DIRECTION_WORDS[input] } as any);
    }

    // Split into verb + rest
    const spaceIdx = input.indexOf(" ");
    const verb = spaceIdx === -1 ? input : input.slice(0, spaceIdx);
    const rest = spaceIdx === -1 ? "" : input.slice(spaceIdx + 1).trim();

    const action = SYNONYMS[verb];
    if (!action) {
      return { success: false, refusal: "INVALID_ACTION" };
    }

    return this.buildCommand(action, rest, { ...context, verbOverride: verb } as any);
  }

  private buildCommand(
    action: ActionType,
    targetText: string,
    context: {
      commandId: string;
      actorId: string;
      roomId: string;
      state: WorldState;
      directionOverride?: string;
      verbOverride?: string;
    },
  ): BindResult {
    const { commandId, actorId, roomId, state } = context;
    const args: Record<string, unknown> = {};
    let targetIds: string[] = [];

    switch (action) {
      case "LOOK":
      case "INVENTORY":
        break;

      case "MOVE": {
        const direction = (context as any).directionOverride ?? targetText;
        args["direction"] = direction;
        // Resolve direction/exit to a room ID
        const room = state.rooms[roomId];
        if (room) {
          // Prefer the authored direction map ("go west" → forest_path). This is
          // the deterministic path for direction words (PDR §6.3, §26.1).
          const byDirection = room.exitDirections ?? {};
          if (byDirection[direction]) {
            targetIds = [byDirection[direction]];
          } else {
            // Fall back to matching a room ID (or substring) so "go shrine" works.
            const exitMatch = room.exitIds.find(
              (exitId) => exitId === direction || exitId.includes(direction),
            );
            targetIds = exitMatch ? [exitMatch] : [direction]; // let resolver validate
          }
        }
        break;
      }

      case "TAKE":
      case "DROP":
      case "EXAMINE":
      case "ACTIVATE": {
        // Resolve target entity by name matching
        const matches = this.resolveTargets(targetText, roomId, actorId, state, action);
        if (matches.length === 0) {
          return { success: false, refusal: "TARGET_NOT_FOUND" };
        }
        if (matches.length > 1) {
          return {
            success: false,
            refusal: "TARGET_AMBIGUOUS",
            alternatives: matches.map((m) => ({ entityId: m.entityId, label: m.definitionId })),
          };
        }
        targetIds = [matches[0].entityId];
        if (action === "ACTIVATE") {
          args["activation"] = this.inferActivation(targetText, (context as any).verbOverride);
        }
        break;
      }

      case "SAY": {
        args["message"] = targetText;
        break;
      }
    }

    return {
      success: true,
      command: {
        commandId,
        actorId,
        roomId,
        action,
        targetIds,
        arguments: args,
        evidence: [{ source: "command-binder", confidence: 1.0 }],
      },
    };
  }

  private resolveTargets(
    text: string,
    roomId: string,
    actorId: string,
    state: WorldState,
    action: ActionType,
  ): Array<{ entityId: string; definitionId: string }> {
    if (!text) return [];
    const normalized = text.replace(/^(the|a|an)\s+/i, "").toLowerCase();
    const results: Array<{ entityId: string; definitionId: string }> = [];

    for (const [entityId, entity] of Object.entries(state.entities)) {
      // Check if entity is accessible
      const inRoom = entity.location.type === "room" && entity.location.roomId === roomId;
      const inInventory = entity.location.type === "inventory" && entity.location.playerId === actorId;

      if (action === "TAKE" && !inRoom) continue;
      if (action === "DROP" && !inInventory) continue;
      if ((action === "EXAMINE" || action === "ACTIVATE") && !inRoom && !inInventory) continue;

      // Name matching
      const defId = entity.definitionId.toLowerCase();
      if (defId.includes(normalized) || normalized.includes(defId)) {
        results.push({ entityId, definitionId: entity.definitionId });
      }
    }

    return results;
  }

  private inferActivation(text: string, verb?: string): string {
    const combined = `${verb ?? ""} ${text}`.toLowerCase();
    if (combined.includes("light") || combined.includes("lit")) return "lit";
    if (combined.includes("open")) return "opened";
    if (combined.includes("close")) return "closed";
    if (combined.includes("turn")) return "turned";
    return "activated";
  }
}

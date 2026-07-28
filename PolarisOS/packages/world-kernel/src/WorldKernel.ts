/**
 * WorldKernel — test-convenience stateful wrapper.
 *
 * ⚠️ DEPRECATION NOTICE: For production use, prefer WorldSession from @polaris/world-runtime.
 * This class remains as a lightweight test helper. It is NOT the persistence authority.
 *
 * Accepts bound commands, validates revision, resolves via CommandResolver,
 * and returns domain events. Never touches I/O.
 */

import type { WorldState, BoundCommand, CommandResolution, ResolutionContext } from "@polaris/contracts";
import { buildResolutionContext } from "@polaris/contracts";
import { CommandResolver } from "./CommandResolver.js";
import { applyEvents } from "./applyEvents.js";

export interface KernelConfig {
  rulesetVersion: string;
}

export class WorldKernel {
  private state: WorldState;
  private resolver: CommandResolver;
  private sequenceCounter: number;
  private rulesetVersion: string;

  constructor(initialState: WorldState, config: KernelConfig) {
    this.state = structuredClone(initialState);
    this.resolver = new CommandResolver(config.rulesetVersion);
    this.sequenceCounter = 0;
    this.rulesetVersion = config.rulesetVersion;
  }

  getState(): WorldState {
    return structuredClone(this.state);
  }

  getRoomRevision(roomId: string): number {
    const room = this.state.rooms[roomId];
    return room ? room.revision : -1;
  }

  getWorldRevision(): number {
    return this.state.revision;
  }

  /**
   * Process a bound command against current state.
   * Returns resolution (accepted with events, or refused).
   * If accepted, state is mutated in place (caller persists externally).
   */
  processCommand(command: BoundCommand): CommandResolution {
    const room = this.state.rooms[command.roomId];
    if (!room) {
      return { accepted: false, refusal: "TARGET_NOT_FOUND" };
    }

    // Build deterministic context (wall-clock assigned here at the boundary)
    const context: ResolutionContext = buildResolutionContext(
      this.state.worldId,
      command.commandId,
      this.rulesetVersion,
      4,
      this.sequenceCounter,
      this.state.revision + 1,
    );

    const resolution = this.resolver.resolve(this.state, command, context);

    if (resolution.accepted && resolution.events.length > 0) {
      // Apply events to state
      this.state = applyEvents(this.state, resolution.events);
      this.state.revision += 1;
      this.sequenceCounter += resolution.events.length;
    }

    return resolution;
  }

  /**
   * Replay a list of events to reconstruct state (for restart restoration).
   */
  replayEvents(events: Array<{ eventType: string; payload: unknown; roomId: string | null; actorId: string | null }>): void {
    for (const event of events) {
      this.state = applyEvents(this.state, [event as any]);
      this.state.revision += 1;
    }
  }
}

/**
 * WorldSession — stateful in-memory orchestrator with two-phase commit.
 *
 * FLOW (enforced by CommitCoordinator):
 *   1. session.proposeCommand(cmd) → ProposedTransaction (state NOT mutated)
 *   2. persistence.commitTransaction(proposal) → validates revision, atomic write
 *   3. session.acceptCommit(proposal) → state advances (ONLY after DB confirms)
 *
 * If the database commit fails, the session NEVER believes the command happened.
 *
 * This class owns:
 *   - Sequence continuity enforcement
 *   - Duplicate eventId rejection
 *   - Revision tracking
 *   - ResolutionContext construction (wall-clock time assigned HERE, not in the resolver)
 *
 * It does NOT own:
 *   - SQLite logic (that lives in persistence-sqlite)
 *   - Broadcast logic (that lives in the server layer)
 */

import type {
  WorldState,
  BoundCommand,
  CommandResolution,
  DomainEvent,
  ResolutionContext,
  ProposedTransaction,
} from "@polaris/contracts";
import { buildResolutionContext } from "@polaris/contracts";
import { CommandResolver, applyEvents, registerPlayer } from "@polaris/world-kernel";

export interface SessionConfig {
  rulesetVersion: string;
}

export class WorldSession {
  private state: WorldState;
  private resolver: CommandResolver;
  private sequenceCounter: number;
  private appliedEventIds: Set<string>;
  private rulesetVersion: string;

  constructor(initialState: WorldState, config: SessionConfig) {
    this.state = structuredClone(initialState);
    this.resolver = new CommandResolver(config.rulesetVersion);
    this.sequenceCounter = 0;
    this.appliedEventIds = new Set();
    this.rulesetVersion = config.rulesetVersion;
  }

  // ─── Read Accessors ──────────────────────────────────────────────────────────

  getState(): WorldState {
    return structuredClone(this.state);
  }

  getWorldRevision(): number {
    return this.state.revision;
  }

  getRoomRevision(roomId: string): number {
    const room = this.state.rooms[roomId];
    return room ? room.revision : -1;
  }

  getSequenceCounter(): number {
    return this.sequenceCounter;
  }

  hasEvent(eventId: string): boolean {
    return this.appliedEventIds.has(eventId);
  }

  // ─── Phase 1: Propose (NO state mutation) ────────────────────────────────────

  /**
   * Propose a command for execution.
   * Returns a ProposedTransaction that can be handed to persistence.
   * STATE IS NOT MUTATED. The session does not "believe" this happened yet.
   */
  proposeCommand(command: BoundCommand): ProposedTransaction | CommandResolution {
    const room = this.state.rooms[command.roomId];
    if (!room) {
      return { accepted: false, refusal: "TARGET_NOT_FOUND" };
    }

    // Build context with pre-allocated event IDs
    const context: ResolutionContext = buildResolutionContext(
      this.state.worldId,
      command.commandId,
      this.rulesetVersion,
      4, // max events per command (MOVE produces 2, others produce 1)
      this.sequenceCounter,
      this.state.revision + 1,
    );

    const resolution = this.resolver.resolve(this.state, command, context);

    if (!resolution.accepted || resolution.events.length === 0) {
      return resolution;
    }

    // Validate no duplicate eventIds (pre-flight check)
    for (const event of resolution.events) {
      if (this.appliedEventIds.has(event.eventId)) {
        throw new Error(
          `DUPLICATE_EVENT_ID: ${event.eventId} already applied. ` +
          `This indicates a command replay or ID collision.`,
        );
      }
    }

    // Validate sequence continuity (pre-flight check)
    for (let i = 0; i < resolution.events.length; i++) {
      const expectedSeq = this.sequenceCounter + i;
      if (resolution.events[i].sequence !== expectedSeq) {
        throw new Error(
          `SEQUENCE_GAP: expected ${expectedSeq}, got ${resolution.events[i].sequence}`,
        );
      }
    }

    // Compute projected state (without mutating this.state)
    const projected = applyEvents(this.state, resolution.events);
    projected.revision += 1;

    return {
      proposalId: `prop_${command.commandId}`,
      commandId: command.commandId,
      worldId: this.state.worldId,
      events: resolution.events,
      expectedRevision: this.state.revision,
      resultingRevision: this.state.revision + 1,
      resultingSequence: this.sequenceCounter + resolution.events.length,
      projectedState: projected,
    };
  }

  // ─── Phase 2: Accept (state mutation ONLY after persistence confirms) ────────

  /**
   * Accept a committed proposal. Called ONLY after persistence confirms the write.
   * This is the ONLY path that mutates session state for new commands.
   */
  acceptCommit(proposal: ProposedTransaction): void {
    // Final safety: verify the proposal matches our expectations
    if (proposal.expectedRevision !== this.state.revision) {
      throw new Error(
        `COMMIT_REVISION_MISMATCH: session at revision ${this.state.revision}, ` +
        `proposal expected ${proposal.expectedRevision}. ` +
        `Another transaction may have committed between propose and accept.`,
      );
    }

    // Apply the projected state
    this.state = structuredClone(proposal.projectedState as WorldState);
    this.sequenceCounter = proposal.resultingSequence;

    // Record applied event IDs
    for (const event of proposal.events) {
      this.appliedEventIds.add(event.eventId);
    }
  }

  // ─── Presence Proposals (player join / leave) ────────────────────────────────

  /**
   * Propose a player entering a room (connection / room.join).
   *
   * Produces a PLAYER_ENTERED_ROOM domain event so presence is synchronized to
   * room subscribers and recorded in the ledger, and registers the player record
   * in the projected state. The kernel resolver has no JOIN action, so this is
   * assembled directly at the runtime boundary (where wall-clock + identity live).
   *
   * STATE IS NOT MUTATED until acceptCommit confirms persistence.
   */
  proposePlayerJoin(
    playerId: string,
    displayName: string,
    roomId: string,
    commandId: string,
  ): ProposedTransaction | CommandResolution {
    const room = this.state.rooms[roomId];
    if (!room) {
      return { accepted: false, refusal: "TARGET_NOT_FOUND" };
    }

    const context = buildResolutionContext(
      this.state.worldId,
      commandId,
      this.rulesetVersion,
      1,
      this.sequenceCounter,
      this.state.revision + 1,
    );

    const event: DomainEvent = {
      eventId: context.eventIds[0],
      worldId: this.state.worldId,
      roomId,
      sequence: this.sequenceCounter,
      worldRevision: this.state.revision + 1,
      eventType: "PLAYER_ENTERED_ROOM",
      actorId: playerId,
      payload: { playerId, displayName, fromRoomId: null },
      rulesetVersion: this.rulesetVersion,
      occurredAt: context.occurredAt,
    };

    // Projected state: create/refresh the player record + occupant, bump revisions.
    const projected = registerPlayer(
      structuredClone(this.state),
      playerId,
      displayName,
      roomId,
    );
    projected.rooms[roomId].revision += 1;
    projected.revision += 1;

    return this.assembleProposal(commandId, [event], projected);
  }

  /**
   * Propose a player leaving a room (disconnect / departure).
   * Produces a PLAYER_LEFT_ROOM event and marks the player disconnected.
   */
  proposePlayerLeave(
    playerId: string,
    roomId: string,
    commandId: string,
  ): ProposedTransaction | CommandResolution {
    const room = this.state.rooms[roomId];
    const player = this.state.players[playerId];
    if (!room || !player) {
      return { accepted: false, refusal: "TARGET_NOT_FOUND" };
    }

    const context = buildResolutionContext(
      this.state.worldId,
      commandId,
      this.rulesetVersion,
      1,
      this.sequenceCounter,
      this.state.revision + 1,
    );

    const event: DomainEvent = {
      eventId: context.eventIds[0],
      worldId: this.state.worldId,
      roomId,
      sequence: this.sequenceCounter,
      worldRevision: this.state.revision + 1,
      eventType: "PLAYER_LEFT_ROOM",
      actorId: playerId,
      payload: { playerId, displayName: player.displayName, toRoomId: null },
      rulesetVersion: this.rulesetVersion,
      occurredAt: context.occurredAt,
    };

    const projected = applyEvents(structuredClone(this.state), [event]);
    if (projected.players[playerId]) {
      projected.players[playerId].connectionState = "disconnected";
    }
    projected.revision += 1;

    return this.assembleProposal(commandId, [event], projected);
  }

  /**
   * Shared proposal assembler: runs the same pre-flight invariants as
   * proposeCommand (duplicate eventId + sequence continuity) and packages a
   * ProposedTransaction. Used by the presence proposals above.
   */
  private assembleProposal(
    commandId: string,
    events: DomainEvent[],
    projectedState: WorldState,
  ): ProposedTransaction {
    for (const event of events) {
      if (this.appliedEventIds.has(event.eventId)) {
        throw new Error(
          `DUPLICATE_EVENT_ID: ${event.eventId} already applied. ` +
            `This indicates a presence replay or ID collision.`,
        );
      }
    }

    for (let i = 0; i < events.length; i++) {
      const expectedSeq = this.sequenceCounter + i;
      if (events[i].sequence !== expectedSeq) {
        throw new Error(
          `SEQUENCE_GAP: expected ${expectedSeq}, got ${events[i].sequence}`,
        );
      }
    }

    return {
      proposalId: `prop_${commandId}`,
      commandId,
      worldId: this.state.worldId,
      events,
      expectedRevision: this.state.revision,
      resultingRevision: this.state.revision + 1,
      resultingSequence: this.sequenceCounter + events.length,
      projectedState,
    };
  }

  // ─── Test Convenience (bypasses persistence) ─────────────────────────────────

  /**
   * Process a command in one shot (propose + accept).
   * ⚠️ FOR TESTS ONLY. Production code must use the two-phase flow via CommitCoordinator.
   * This exists so that kernel-level tests don't need a database.
   */
  processCommand(command: BoundCommand): CommandResolution {
    const result = this.proposeCommand(command);

    // Refusal path
    if ("accepted" in result && !result.accepted) {
      return result;
    }

    // It's a ProposedTransaction — accept immediately (no persistence)
    const proposal = result as ProposedTransaction;
    this.acceptCommit(proposal);

    return { accepted: true, events: proposal.events };
  }

  // ─── Replay (restart restoration) ────────────────────────────────────────────

  /**
   * Replay events from the ledger (restart restoration).
   * Enforces:
   *   - Contiguous sequence numbers (no gaps)
   *   - No duplicate eventIds
   *   - Monotonic ordering
   */
  replayEvents(events: DomainEvent[]): void {
    for (const event of events) {
      // Reject duplicates
      if (this.appliedEventIds.has(event.eventId)) {
        throw new Error(
          `REPLAY_DUPLICATE: eventId ${event.eventId} already applied at sequence ${event.sequence}`,
        );
      }

      // Reject sequence gaps
      if (event.sequence !== this.sequenceCounter) {
        throw new Error(
          `REPLAY_SEQUENCE_GAP: expected sequence ${this.sequenceCounter}, got ${event.sequence}. ` +
          `Events must be replayed in contiguous order.`,
        );
      }

      this.state = applyEvents(this.state, [event]);
      this.state.revision += 1;
      this.sequenceCounter += 1;
      this.appliedEventIds.add(event.eventId);
    }
  }

  /**
   * Restore session state from a snapshot + replayed events.
   * Used during restart restoration.
   */
  restoreFromSnapshot(snapshotState: WorldState, sequence: number, appliedIds: string[]): void {
    this.state = structuredClone(snapshotState);
    this.sequenceCounter = sequence;
    this.appliedEventIds = new Set(appliedIds);
  }
}

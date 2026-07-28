/**
 * CommitCoordinator — enforces the two-phase commit flow.
 *
 * FLOW (PDR §13, user directive 2026-06-14):
 *   1. WorldSession proposes transaction
 *   2. Persistence validates expected revision
 *   3. Ledger + materialized state commit atomically
 *   4. WorldSession accepts committed state
 *   5. Broadcast occurs (caller handles this via onCommit callback)
 *
 * If the database commit fails, the active session does NOT "believe" the command happened.
 *
 * DEPENDENCY LAW:
 *   This class imports WorldSession (world-runtime) and a PersistencePort interface.
 *   It does NOT import SQLite directly. The concrete adapter is injected.
 */

import type {
  BoundCommand,
  CommandResolution,
  ProposedTransaction,
  CommitResult,
  DomainEvent,
} from "@polaris/contracts";
import { WorldSession } from "./WorldSession.js";

/**
 * PersistencePort — the interface that any persistence adapter must satisfy.
 * SqlitePersistence implements this. A test double can too.
 */
export interface PersistencePort {
  /** Validate expected revision and atomically commit events + state. */
  commitTransaction(proposal: ProposedTransaction): Promise<CommitResult>;
  /** Get the current persisted revision for a world. */
  getWorldRevision(worldId: string): Promise<number | null>;
}

export interface CommitCoordinatorConfig {
  /** Called after a successful commit with the events (for broadcast). */
  onCommit?: (events: DomainEvent[], proposal: ProposedTransaction) => void;
}

export class CommitCoordinator {
  private session: WorldSession;
  private persistence: PersistencePort;
  private config: CommitCoordinatorConfig;

  constructor(
    session: WorldSession,
    persistence: PersistencePort,
    config: CommitCoordinatorConfig = {},
  ) {
    this.session = session;
    this.persistence = persistence;
    this.config = config;
  }

  /**
   * Execute a command through the full two-phase commit flow.
   *
   * Returns:
   *   - CommandResolution (refusal) if the command was rejected by the kernel
   *   - CommitResult (committed: true) if persistence confirmed
   *   - CommitResult (committed: false) if persistence rejected
   *
   * INVARIANT: If committed === false, session state is UNCHANGED.
   */
  async executeCommand(
    command: BoundCommand,
  ): Promise<{ resolution: CommandResolution; commit?: CommitResult }> {
    // Phase 1: Propose (no state mutation)
    const proposalOrRefusal = this.session.proposeCommand(command);
    return this.commitProposal(proposalOrRefusal);
  }

  /**
   * Execute a player joining a room through the full two-phase commit flow.
   * Presence is authoritative + persisted + broadcast just like any command.
   */
  async executePlayerJoin(
    playerId: string,
    displayName: string,
    roomId: string,
    commandId: string,
  ): Promise<{ resolution: CommandResolution; commit?: CommitResult }> {
    const proposalOrRefusal = this.session.proposePlayerJoin(
      playerId,
      displayName,
      roomId,
      commandId,
    );
    return this.commitProposal(proposalOrRefusal);
  }

  /**
   * Execute a player leaving a room through the full two-phase commit flow.
   */
  async executePlayerLeave(
    playerId: string,
    roomId: string,
    commandId: string,
  ): Promise<{ resolution: CommandResolution; commit?: CommitResult }> {
    const proposalOrRefusal = this.session.proposePlayerLeave(
      playerId,
      roomId,
      commandId,
    );
    return this.commitProposal(proposalOrRefusal);
  }

  /**
   * Shared two-phase commit tail:
   *   refusal → return; else persist → (fail: state unchanged) / (ok: accept + broadcast).
   *
   * INVARIANT: If committed === false, session state is UNCHANGED.
   */
  private async commitProposal(
    proposalOrRefusal: ProposedTransaction | CommandResolution,
  ): Promise<{ resolution: CommandResolution; commit?: CommitResult }> {
    // CommandResolution path: either a refusal, or a zero-event accept
    // (LOOK / INVENTORY / EXAMINE produce no events and never touch persistence).
    // A ProposedTransaction always carries a proposalId; a CommandResolution never does.
    if (!("proposalId" in proposalOrRefusal)) {
      return { resolution: proposalOrRefusal as CommandResolution };
    }

    const proposal = proposalOrRefusal as ProposedTransaction;

    // Phase 2: Persistence validates and commits atomically
    const commitResult = await this.persistence.commitTransaction(proposal);

    if (!commitResult.committed) {
      // FAILURE: Session state is UNCHANGED. The command never "happened."
      return {
        resolution: { accepted: true, events: proposal.events },
        commit: commitResult,
      };
    }

    // Phase 3: Session accepts the committed state
    this.session.acceptCommit(proposal);

    // Phase 4: Broadcast (caller handles via callback)
    if (this.config.onCommit) {
      this.config.onCommit(proposal.events, proposal);
    }

    return {
      resolution: { accepted: true, events: proposal.events },
      commit: commitResult,
    };
  }

  /**
   * Get the session (for state reads, scene compilation, etc.)
   */
  getSession(): WorldSession {
    return this.session;
  }
}

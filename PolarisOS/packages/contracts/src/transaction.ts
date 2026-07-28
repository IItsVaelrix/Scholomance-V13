/**
 * ProposedTransaction — the two-phase commit proposal.
 *
 * WorldSession produces this. Persistence validates and commits it.
 * WorldSession accepts it ONLY after persistence confirms.
 *
 * FLOW (PDR §13, user directive 2026-06-14):
 *   WorldSession proposes → persistence validates expected revision →
 *   ledger + materialized state commit atomically →
 *   WorldSession accepts committed state → broadcast occurs
 *
 * If the database commit fails, the session NEVER believes the command happened.
 */

import type { DomainEvent } from "./events.js";
import type { WorldState } from "./world-state.js";

export interface ProposedTransaction {
  /** Unique proposal ID (derived from commandId) */
  proposalId: string;
  /** The command that produced this proposal */
  commandId: string;
  /** World this transaction belongs to */
  worldId: string;
  /** Events to append to the ledger */
  events: DomainEvent[];
  /** The revision the world MUST be at for this to commit (optimistic concurrency) */
  expectedRevision: number;
  /** The revision the world will be at after commit */
  resultingRevision: number;
  /** The sequence counter after this transaction */
  resultingSequence: number;
  /** The full projected state after applying events (for materialized snapshot) */
  projectedState: WorldState;
}

// --- Commit Result ---

export type CommitResult =
  | { committed: true; revision: number; sequence: number }
  | { committed: false; reason: CommitFailureReason };

export type CommitFailureReason =
  | "REVISION_MISMATCH"
  | "DUPLICATE_EVENT_ID"
  | "SEQUENCE_GAP"
  | "WORLD_NOT_FOUND"
  | "DB_ERROR";

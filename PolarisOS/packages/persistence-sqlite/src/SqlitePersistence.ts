/**
 * SqlitePersistence — SQLite WAL adapter implementing PersistencePort.
 *
 * PDR §13: Atomic command transactions, append-only event ledger, restart restoration.
 *
 * FLOW:
 *   1. Validates expected revision matches DB revision (optimistic concurrency)
 *   2. Rejects duplicate eventIds (UNIQUE constraint + pre-check)
 *   3. Appends events to ledger
 *   4. Updates materialized world revision
 *   5. All in ONE atomic transaction
 *
 * If any step fails, the entire transaction rolls back.
 * The session never "believes" a failed command happened.
 *
 * NOTE: This is the adapter boundary. The kernel and runtime never import this directly.
 * They depend on the PersistencePort interface from @polaris/world-runtime.
 */

import type {
  WorldState,
  DomainEvent,
  ProposedTransaction,
  CommitResult,
} from "@polaris/contracts";
import type { PersistencePort } from "@polaris/world-runtime";
import { SCHEMA_SQL } from "./schema.js";

export interface PersistenceConfig {
  dbPath: string;
}

export class SqlitePersistence implements PersistencePort {
  private config: PersistenceConfig;
  private db: any = null; // better-sqlite3 Database instance

  constructor(config: PersistenceConfig) {
    this.config = config;
  }

  /**
   * Initialize database and create schema.
   */
  async initialize(): Promise<void> {
    const Database = (await import("better-sqlite3")).default;
    this.db = new Database(this.config.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_SQL);
  }

  /**
   * Seed a world row (called once at world creation).
   */
  async initializeWorld(worldId: string, rulesetVersion: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    this.db.prepare(`
      INSERT OR IGNORE INTO worlds (world_id, revision, ruleset_version)
      VALUES (?, 0, ?)
    `).run(worldId, rulesetVersion);
  }

  // ─── PersistencePort: commitTransaction ──────────────────────────────────────

  /**
   * Validate expected revision and atomically commit events + state.
   *
   * This is the DURABLE revision authority. If the expected revision doesn't match,
   * the commit is rejected. The session must not advance.
   */
  async commitTransaction(proposal: ProposedTransaction): Promise<CommitResult> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      // Step 1: Validate world exists
      const worldRow = this.db.prepare(
        `SELECT revision FROM worlds WHERE world_id = ?`
      ).get(proposal.worldId);

      if (!worldRow) {
        return { committed: false, reason: "WORLD_NOT_FOUND" };
      }

      // Step 2: Validate expected revision (optimistic concurrency)
      if (worldRow.revision !== proposal.expectedRevision) {
        return { committed: false, reason: "REVISION_MISMATCH" };
      }

      // Step 3: Pre-check for duplicate eventIds
      const checkStmt = this.db.prepare(
        `SELECT event_id FROM domain_events WHERE event_id = ?`
      );
      for (const event of proposal.events) {
        if (checkStmt.get(event.eventId)) {
          return { committed: false, reason: "DUPLICATE_EVENT_ID" };
        }
      }

      // Step 4: Validate sequence continuity
      const lastSeqRow = this.db.prepare(
        `SELECT MAX(sequence) as max_seq FROM domain_events WHERE world_id = ?`
      ).get(proposal.worldId);
      const lastSeq = lastSeqRow?.max_seq ?? -1;
      const expectedFirstSeq = lastSeq + 1;

      if (proposal.events.length > 0 && proposal.events[0].sequence !== expectedFirstSeq) {
        return { committed: false, reason: "SEQUENCE_GAP" };
      }

      // Step 5: Atomic commit — events + revision update in ONE transaction
      const insertEvent = this.db.prepare(`
        INSERT INTO domain_events
          (event_id, world_id, room_id, sequence, world_revision, event_type, actor_id, payload, ruleset_version, occurred_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateWorld = this.db.prepare(`
        UPDATE worlds SET revision = ?, updated_at = datetime('now')
        WHERE world_id = ? AND revision = ?
      `);

      const transaction = this.db.transaction(() => {
        for (const event of proposal.events) {
          insertEvent.run(
            event.eventId,
            event.worldId,
            event.roomId,
            event.sequence,
            event.worldRevision,
            event.eventType,
            event.actorId,
            JSON.stringify(event.payload),
            event.rulesetVersion,
            event.occurredAt,
          );
        }

        // Update revision with optimistic lock (WHERE revision = expected)
        const result = updateWorld.run(
          proposal.resultingRevision,
          proposal.worldId,
          proposal.expectedRevision,
        );

        if (result.changes !== 1) {
          throw new Error("REVISION_CONFLICT");
        }
      });

      transaction();

      return {
        committed: true,
        revision: proposal.resultingRevision,
        sequence: proposal.resultingSequence,
      };
    } catch (err: any) {
      if (err.message === "REVISION_CONFLICT") {
        return { committed: false, reason: "REVISION_MISMATCH" };
      }
      // UNIQUE constraint violation (belt-and-suspenders)
      if (err.message?.includes("UNIQUE constraint failed")) {
        return { committed: false, reason: "DUPLICATE_EVENT_ID" };
      }
      return { committed: false, reason: "DB_ERROR" };
    }
  }

  // ─── PersistencePort: getWorldRevision ───────────────────────────────────────

  async getWorldRevision(worldId: string): Promise<number | null> {
    if (!this.db) throw new Error("Database not initialized");

    const row = this.db.prepare(
      `SELECT revision FROM worlds WHERE world_id = ?`
    ).get(worldId);

    return row ? row.revision : null;
  }

  // ─── Restart Restoration ─────────────────────────────────────────────────────

  /**
   * Load all events for a world in sequence order.
   * Used for full replay restoration.
   */
  async loadAllEvents(worldId: string): Promise<DomainEvent[]> {
    if (!this.db) throw new Error("Database not initialized");

    const rows = this.db.prepare(`
      SELECT * FROM domain_events WHERE world_id = ? ORDER BY sequence ASC
    `).all(worldId);

    return rows.map((row: any) => this.rowToEvent(row));
  }

  /**
   * Load events after a given sequence number (for snapshot + replay restoration).
   * PDR §13.4: "Load events after snapshot sequence, replay remaining events."
   */
  async loadEventsAfter(worldId: string, afterSequence: number): Promise<DomainEvent[]> {
    if (!this.db) throw new Error("Database not initialized");

    const rows = this.db.prepare(`
      SELECT * FROM domain_events WHERE world_id = ? AND sequence >= ? ORDER BY sequence ASC
    `).all(worldId, afterSequence);

    return rows.map((row: any) => this.rowToEvent(row));
  }

  // ─── Snapshots ───────────────────────────────────────────────────────────────

  /**
   * Save a world snapshot at a given sequence point.
   */
  async saveSnapshot(worldId: string, sequence: number, state: WorldState): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    this.db.prepare(`
      INSERT OR REPLACE INTO world_snapshots (snapshot_id, world_id, sequence, state_json)
      VALUES (?, ?, ?, ?)
    `).run(
      `${worldId}_snap_${sequence}`,
      worldId,
      sequence,
      JSON.stringify(state),
    );
  }

  /**
   * Load the latest snapshot for a world.
   */
  async loadLatestSnapshot(worldId: string): Promise<{ sequence: number; state: WorldState } | null> {
    if (!this.db) throw new Error("Database not initialized");

    const row = this.db.prepare(`
      SELECT * FROM world_snapshots WHERE world_id = ? ORDER BY sequence DESC LIMIT 1
    `).get(worldId);

    if (!row) return null;
    return {
      sequence: row.sequence,
      state: JSON.parse(row.state_json),
    };
  }

  /**
   * Full restart restoration:
   *   1. Load latest snapshot (if any)
   *   2. Load events after snapshot sequence
   *   3. Return both for the session to replay
   */
  async restoreWorld(worldId: string): Promise<{
    snapshot: { sequence: number; state: WorldState } | null;
    eventsAfterSnapshot: DomainEvent[];
  }> {
    const snapshot = await this.loadLatestSnapshot(worldId);
    const afterSeq = snapshot ? snapshot.sequence : -1;
    const eventsAfterSnapshot = await this.loadEventsAfter(worldId, afterSeq);

    return { snapshot, eventsAfterSnapshot };
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private rowToEvent(row: any): DomainEvent {
    return {
      eventId: row.event_id,
      worldId: row.world_id,
      roomId: row.room_id,
      sequence: row.sequence,
      worldRevision: row.world_revision,
      eventType: row.event_type,
      actorId: row.actor_id,
      payload: JSON.parse(row.payload),
      rulesetVersion: row.ruleset_version,
      occurredAt: row.occurred_at,
    };
  }
}

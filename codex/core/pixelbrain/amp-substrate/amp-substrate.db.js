/**
 * AMP Activation Substrate — SQLite store for relevance records + activation log.
 *
 * Two tables, one job each:
 *   amp_relevance      which AMP applies to what, checksummed (PB-AMP-RELEVANCE-v1)
 *   amp_activation_log every selection decision, append-only
 *
 * The log is not bookkeeping for its own sake. Today, "why didn't hair-flow-amp
 * run on this asset" can only be answered by finding and reading the right
 * factory file. With the log, it's a query.
 *
 * Migrations run first through the project's synchronous `runSqliteMigrations`
 * helper, exactly as other better-sqlite3 stores do. After that, every runtime
 * statement goes through `createDbWrapper().execute()`, so writes pass the
 * project's SQLite write-serialization queue (codex/server/db/sqliteWriteQueue.js).
 *
 * PDR: docs/scholomance-encyclopedia/PDR-archive/2026-09-04-pixelbrain-amp-activation-substrate-v1-pdr.md
 * @bytecode PB-AMP-RELEVANCE-v1
 */

import Database from 'better-sqlite3';
import { createDbWrapper } from '../../../server/db/persistence.wrapper.js';
import { applySqlitePragmas, runSqliteMigrations } from '../../../server/db/sqlite.migrations.js';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from '../bytecode-error.js';
import { validateAmpRelevance } from './amp-relevance.schema.js';

const MOD = MODULE_IDS.AMP_SUBSTRATE;
export const SUBSTRATE_NAMESPACE = 'amp_substrate';
export const SUBSTRATE_SCHEMA_VERSION = 2;

export const AMP_SUBSTRATE_MIGRATIONS = Object.freeze([
  {
    version: 1,
    name: 'create_amp_relevance_and_activation_log',
    up(db) {
      // One-time migration DDL on the raw handle, before createDbWrapper exists;
      // same allowed shape as codex/server/services/lexiconAbyss.service.js's migration.
      // eslint-disable-next-line no-restricted-syntax
      db.exec(`CREATE TABLE amp_relevance (
     amp_id          TEXT PRIMARY KEY,
     version         TEXT NOT NULL,
     applies_to_json TEXT NOT NULL,
     requires_json   TEXT NOT NULL,
     checksum        TEXT NOT NULL,
     registered_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
   );
   CREATE TABLE amp_activation_log (
     id               INTEGER PRIMARY KEY AUTOINCREMENT,
     spec_checksum    TEXT NOT NULL,
     activated_json   TEXT NOT NULL,
     skipped_json     TEXT NOT NULL,
     selector_version TEXT NOT NULL,
     created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
   );
   CREATE INDEX idx_activation_log_spec ON amp_activation_log (spec_checksum);`);
    },
  },
  {
    version: 2,
    name: 'amp_relevance_v2_pipeline_order_description_concept',
    up(db) {
      // Same sanctioned exception as v1 above: raw DDL on the pre-wrapper handle.
      // eslint-disable-next-line no-restricted-syntax
      db.exec(`DROP TABLE IF EXISTS amp_relevance;
   CREATE TABLE amp_relevance (
     pipeline        TEXT NOT NULL,
     amp_id          TEXT NOT NULL,
     order_index     INTEGER NOT NULL,
     description     TEXT NOT NULL,
     concept         TEXT NOT NULL,
     version         TEXT NOT NULL,
     applies_to_json TEXT NOT NULL,
     requires_json   TEXT NOT NULL,
     checksum        TEXT NOT NULL,
     registered_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (pipeline, amp_id)
   );`);
    },
  },
]);

/**
 * Open (creating and migrating if needed) an AMP substrate database.
 *
 * @param {string} dbPath - file path, or ':memory:' for tests
 * @returns {Promise<object>} the db wrapper (has .execute/.batch/.transaction/.close)
 */
export async function openAmpSubstrate(dbPath) {
  if (typeof dbPath !== 'string' || dbPath.trim() === '') {
    throw new BytecodeError(
      ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, MOD, ERROR_CODES.MISSING_REQUIRED,
      { parameter: 'dbPath', reason: 'openAmpSubstrate requires a path or ":memory:"' },
    );
  }

  const raw = new Database(dbPath);
  applySqlitePragmas(raw);
  runSqliteMigrations(raw, { namespace: SUBSTRATE_NAMESPACE, migrations: AMP_SUBSTRATE_MIGRATIONS });
  const db = createDbWrapper({ type: 'better-sqlite3', db: raw });
  return db;
}

/**
 * Register (or update) one relevance record.
 *
 * Refuses a record whose declared checksum disagrees with its own content —
 * silently recomputing it would defeat the only guarantee this table offers.
 * Refuses a record whose `order` collides with a *different* ampId already
 * registered in the same pipeline, for the same reason: `order` is the
 * conveyor-belt position within a pipeline, and two passes silently sharing a
 * position is exactly the kind of ambiguity a hard error should catch instead
 * of an arbitrary `ORDER BY` tiebreak papering over it.
 */
export async function registerAmpRelevance(db, record) {
  const { ok, errors } = validateAmpRelevance(record);
  if (!ok) {
    throw new BytecodeError(
      ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, MOD, ERROR_CODES.INVALID_VALUE,
      { pipeline: record?.pipeline ?? null, ampId: record?.ampId ?? null, errors },
    );
  }

  const [registered] = await db.transaction(async (tx) => {
    const { rows: collisionRows } = await tx.execute(
      'SELECT amp_id AS ampId FROM amp_relevance WHERE pipeline = ? AND order_index = ? AND amp_id != ?',
      [record.pipeline, record.order, record.ampId],
    );
    const collision = collisionRows?.[0] ?? null;
    if (collision) {
      throw new BytecodeError(
        ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, MOD, ERROR_CODES.INVALID_VALUE,
        {
          pipeline: record.pipeline,
          ampId: record.ampId,
          order: record.order,
          collidesWith: collision.ampId,
          reason: `order ${record.order} is already used by '${collision.ampId}' in pipeline '${record.pipeline}'`,
        },
      );
    }

    await tx.execute(
      `INSERT INTO amp_relevance
         (pipeline, amp_id, order_index, description, concept, version, applies_to_json, requires_json, checksum)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(pipeline, amp_id) DO UPDATE SET
         order_index     = excluded.order_index,
         description     = excluded.description,
         concept         = excluded.concept,
         version         = excluded.version,
         applies_to_json = excluded.applies_to_json,
         requires_json   = excluded.requires_json,
         checksum        = excluded.checksum,
         registered_at   = CURRENT_TIMESTAMP`,
      [
        record.pipeline,
        record.ampId,
        record.order,
        record.description,
        record.concept,
        record.version,
        JSON.stringify(record.appliesTo ?? []),
        JSON.stringify(record.requires ?? []),
        record.checksum,
      ],
    );

    return { pipeline: record.pipeline, ampId: record.ampId, checksum: record.checksum };
  });

  return registered;
}

/**
 * Records for one pipeline (ordered by conveyor-belt position), or — with no
 * filter — every record across every pipeline, ordered by (pipeline, order).
 * Ordering is part of the selector's determinism guarantee, so it belongs here
 * rather than being left to SQLite's default row order.
 */
export async function listAmpRelevance(db, { pipeline } = {}) {
  const selectCols = `pipeline, amp_id AS ampId, order_index AS "order", description, concept,
            version, applies_to_json AS appliesToJson, requires_json AS requiresJson,
            checksum, registered_at AS registeredAt`;
  const { rows } = pipeline
    ? await db.execute(
        `SELECT ${selectCols} FROM amp_relevance WHERE pipeline = ? ORDER BY order_index ASC`,
        [pipeline],
      )
    : await db.execute(
        `SELECT ${selectCols} FROM amp_relevance ORDER BY pipeline ASC, order_index ASC`,
      );
  return rows ?? [];
}

/** One record by (pipeline, ampId), or null. */
export async function getAmpRelevance(db, pipeline, ampId) {
  const { rows } = await db.execute(
    `SELECT pipeline, amp_id AS ampId, order_index AS "order", description, concept,
            version, applies_to_json AS appliesToJson, requires_json AS requiresJson,
            checksum, registered_at AS registeredAt
     FROM amp_relevance WHERE pipeline = ? AND amp_id = ?`,
    [pipeline, ampId],
  );
  return rows?.[0] ?? null;
}

/** Remove one record, scoped to (pipeline, ampId). Returns true if a row was actually deleted. */
export async function unregisterAmpRelevance(db, pipeline, ampId) {
  const result = await db.execute(
    'DELETE FROM amp_relevance WHERE pipeline = ? AND amp_id = ?',
    [pipeline, ampId],
  );
  return (result.rowsAffected ?? 0) > 0;
}

/** Append one activation decision. Called by the selector on every selection. */
export async function appendActivationLog(db, { specChecksum, activated, skipped, selectorVersion }) {
  const result = await db.execute(
    `INSERT INTO amp_activation_log (spec_checksum, activated_json, skipped_json, selector_version)
     VALUES (?, ?, ?, ?)`,
    [specChecksum, JSON.stringify(activated ?? []), JSON.stringify(skipped ?? []), selectorVersion],
  );
  return result.lastInsertRowid ?? null;
}

/** Most recent activation decisions, newest first. */
export async function readActivationLog(db, limit = 20) {
  const { rows } = await db.execute(
    `SELECT id, spec_checksum AS specChecksum, activated_json AS activatedJson,
            skipped_json AS skippedJson, selector_version AS selectorVersion,
            created_at AS createdAt
     FROM amp_activation_log ORDER BY id DESC LIMIT ?`,
    [limit],
  );
  return rows ?? [];
}

/** Counts + the most frequently activated amp, for `npm run amps -- stats`. */
export async function substrateStats(db) {
  const registeredRes = await db.execute('SELECT COUNT(*) AS n FROM amp_relevance');
  const activationsRes = await db.execute('SELECT COUNT(*) AS n FROM amp_activation_log');
  const logRes = await db.execute('SELECT activated_json AS j FROM amp_activation_log');

  const tally = new Map();
  for (const row of logRes.rows ?? []) {
    for (const ampId of JSON.parse(row.j)) tally.set(ampId, (tally.get(ampId) ?? 0) + 1);
  }
  // Ties break alphabetically so `stats` output is reproducible, not arbitrary.
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return {
    registered: Number(registeredRes.rows?.[0]?.n ?? 0),
    activations: Number(activationsRes.rows?.[0]?.n ?? 0),
    mostActivated: ranked.length > 0 ? { ampId: ranked[0][0], count: ranked[0][1] } : null,
  };
}

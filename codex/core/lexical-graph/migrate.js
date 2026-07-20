// codex/core/lexical-graph/migrate.js
// Offline ops write path — exempt from server SQLite write-queue (see .eslintrc).
import { LEXICAL_GRAPH_DDL } from './schema.sql.js';
import { LEXICAL_GRAPH_SCHEMA_VERSION } from './types.js';

/**
 * Creates (or re-creates, idempotently) the lexical-graph overlay tables on
 * an existing scholomance_dict.sqlite database. Never drops or mutates the
 * legacy `entry` / `entry_fts` / `rhyme_index` / `wordnet_*` tables.
 *
 * One transaction: DDL + meta stamp both succeed or both roll back.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ timestamp?: string }} [options]
 */
export function migrateLexicalGraph(db, { timestamp } = {}) {
  if (typeof timestamp !== 'string' || !timestamp.trim()) {
    throw new Error('PB-ERR-v1-VALUE: migrate requires caller timestamp');
  }

  db.pragma('foreign_keys = ON');

  const tx = db.transaction(() => {
    db.exec(LEXICAL_GRAPH_DDL);
    db.prepare(
      `INSERT INTO meta(key, value) VALUES ('lexical_graph_schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(LEXICAL_GRAPH_SCHEMA_VERSION);
  });

  tx();
}

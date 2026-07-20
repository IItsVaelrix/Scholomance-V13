// codex/core/lexical-graph/embedDevices.js
// Offline ops write path — exempt from server SQLite write-queue (see .eslintrc).
//
// Generates TurboQuant embeddings for literary-device nodes that don't have
// one yet (`lexical_entry.embeddings_tq IS NULL`). Writes a complete
// embedding tuple per row (kind, version, dimensions, source, blob) — the
// schema CHECK on lexical_entry forbids a partial tuple. One transaction:
// any failure rolls back every device embedded in this run. See:
// docs/superpowers/specs/2026-07-18-lexical-graph-foundation-design.md
// ("embed-devices").

import { buildDeviceEmbeddingBlob } from './deviceEmbed.js';
import {
  DEVICE_EMBEDDING_KIND,
  DEVICE_EMBEDDING_VERSION,
  DEVICE_EMBEDDING_DIMENSIONS,
} from './types.js';

const EMBEDDING_SOURCE = 'generated_device';

/**
 * Embeds every device node missing a blob. Idempotent: a device that
 * already has `embeddings_tq` is left untouched, so a re-run over an
 * already-embedded catalog is a no-op (and therefore produces byte-identical
 * blobs, since nothing is recomputed).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ timestamp: string }} options
 * @returns {{ embedded: number }}
 */
export function embedDevices(db, { timestamp } = {}) {
  if (typeof timestamp !== 'string' || !timestamp.trim()) {
    throw new Error('PB-ERR-v1-VALUE: embed-devices requires caller timestamp');
  }

  db.pragma('foreign_keys = ON');

  const selectPending = db.prepare(`
    SELECT le.id AS id, le.canonical_text AS canonical_text, ld.definition AS definition
    FROM lexical_entry le
    JOIN literary_device ld ON ld.id = le.id
    WHERE le.type = 'device' AND le.embeddings_tq IS NULL
  `);

  const updateEmbedding = db.prepare(`
    UPDATE lexical_entry
    SET embeddings_tq = @embeddings_tq,
        embedding_kind = @embedding_kind,
        embedding_version = @embedding_version,
        embedding_dimensions = @embedding_dimensions,
        embedding_source = @embedding_source,
        updated_at = @updated_at
    WHERE id = @id
  `);

  const stampMeta = db.prepare(`
    INSERT INTO meta(key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const tx = db.transaction(() => {
    const pending = selectPending.all();

    for (const device of pending) {
      const blob = buildDeviceEmbeddingBlob(device.canonical_text, device.definition);

      updateEmbedding.run({
        id: device.id,
        embeddings_tq: blob,
        embedding_kind: DEVICE_EMBEDDING_KIND,
        embedding_version: DEVICE_EMBEDDING_VERSION,
        embedding_dimensions: DEVICE_EMBEDDING_DIMENSIONS,
        embedding_source: EMBEDDING_SOURCE,
        updated_at: timestamp,
      });
    }

    stampMeta.run('lexical_graph_embedding_kind', DEVICE_EMBEDDING_KIND);
    stampMeta.run('lexical_graph_embedding_version', DEVICE_EMBEDDING_VERSION);
    stampMeta.run('lexical_graph_embedding_dimensions', String(DEVICE_EMBEDDING_DIMENSIONS));

    return { embedded: pending.length };
  });

  return tx();
}

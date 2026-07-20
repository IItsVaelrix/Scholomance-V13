// codex/core/lexical-graph/legacyEmbedding.js
//
// Legacy mirror truthfulness (see docs/superpowers/specs/
// 2026-07-18-lexical-graph-foundation-design.md, "Legacy mirror truthfulness").
//
// No verified turboquant version is published on entry rows today.
// Therefore: do NOT copy entry.embeddings_tq in default mirror (leave NULL),
// and set meta lexical_graph_legacy_embedding_policy = 'omit_unverified'.
// If future meta key turboquant_embedding_version exists and dimensions known,
// copy with kind=legacy_turboquant, version=<verified>, source=copied_from_entry.
//
// Dimensions must NEVER be invented: if a verified version exists but the
// verified dimensions are unknown, the copy is still omitted.

import { LEGACY_EMBEDDING_KIND } from './types.js';

const VERSION_META_KEY = 'turboquant_embedding_version';
const DIMENSIONS_META_KEY = 'turboquant_embedding_dimensions';

function readVerifiedConfig(db) {
  const versionRow = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(VERSION_META_KEY);
  const dimensionsRow = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(DIMENSIONS_META_KEY);

  const version = typeof versionRow?.value === 'string' ? versionRow.value.trim() : '';
  const dimensions = Number(dimensionsRow?.value);

  if (!version || !Number.isInteger(dimensions) || dimensions <= 0) {
    return null;
  }
  return { version, dimensions };
}

/**
 * Resolves the (honest) legacy embedding tuple for one `entry` row, or
 * `null` when the blob must not be copied. Never invents a version or a
 * dimension count.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ embeddings_tq?: Buffer|Uint8Array|null }} entryRow
 * @returns {{ blob: Buffer|Uint8Array, kind: string, version: string, dimensions: number, source: string } | null}
 */
export function resolveLegacyEmbedding(db, entryRow) {
  if (!entryRow?.embeddings_tq) return null;

  const verified = readVerifiedConfig(db);
  if (!verified) return null;

  return {
    blob: entryRow.embeddings_tq,
    kind: LEGACY_EMBEDDING_KIND,
    version: verified.version,
    dimensions: verified.dimensions,
    source: 'copied_from_entry',
  };
}

/**
 * The `lexical_graph_legacy_embedding_policy` meta value for the current run:
 * `'omit_unverified'` by default, or `'verified:<version>'` once a verified
 * turboquant version/dimensions pair is published to `meta`.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {string}
 */
export function legacyEmbeddingPolicy(db) {
  const verified = readVerifiedConfig(db);
  return verified ? `verified:${verified.version}` : 'omit_unverified';
}

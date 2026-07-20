// codex/core/lexical-graph/mirror.js
// Offline ops write path — exempt from server SQLite write-queue (see .eslintrc).
//
// Dual-layer word mirror: `entry` (Lexicon Oracle authority) stays untouched;
// this writes one `lexical_entry` graph node per `entry` row into the
// additive overlay. See docs/superpowers/specs/
// 2026-07-18-lexical-graph-foundation-design.md ("Legacy link", "mirror").

import { canonicalizeLower, wordLexicalId } from './canonicalize.js';
import { syncLexicalEntryFts } from './ftsSync.js';
import { resolveLegacyEmbedding, legacyEmbeddingPolicy } from './legacyEmbedding.js';

function parseJsonArray(json) {
  if (typeof json !== 'string') return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extractGloss(sense) {
  if (!sense || typeof sense !== 'object') return null;
  for (const key of ['glosses', 'raw_glosses', 'definitions']) {
    const list = sense[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === 'string' && item.trim()) return item.trim();
    }
  }
  for (const key of ['definition', 'gloss']) {
    const value = sense[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Maps legacy `entry.senses_json` to `lexical_entry.definitions_json`
 * (`[{ text: gloss }, ...]`), same gloss-extraction precedence as the
 * lexicon adapter. Senses without an extractable gloss are dropped rather
 * than stored as empty text.
 *
 * @param {string} sensesJson
 * @returns {{ text: string }[]}
 */
function buildDefinitions(sensesJson) {
  return parseJsonArray(sensesJson)
    .map(extractGloss)
    .filter((gloss) => typeof gloss === 'string' && gloss.length > 0)
    .map((text) => ({ text }));
}

function buildProvenance(entryRow) {
  const provenance = { source: entryRow.source ?? 'unknown' };
  if (typeof entryRow.source_url === 'string' && entryRow.source_url.trim()) {
    provenance.url = entryRow.source_url;
  }
  return [provenance];
}

function buildPhonemes(entryRow) {
  if (typeof entryRow.ipa !== 'string' || !entryRow.ipa.trim()) return null;
  const phonemes = entryRow.ipa.trim().split(/\s+/).filter(Boolean);
  return phonemes.length > 0 ? phonemes : null;
}

/**
 * Mirrors every `entry` row into `lexical_entry` (`id = le:word:<entry.id>`),
 * one transaction, idempotent (upsert by id). Never writes back into `entry`.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ timestamp: string }} options
 * @returns {{ mirrored: number }}
 */
export function mirrorEntries(db, { timestamp } = {}) {
  if (typeof timestamp !== 'string' || !timestamp.trim()) {
    throw new Error('PB-ERR-v1-VALUE: mirror requires caller timestamp');
  }

  db.pragma('foreign_keys = ON');

  const upsert = db.prepare(`
    INSERT INTO lexical_entry (
      id, type, canonical_text, canonical_lower, entry_id,
      definitions_json, phonemes_json, provenance_json,
      embeddings_tq, embedding_kind, embedding_version, embedding_dimensions, embedding_source,
      created_at, updated_at
    ) VALUES (
      @id, 'word', @canonical_text, @canonical_lower, @entry_id,
      @definitions_json, @phonemes_json, @provenance_json,
      @embeddings_tq, @embedding_kind, @embedding_version, @embedding_dimensions, @embedding_source,
      @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      canonical_text = excluded.canonical_text,
      canonical_lower = excluded.canonical_lower,
      definitions_json = excluded.definitions_json,
      phonemes_json = excluded.phonemes_json,
      provenance_json = excluded.provenance_json,
      embeddings_tq = excluded.embeddings_tq,
      embedding_kind = excluded.embedding_kind,
      embedding_version = excluded.embedding_version,
      embedding_dimensions = excluded.embedding_dimensions,
      embedding_source = excluded.embedding_source,
      updated_at = excluded.updated_at
  `);

  const stampMeta = db.prepare(`
    INSERT INTO meta(key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const tx = db.transaction(() => {
    const entries = db.prepare(`SELECT * FROM entry`).all();
    let mirrored = 0;

    for (const entryRow of entries) {
      const id = wordLexicalId(entryRow.id);
      const embedding = resolveLegacyEmbedding(db, entryRow);
      const phonemes = buildPhonemes(entryRow);

      upsert.run({
        id,
        canonical_text: entryRow.headword,
        canonical_lower: canonicalizeLower(entryRow.headword),
        entry_id: entryRow.id,
        definitions_json: JSON.stringify(buildDefinitions(entryRow.senses_json)),
        phonemes_json: phonemes ? JSON.stringify(phonemes) : null,
        provenance_json: JSON.stringify(buildProvenance(entryRow)),
        embeddings_tq: embedding?.blob ?? null,
        embedding_kind: embedding?.kind ?? null,
        embedding_version: embedding?.version ?? null,
        embedding_dimensions: embedding?.dimensions ?? null,
        embedding_source: embedding?.source ?? null,
        created_at: timestamp,
        updated_at: timestamp,
      });

      syncLexicalEntryFts(db, id);
      mirrored += 1;
    }

    stampMeta.run('lexical_graph_mirrored_at', timestamp);
    stampMeta.run('lexical_graph_legacy_embedding_policy', legacyEmbeddingPolicy(db));

    return { mirrored };
  });

  return tx();
}

import { createHash } from 'node:crypto';
import { MORPHOLOGY_VERSION } from '../lexical-graph/types.js';
import { forwardLemmaForms, normalizeLemmaPos } from './morphology.js';

const COMPLETE_KEYS = Object.freeze([
  'lemma_form_version',
  'lemma_form_source_digest',
  'lemma_form_expected_lemma_count',
  'lemma_form_indexed_lemma_count',
]);

function fail(message) {
  throw new Error(`PB-ERR-v1-VALUE: ${message}`);
}

function tableExists(db, name) {
  return Boolean(db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(name));
}

export function collectLemmaSourcePairs(db) {
  if (!tableExists(db, 'wordnet_lemma') || !tableExists(db, 'entry')) {
    fail('lemma build requires wordnet_lemma and entry sources');
  }

  const raw = db.prepare(`
    SELECT lemma_lower AS lemma, pos FROM wordnet_lemma
    WHERE trim(COALESCE(lemma_lower, '')) != '' AND trim(COALESCE(pos, '')) != ''
    UNION
    SELECT headword_lower AS lemma, pos FROM entry
    WHERE trim(COALESCE(headword_lower, '')) != '' AND trim(COALESCE(pos, '')) != ''
    ORDER BY lemma, pos
  `).all();

  const unique = new Map();
  for (const row of raw) {
    try {
      const lemma = String(row.lemma).normalize('NFC').trim().toLocaleLowerCase('en-US');
      const pos = normalizeLemmaPos(row.pos);
      unique.set(`${lemma}\u0000${pos}`, { lemma, pos });
    } catch (error) {
      if (!String(error?.message ?? '').includes('unsupported lemma POS')) throw error;
    }
  }
  return [...unique.values()].sort(
    (left, right) => left.lemma.localeCompare(right.lemma) || left.pos.localeCompare(right.pos),
  );
}

export function computeLemmaSourceDigest(pairs) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify({ version: MORPHOLOGY_VERSION, pairs }), 'utf8')
    .digest('hex')}`;
}

function upsertMeta(db, key, value) {
  // Offline CLI transaction: no server request can race this build.
  // eslint-disable-next-line no-restricted-syntax
  db.prepare(`
    INSERT INTO meta(key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

function readState(db) {
  const rows = db.prepare(`
    SELECT key, value FROM meta WHERE key LIKE 'lemma_form_%'
  `).all();
  const meta = new Map(rows.map((row) => [row.key, row.value]));
  return Object.freeze({
    version: meta.get('lemma_form_version') ?? '',
    status: meta.get('lemma_form_status') ?? 'partial',
    sourceDigest: meta.get('lemma_form_source_digest') ?? '',
    expectedLemmaCount: Number(meta.get('lemma_form_expected_lemma_count') ?? 0),
    indexedLemmaCount: Number(meta.get('lemma_form_indexed_lemma_count') ?? 0),
  });
}

/**
 * Builds the inverse lemma relation offline. The preflight partial marker is
 * committed separately so interruption can never leave a stale complete claim.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{timestamp?: string}} [options]
 */
export function buildLemmaForms(db, { timestamp } = {}) {
  if (typeof timestamp !== 'string' || !timestamp.trim()) {
    fail('build-lemma-forms requires caller timestamp');
  }
  if (!tableExists(db, 'meta') || !tableExists(db, 'lemma_form')) {
    fail('lemma build requires migrated meta and lemma_form tables');
  }

  db.transaction(() => {
    upsertMeta(db, 'lemma_form_status', 'partial');
    // Offline CLI transaction: this preflight marker must commit synchronously.
    // eslint-disable-next-line no-restricted-syntax
    db.prepare(`
      DELETE FROM meta WHERE key IN (${COMPLETE_KEYS.map(() => '?').join(',')})
    `).run(...COMPLETE_KEYS);
  })();

  const pairs = collectLemmaSourcePairs(db);
  const sourceDigest = computeLemmaSourceDigest(pairs);

  const edges = pairs.flatMap(({ lemma, pos }) => forwardLemmaForms(lemma, pos));
  const insert = db.prepare(`
    INSERT INTO lemma_form (
      surface_lower, lemma_lower, pos, transform_id, source,
      irregular, morphological_confidence
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    // Offline CLI transaction: the inverse index is replaced atomically.
    // eslint-disable-next-line no-restricted-syntax
    db.prepare('DELETE FROM lemma_form').run();
    for (const row of edges) {
      insert.run(
        row.surface,
        row.lemma,
        row.pos,
        row.transformId,
        row.source,
        row.irregular ? 1 : 0,
        row.morphologicalConfidence,
      );
    }
    const persisted = db.prepare('SELECT COUNT(*) AS count FROM lemma_form').get().count;
    if (persisted !== edges.length) {
      throw new Error(`PB-ERR-v1-STATE: lemma edge count mismatch ${persisted}/${edges.length}`);
    }
  })();

  db.transaction(() => {
    upsertMeta(db, 'lemma_form_version', MORPHOLOGY_VERSION);
    upsertMeta(db, 'lemma_form_source_digest', sourceDigest);
    upsertMeta(db, 'lemma_form_expected_lemma_count', pairs.length);
    upsertMeta(db, 'lemma_form_indexed_lemma_count', pairs.length);
    upsertMeta(db, 'lemma_form_status', 'complete');
  })();

  return readState(db);
}

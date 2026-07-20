import Database from 'better-sqlite3';
import {
  collectLemmaSourcePairs,
  computeLemmaSourceDigest,
} from '../../core/lexical-analysis/buildLemmaForms.js';
import { normalizeLemmaPos } from '../../core/lexical-analysis/morphology.js';
import { MORPHOLOGY_VERSION } from '../../core/lexical-graph/types.js';

const REQUIRED_MANIFEST_KEYS = Object.freeze([
  'lemma_form_version',
  'lemma_form_status',
  'lemma_form_source_digest',
  'lemma_form_expected_lemma_count',
  'lemma_form_indexed_lemma_count',
]);

const POS_CODES = Object.freeze({
  noun: Object.freeze(['n']),
  verb: Object.freeze(['v']),
  adjective: Object.freeze(['a', 's']),
  adverb: Object.freeze(['r']),
});

const unavailableState = (reason) => Object.freeze({
  version: '',
  status: 'unavailable',
  sourceDigest: '',
  expectedLemmaCount: 0,
  indexedLemmaCount: 0,
  reason,
});

function normalizeText(value) {
  return typeof value === 'string'
    ? value.normalize('NFC').trim().toLocaleLowerCase('en-US')
    : '';
}

function tableExists(db, name) {
  return Boolean(db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(name));
}

function parseExamples(value) {
  try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function createUnavailableAdapter(reason, logger) {
  logger.warn?.({ reason }, '[LemmaAdapter] inverse morphology unavailable');
  const state = unavailableState(reason);
  return {
    lookupForms() { return []; },
    getIndexState() { return state; },
    lookupSenses() { return []; },
    getCorpusFrequencies() { return new Map(); },
    close() {},
    __unsafe: Object.freeze({ connected: false, reason }),
  };
}

export function createLemmaAdapter(dbPath, options = {}) {
  const logger = options.log ?? console;
  if (!dbPath) return createUnavailableAdapter('database path missing', logger);

  let db;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma('query_only = ON');
  } catch (error) {
    return createUnavailableAdapter(error.message, logger);
  }

  if (!tableExists(db, 'lemma_form') || !tableExists(db, 'meta')) {
    db.close();
    return createUnavailableAdapter('lemma_form table or meta table missing', logger);
  }

  const lookupFormsStatement = db.prepare(`
    SELECT
      surface_lower,
      lemma_lower,
      pos,
      transform_id,
      source,
      irregular,
      morphological_confidence
    FROM lemma_form
    WHERE surface_lower = ?
    ORDER BY lemma_lower, pos, transform_id, source
    LIMIT 128
  `);
  const readManifestStatement = db.prepare(`
    SELECT key, value FROM meta WHERE key LIKE 'lemma_form_%'
  `);

  const hasSenseTables = tableExists(db, 'wordnet_lemma') && tableExists(db, 'wordnet_synset');
  const sensesByPos = hasSenseTables ? new Map(Object.entries(POS_CODES).map(([pos, codes]) => {
    const placeholders = codes.map(() => '?').join(',');
    return [pos, db.prepare(`
      SELECT
        l.synset_id,
        s.definition,
        s.examples_json,
        s.source,
        s.source_url
      FROM wordnet_lemma l
      JOIN wordnet_synset s ON s.id = l.synset_id
      WHERE l.lemma_lower = ? AND l.pos IN (${placeholders})
      ORDER BY COALESCE(l.sense_rank, 2147483647), l.synset_id
      LIMIT 64
    `)];
  })) : new Map();

  const hasCorpusFrequency = tableExists(db, 'rhyme_index') && Boolean(db.prepare(`
    SELECT 1 FROM pragma_table_info('rhyme_index') WHERE name = 'corpus_freq'
  `).get());
  const frequencyStatement = hasCorpusFrequency
    ? db.prepare('SELECT corpus_freq FROM rhyme_index WHERE word_lower = ?')
    : null;

  function lookupForms(surface) {
    const normalized = normalizeText(surface);
    if (!normalized) return [];
    return lookupFormsStatement.all(normalized).map((row) => ({
      surface: row.surface_lower,
      lemma: row.lemma_lower,
      pos: row.pos,
      transformId: row.transform_id,
      source: row.source,
      irregular: row.irregular === 1,
      morphologicalConfidence: Number(row.morphological_confidence),
    }));
  }

  function getIndexState() {
    const rows = readManifestStatement.all();
    const meta = new Map(rows.map((row) => [row.key, row.value]));
    if (REQUIRED_MANIFEST_KEYS.some((key) => !meta.has(key))) {
      return unavailableState('morphology manifest missing');
    }

    const expectedLemmaCount = Number(meta.get('lemma_form_expected_lemma_count'));
    const indexedLemmaCount = Number(meta.get('lemma_form_indexed_lemma_count'));
    const claimedStatus = meta.get('lemma_form_status');
    let healthy = claimedStatus === 'complete'
      && meta.get('lemma_form_version') === MORPHOLOGY_VERSION
      && Number.isInteger(expectedLemmaCount)
      && expectedLemmaCount >= 0
      && indexedLemmaCount === expectedLemmaCount;
    let reason = healthy ? '' : 'morphology manifest incomplete or incompatible';

    if (healthy) {
      try {
        const pairs = collectLemmaSourcePairs(db);
        healthy = pairs.length === expectedLemmaCount
          && computeLemmaSourceDigest(pairs) === meta.get('lemma_form_source_digest');
        if (!healthy) reason = 'morphology source digest or count is stale';
      } catch (error) {
        healthy = false;
        reason = error.message;
      }
    }

    return Object.freeze({
      version: meta.get('lemma_form_version') ?? '',
      status: healthy ? 'complete' : 'partial',
      sourceDigest: meta.get('lemma_form_source_digest') ?? '',
      expectedLemmaCount: Number.isFinite(expectedLemmaCount) ? expectedLemmaCount : 0,
      indexedLemmaCount: Number.isFinite(indexedLemmaCount) ? indexedLemmaCount : 0,
      ...(reason ? { reason } : {}),
    });
  }

  function lookupSenses(lemma, pos) {
    const normalizedLemma = normalizeText(lemma);
    if (!normalizedLemma || !hasSenseTables) {
      return [];
    }
    let canonicalPos;
    try {
      canonicalPos = normalizeLemmaPos(pos);
    } catch {
      return [];
    }
    const codes = POS_CODES[canonicalPos];
    return sensesByPos.get(canonicalPos).all(normalizedLemma, ...codes).map((row) => ({
      synsetId: row.synset_id,
      definition: row.definition ?? '',
      examples: parseExamples(row.examples_json),
      source: row.source,
      sourceUrl: row.source_url ?? undefined,
    }));
  }

  function getCorpusFrequencies(lemmas) {
    if (!frequencyStatement || !Array.isArray(lemmas)) return new Map();
    const normalized = [...new Set(lemmas.map(normalizeText).filter(Boolean))].sort();
    return new Map(normalized.map((lemma) => {
      const row = frequencyStatement.get(lemma);
      return [lemma, row ? Number(row.corpus_freq) || 0 : 0];
    }));
  }

  logger.info?.({ dbPath }, '[LemmaAdapter] Connected to inverse morphology index.');
  return {
    lookupForms,
    getIndexState,
    lookupSenses,
    getCorpusFrequencies,
    close() { db.close(); },
    __unsafe: Object.freeze({ connected: true, dbPath }),
  };
}

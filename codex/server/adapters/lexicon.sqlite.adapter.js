import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import path from 'path';
import { resolveDatabasePath } from '../utils/pathResolution.js';
import { slantRhymeKeys } from '../../core/phonology/rhymeDomain.js';
import { BytecodeHealth, HEALTH_CODES, encodeModuleHealth } from '../../core/diagnostic/BytecodeHealth.js';

const DEFAULT_LOOKUP_LIMIT = 5;
const DEFAULT_SEARCH_LIMIT = 20;
const DEFAULT_SUGGEST_LIMIT = 20;
const DEFAULT_RHYME_LIMIT = 50;
const MAX_LIMIT = 100;

function normalizeWord(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function toBoundedLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_LIMIT);
}

function parseJsonArray(value) {
  if (!value || typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extractGloss(senses) {
  if (!Array.isArray(senses)) return null;
  for (const sense of senses) {
    if (!sense || typeof sense !== 'object') continue;
    for (const key of ['glosses', 'raw_glosses', 'definitions']) {
      const list = sense[key];
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (typeof item === 'string' && item.trim()) {
          return item.trim();
        }
      }
    }
    for (const key of ['definition', 'gloss']) {
      const value = sense[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }
  return null;
}

function normalizeEntry(row) {
  const senses = parseJsonArray(row.senses_json);
  return {
    id: row.id,
    headword: row.headword,
    pos: row.pos,
    pronunciation: row.pronunciation,
    etymology: row.etymology,
    senses,
    source: row.source,
    sourceUrl: row.source_url,
    embeddings_tq: row.embeddings_tq,
  };
}

function sanitizeFtsQuery(raw) {
  const query = String(raw ?? '').trim();
  if (!query) return '';
  const strippedOperators = query
    .replace(/\b(?:AND|OR|NOT|NEAR)\b/gi, ' ')
    .replace(/["'*:^(){}[\]|+\-~\\/<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normalized = strippedOperators
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/gi, ''))
    .filter(Boolean)
    .join(' ');
  return normalized;
}

function createEmptyAdapter(resolvedPath, logger) {
  const emptyRhyme = Object.freeze({ family: null, words: [] });
  const logWait = () => logger.warn?.(`[LexiconAdapter] Dictionary DB not ready at ${resolvedPath}. Lexicon routes will return empty results.`);
  
  return {
    lookupWord() { logWait(); return []; },
    lookupRhymes() { logWait(); return emptyRhyme; },
    batchLookupFamilies() { logWait(); return {}; },
    batchValidateWords() { logWait(); return []; },
    batchLookupPos() { logWait(); return {}; },
    searchEntries() { logWait(); return []; },
    suggestEntries() { logWait(); return []; },
    lookupSynonyms() { logWait(); return []; },
    lookupAntonyms() { logWait(); return []; },
    lookupRelated() { logWait(); return { broader: [], narrower: [], akin: [] }; },
    lookupSymbolsLoose() { logWait(); return []; },
    close() {},
    __unsafe: {
      connected: false,
      dbPath: resolvedPath,
    },
  };
}

export function createLexiconAdapter(dbPath, options = {}) {
  const logger = options.log ?? console;
  if (!dbPath) {
    return createEmptyAdapter(null, logger);
  }
  const resolvedPath = resolveDatabasePath(dbPath, 'scholomance_dict.sqlite');

  let db = null;
  let stmts = null;
  let reconnectCount = 0;
  let hasCorpusFreqColumn = false;
  let healthLog = [];
  const familyBatchStmtCache = new Map();
  const validateBatchStmtCache = new Map();
  const posBatchStmtCache = new Map();

  function emitHealth(checkId, context = {}) {
    const h = encodeModuleHealth(resolvedPath, 'CONNECTION_HEALTH', checkId, context);
    healthLog.push(h);
    logger.info?.({ bytecode: h.bytecode, checksum: h.checksum }, `[LexiconAdapter] ${checkId}`);
    return h;
  }

  /** Close stale handle before replacement — prevents recursive handle leak */
  function closeStale() {
    if (!db) return false;
    try {
      if (db.open) db.close();
      return true;
    } catch {
      return false;
    }
  }

  function tryConnect() {
    if (db && db.open) return true;
    if (!resolvedPath || !existsSync(resolvedPath)) return false;

    // If db exists but is not open, close the stale handle first
    if (db) {
      reconnectCount++;
      const hadStale = closeStale();
      emitHealth('RECONNECT', {
        reconnectCount,
        hadStaleHandle: hadStale,
        prevDbExists: true,
      });
    }

    try {
      db = new Database(resolvedPath, { readonly: true, fileMustExist: true });
      db.pragma('query_only = ON');
      db.pragma('busy_timeout = 5000');

      emitHealth('CONNECTED', { reconnectCount });

      // corpus_freq is added by scripts/backfill_rhyme_corpus_freq.js. A dict DB
      // built before that script exists is still serviceable, so probe for the
      // column rather than assuming it.
      hasCorpusFreqColumn = db
        .prepare("SELECT COUNT(*) AS n FROM pragma_table_info('rhyme_index') WHERE name = 'corpus_freq'")
        .get().n > 0;
      const hasCorpusFreq = hasCorpusFreqColumn;

      if (!hasCorpusFreq) {
        logger.warn?.(
          { dbPath: resolvedPath },
          '[LexiconAdapter] rhyme_index.corpus_freq is missing; rhymes fall back to length ordering and will surface unattested CMUdict headwords. Run: node scripts/backfill_rhyme_corpus_freq.js',
        );
      }

      stmts = {
        lookupEntries: db.prepare(`
          SELECT id, headword, pos, ipa AS pronunciation, etymology, senses_json, source, source_url, embeddings_tq
          FROM entry
          WHERE headword_lower = ?
          LIMIT ?
        `),
        lookupRhymeFamily: db.prepare(`
          SELECT rhyme_family, rhyme_key, ipa AS pronunciation
          FROM rhyme_index
          LEFT JOIN entry ON entry.headword_lower = rhyme_index.word_lower
          WHERE word_lower = ?
        `),
        // Group by rhyme_key (vowel family + coda, e.g. "U-N") — NOT rhyme_family,
        // which is only the bare vowel family ("U") and lumps ~14k unrelated words
        // into one bucket, surfacing them alphabetically ("aaron, abduct, ...").
        //
        // Order by corpus_freq first. rhyme_index is derived from CMUdict, which
        // carries pronunciations for surnames and abbreviations with no meaning
        // ("dold", "nold", "vold"). Those are short, so ordering by LENGTH alone
        // floated them above every real rhyme. Attestation (a WordNet lemma or a
        // gloss) cannot be the signal either: "told" is an irregular past tense
        // with neither, and it is one of the best rhymes for "bold". Only actual
        // usage separates the two, so the ordering key is the word's sentence
        // count in scholomance_corpus.sqlite. LENGTH/alpha remain as tie-breakers
        // to keep results deterministic within a frequency band.
        //
        // Once rhyme_key became the true rhyme domain the buckets got SMALLER and
        // correct, which exposed a second problem: a word with few real rhymes
        // ("love" has 7) padded its list with CMUdict surnames — godlove, manlove,
        // labove. Ranking alone could not push them off a 10-item list out of a
        // 24-word bucket, so unattested candidates are excluded outright here.
        // lookupRhymesAny is the fallback for a word whose ONLY rhymes are absent
        // from the corpus; returning something rare beats returning nothing.
        lookupRhymes: db.prepare(`
          SELECT word_lower
          FROM rhyme_index
          WHERE rhyme_key = ? AND word_lower != ?
          ${hasCorpusFreq ? 'AND corpus_freq > 0' : ''}
          ORDER BY ${hasCorpusFreq ? 'corpus_freq DESC, ' : ''}LENGTH(word_lower) ASC, word_lower ASC
          LIMIT ?
        `),
        lookupRhymesAny: db.prepare(`
          SELECT word_lower
          FROM rhyme_index
          WHERE rhyme_key = ? AND word_lower != ?
          ORDER BY ${hasCorpusFreq ? 'corpus_freq DESC, ' : ''}LENGTH(word_lower) ASC, word_lower ASC
          LIMIT ?
        `),
        // Slant rhyme = the SAME rhyme tail with a DIFFERENT nucleus. rhyme_key is
        // "<family>-<rest>", so a slant shares the <rest> and differs in <family>:
        // blood (AH-D) slants with good (UH-D) and food (UW-D); bold (OW-LD) with
        // fooled (UW-LD). This is the definition of a near rhyme, and it is now
        // COMPUTABLE from the rhyme domain rather than begged from Datamuse — whose
        // near-rhyme channel returned "strid", "scrid", "clwyd", "clsid" for blood.
        // Attested-only, ranked by usage, same as the perfect-rhyme query.
        // Axis 1 — NUCLEUS substitution: same tail, different vowel.
        lookupSlantRhymes: db.prepare(`
          SELECT word_lower
          FROM rhyme_index
          WHERE rhyme_key LIKE ('%-' || ?)
            AND rhyme_key != ?
            AND word_lower != ?
            ${hasCorpusFreq ? 'AND corpus_freq > 0' : ''}
          ORDER BY ${hasCorpusFreq ? 'corpus_freq DESC, ' : ''}LENGTH(word_lower) ASC, word_lower ASC
          LIMIT ?
        `),
        // Axis 2 — CODA substitution: same vowel, a neighbouring consonant. The
        // candidate keys are computed by rhymeDomain.slantRhymeKeys (voiced
        // fricatives interchange, voicing pairs interchange), so this just fetches
        // them. Without this axis "believe" (IY-V) could never reach "Socrates"
        // (IY-Z) — the most common slant move in rap was unreachable by construction.
        lookupSlantByCoda: db.prepare(`
          SELECT word_lower
          FROM rhyme_index
          WHERE rhyme_key IN (SELECT value FROM json_each(?))
            AND word_lower != ?
            ${hasCorpusFreq ? 'AND corpus_freq > 0' : ''}
          ORDER BY ${hasCorpusFreq ? 'corpus_freq DESC, ' : ''}LENGTH(word_lower) ASC, word_lower ASC
          LIMIT ?
        `),
        lookupSynonyms: db.prepare(`
          SELECT l2.lemma AS lemma, l2.pos AS pos
          FROM wordnet_lemma l1
          JOIN wordnet_lemma l2 ON l1.synset_id = l2.synset_id
          WHERE l1.lemma_lower = ?
          LIMIT ?
        `),
        lookupAntonyms: db.prepare(`
          SELECT l2.lemma AS lemma, l2.pos AS pos
          FROM wordnet_lemma l1
          JOIN wordnet_rel r ON l1.synset_id = r.synset_id
          JOIN wordnet_lemma l2 ON r.target_synset_id = l2.synset_id
          WHERE l1.lemma_lower = ? AND r.rel = 'antonym'
          LIMIT ?
        `),
        lookupRelated: db.prepare(`
          SELECT r.rel AS rel, l2.lemma AS lemma, l2.pos AS pos
          FROM wordnet_lemma l1
          JOIN wordnet_rel r ON l1.synset_id = r.synset_id
          JOIN wordnet_lemma l2 ON r.target_synset_id = l2.synset_id
          WHERE l1.lemma_lower = ? AND r.rel IN ('hypernym','hyponym','similar')
          LIMIT ?
        `),
        lookupSymbolsLoose: db.prepare(`
          SELECT r.rel AS rel, l2.lemma AS lemma, l2.pos AS pos
          FROM wordnet_lemma l1
          JOIN wordnet_rel r ON l1.synset_id = r.synset_id
          JOIN wordnet_lemma l2 ON r.target_synset_id = l2.synset_id
          WHERE l1.lemma_lower = ? AND r.rel IN ('has_domain_topic','domain_topic','exemplifies','is_exemplified_by')
          LIMIT ?
        `),
        searchEntries: db.prepare(`
          SELECT e.id, e.headword, e.pos, e.ipa AS pronunciation, e.etymology, e.senses_json, e.source, e.source_url
          FROM entry_fts f
          JOIN entry e ON e.id = f.rowid
          WHERE entry_fts MATCH ?
          LIMIT ?
        `),
        suggestEntries: db.prepare(`
          SELECT headword, pos
          FROM entry
          WHERE headword_lower LIKE ?
          LIMIT ?
        `),
        wordFrequency: hasCorpusFreq
          ? db.prepare('SELECT corpus_freq FROM rhyme_index WHERE word_lower = ?')
          : null,
      };
      
      logger.info?.({ dbPath: resolvedPath }, '[LexiconAdapter] Connected to dictionary DB.');
      return true;
    } catch (error) {
      logger.warn?.({ err: error.message, dbPath: resolvedPath }, '[LexiconAdapter] Failed to open dictionary DB.');
      return false;
    }
  }

  // Initial connection attempt
  tryConnect();

  function lookupWord(word, limit = DEFAULT_LOOKUP_LIMIT) {
    if (!tryConnect()) return [];
    const normalized = normalizeWord(word);
    if (!normalized) return [];
    const boundedLimit = toBoundedLimit(limit, DEFAULT_LOOKUP_LIMIT);
    const rows = stmts.lookupEntries.all(normalized, boundedLimit);
    return rows.map(normalizeEntry);
  }

  /**
   * Corpus sentence-frequency for each word, from rhyme_index.corpus_freq.
   * A word with 0 occurrences across the 115k-sentence corpus is almost always a
   * CMUdict surname or abbreviation ("dold", "olde", "golde") rather than a word
   * anyone can use in a line. Callers rank or filter on this.
   *
   * Returns an empty Map on a pre-migration DB, which callers must read as "no
   * frequency signal available" — never as "every word is unattested".
   */
  function getCorpusFrequencies(words) {
    if (!tryConnect() || !hasCorpusFreqColumn) return new Map();
    const normalized = [...new Set((Array.isArray(words) ? words : [])
      .map(normalizeWord)
      .filter(Boolean))];
    if (normalized.length === 0) return new Map();

    const frequencies = new Map();
    for (const word of normalized) {
      const row = stmts.wordFrequency.get(word);
      frequencies.set(word, row ? Number(row.corpus_freq) || 0 : 0);
    }
    return frequencies;
  }

  /**
   * Near rhymes along BOTH axes:
   *
   *   1. nucleus substitution — same tail, different vowel: blood ~ good, food
   *   2. coda substitution    — same vowel, neighbouring consonant: believe ~ Socrates
   *
   * Axis 2 needs the word's phonemes (to compute the substitutable coda keys), and
   * entry.ipa carries them. Both axes are attested-only and usage-ranked, then
   * interleaved so neither one starves the other on a short list.
   */
  function lookupSlantRhymes(word, limit = DEFAULT_RHYME_LIMIT) {
    if (!tryConnect()) return [];
    const normalized = normalizeWord(word);
    if (!normalized) return [];
    const familyRow = stmts.lookupRhymeFamily.get(normalized);
    const key = familyRow?.rhyme_key;
    if (!key) return [];

    const boundedLimit = toBoundedLimit(limit, DEFAULT_RHYME_LIMIT);

    // Axis 1: "AH-D" -> rest "D". A key with no separator cannot be slanted.
    const dash = key.indexOf('-');
    const rest = dash >= 0 ? key.slice(dash + 1) : '';
    const byNucleus = rest
      ? stmts.lookupSlantRhymes.all(rest, key, normalized, boundedLimit).map((r) => r.word_lower)
      : [];

    // Axis 2: needs the pronunciation to know which codas may stand in.
    let byCoda = [];
    const pron = stmts.lookupEntries.get?.(normalized, 1)?.pronunciation
      ?? stmts.lookupEntries.all(normalized, 1)[0]?.pronunciation;
    if (typeof pron === 'string' && pron.trim()) {
      const phones = pron.trim().split(/\s+/).filter(Boolean);
      const codaKeys = slantRhymeKeys(phones);
      if (codaKeys.length > 0) {
        byCoda = stmts.lookupSlantByCoda
          .all(JSON.stringify(codaKeys), normalized, boundedLimit)
          .map((r) => r.word_lower);
      }
    }

    // Interleave so a long nucleus list cannot crowd the coda axis off the page.
    const merged = [];
    const seen = new Set();
    for (let i = 0; i < Math.max(byCoda.length, byNucleus.length); i += 1) {
      for (const value of [byCoda[i], byNucleus[i]]) {
        if (!value || seen.has(value)) continue;
        seen.add(value);
        merged.push(value);
        if (merged.length >= boundedLimit) return merged;
      }
    }
    return merged;
  }

  function lookupRhymes(word, limit = DEFAULT_RHYME_LIMIT) {
    if (!tryConnect()) return { family: null, words: [] };
    const normalized = normalizeWord(word);
    if (!normalized) return { family: null, words: [] };
    const familyRow = stmts.lookupRhymeFamily.get(normalized);
    if (!familyRow?.rhyme_key) {
      return { family: null, words: [] };
    }
    const boundedLimit = toBoundedLimit(limit, DEFAULT_RHYME_LIMIT);
    let rows = stmts.lookupRhymes.all(familyRow.rhyme_key, normalized, boundedLimit);
    if (rows.length === 0) {
      // Every rhyme for this word is absent from the corpus. Rare beats empty.
      rows = stmts.lookupRhymesAny.all(familyRow.rhyme_key, normalized, boundedLimit);
    }
    return {
      family: familyRow.rhyme_family,
      words: rows.map((row) => row.word_lower),
    };
  }

  function batchLookupFamilies(words) {
    if (!tryConnect()) return {};
    const normalized = [...new Set((Array.isArray(words) ? words : [])
      .map(normalizeWord)
      .filter(Boolean))];
    if (normalized.length === 0) return {};
    const placeholderCount = normalized.length;
    let statement = familyBatchStmtCache.get(placeholderCount);
    if (!statement) {
      const placeholders = normalized.map(() => '?').join(', ');
      statement = db.prepare(`
        SELECT word_lower, rhyme_family, ipa AS pronunciation
        FROM rhyme_index
        LEFT JOIN entry ON entry.headword_lower = rhyme_index.word_lower
        WHERE word_lower IN (${placeholders})
      `);
      familyBatchStmtCache.set(placeholderCount, statement);
    }
    const rows = statement.all(...normalized);
    const out = {};
    for (const row of rows) {
      if (!row?.word_lower || !row?.rhyme_family) continue;
      out[row.word_lower.toUpperCase()] = {
        family: row.rhyme_family,
        phonemes: row.pronunciation ? row.pronunciation.split(' ') : null,
      };
    }
    return out;
  }

  function batchValidateWords(words) {
    if (!tryConnect()) return [];
    const normalized = [...new Set((Array.isArray(words) ? words : [])
      .map(normalizeWord)
      .filter(Boolean))].sort();
    if (normalized.length === 0) return [];
    const placeholderCount = normalized.length;
    let statement = validateBatchStmtCache.get(placeholderCount);
    if (!statement) {
      const placeholders = normalized.map(() => '?').join(', ');
      statement = db.prepare(`
        SELECT DISTINCT headword_lower
        FROM entry
        WHERE headword_lower IN (${placeholders})
      `);
      validateBatchStmtCache.set(placeholderCount, statement);
    }
    const rows = statement.all(...normalized);
    return rows
      .map((row) => row?.headword_lower)
      .filter((word) => typeof word === 'string' && word.length > 0);
  }

  function batchLookupPos(words) {
    if (!tryConnect()) return {};
    const normalized = [...new Set((Array.isArray(words) ? words : [])
      .map(normalizeWord)
      .filter(Boolean))].sort();
    if (normalized.length === 0) return {};
    const placeholderCount = normalized.length;
    let statement = posBatchStmtCache.get(placeholderCount);
    if (!statement) {
      const placeholders = normalized.map(() => '?').join(', ');
      statement = db.prepare(`
        SELECT lemma_lower, pos
        FROM wordnet_lemma
        WHERE lemma_lower IN (${placeholders}) AND pos IS NOT NULL
      `);
      posBatchStmtCache.set(placeholderCount, statement);
    }
    const rows = statement.all(...normalized);
    const sets = new Map();
    for (const row of rows) {
      if (!row?.lemma_lower || typeof row.pos !== 'string' || !row.pos.trim()) continue;
      if (!sets.has(row.lemma_lower)) sets.set(row.lemma_lower, new Set());
      sets.get(row.lemma_lower).add(row.pos.trim());
    }
    const out = {};
    for (const [wordLower, posSet] of sets) out[wordLower] = [...posSet].sort();
    return out;
  }

  function lookupSynonyms(word, limit = 20) {
    if (!tryConnect()) return [];
    const normalized = normalizeWord(word);
    if (!normalized) return [];
    const boundedLimit = toBoundedLimit(limit + 10, 30);
    const rows = stmts.lookupSynonyms.all(normalized, boundedLimit);
    return sanitizeLemmaRows(rows, normalized, limit);
  }

  function lookupAntonyms(word, limit = 20) {
    if (!tryConnect()) return [];
    const normalized = normalizeWord(word);
    if (!normalized) return [];
    const boundedLimit = toBoundedLimit(limit + 10, 30);
    const rows = stmts.lookupAntonyms.all(normalized, boundedLimit);
    return sanitizeLemmaRows(rows, normalized, limit);
  }

  function lookupRelated(word, limit = 20) {
    if (!tryConnect()) return { broader: [], narrower: [], akin: [] };
    const normalized = normalizeWord(word);
    if (!normalized) return { broader: [], narrower: [], akin: [] };
    const boundedLimit = toBoundedLimit(limit * 3, 60);
    const rows = stmts.lookupRelated.all(normalized, boundedLimit);
    const bucket = { hypernym: [], hyponym: [], similar: [] };
    for (const row of rows) if (bucket[row.rel]) bucket[row.rel].push(row);
    const dedupe = (arr) => sanitizeLemmaRows(arr, normalized, limit);
    return { broader: dedupe(bucket.hypernym), narrower: dedupe(bucket.hyponym), akin: dedupe(bucket.similar) };
  }

  function lookupSymbolsLoose(word, limit = 12) {
    if (!tryConnect()) return [];
    const normalized = normalizeWord(word);
    if (!normalized) return [];
    const rows = stmts.lookupSymbolsLoose.all(normalized, toBoundedLimit(limit * 2, 30));
    const seen = new Map();
    const out = [];
    for (const row of rows) {
      const lemma = typeof row.lemma === 'string' ? row.lemma.trim() : '';
      if (!lemma) continue;
      const lower = lemma.toLowerCase();
      if (lower === normalized) continue;
      const existing = seen.get(lower);
      if (existing) {
        if (typeof row.pos === 'string' && row.pos.trim()) existing.pos.add(row.pos.trim());
        continue;
      }
      const entry = {
        lemma,
        via: row.rel.includes('domain') ? 'domain' : 'exemplifies',
        pos: new Set(typeof row.pos === 'string' && row.pos.trim() ? [row.pos.trim()] : []),
      };
      seen.set(lower, entry);
      if (out.length < limit) out.push(entry);
    }
    return out.map((entry) => ({ lemma: entry.lemma, via: entry.via, pos: [...entry.pos].sort() }));
  }

  function searchEntries(query, limit = DEFAULT_SEARCH_LIMIT) {
    if (!tryConnect()) return [];
    const sanitized = sanitizeFtsQuery(query);
    if (!sanitized) return [];
    const boundedLimit = toBoundedLimit(limit, DEFAULT_SEARCH_LIMIT);
    try {
      const rows = stmts.searchEntries.all(sanitized, boundedLimit);
      return rows.map(normalizeEntry);
    } catch {
      return [];
    }
  }

  function suggestEntries(prefix, limit = DEFAULT_SUGGEST_LIMIT) {
    if (!tryConnect()) return [];
    const normalized = normalizeWord(prefix);
    if (!normalized) return [];
    const boundedLimit = toBoundedLimit(limit, DEFAULT_SUGGEST_LIMIT);
    const rows = stmts.suggestEntries.all(`${normalized}%`, boundedLimit);
    return rows.map((row) => ({
      headword: row.headword,
      pos: row.pos,
    }));
  }

  function sanitizeLemmaRows(rows, word, limit = 20) {
    const boundedLimit = toBoundedLimit(limit, 20);
    const target = normalizeWord(word);
    const byLower = new Map();
    for (const row of rows) {
      const lemma = typeof row?.lemma === 'string' ? row.lemma.trim() : '';
      if (!lemma) continue;
      const lower = lemma.toLowerCase();
      if (lower === target) continue;
      let entry = byLower.get(lower);
      if (!entry) {
        entry = { lemma, pos: new Set() };
        byLower.set(lower, entry);
      }
      if (typeof row?.pos === 'string' && row.pos.trim()) entry.pos.add(row.pos.trim());
    }
    return [...byLower.values()]
      .slice(0, boundedLimit)
      .map((entry) => ({ lemma: entry.lemma, pos: [...entry.pos].sort() }));
  }

  function close() {
    if (db && db.open) {
      emitHealth('CLOSED', { reconnectCount });
      db.close();
    }
  }

  return {
    lookupWord,
    lookupRhymes,
    lookupSlantRhymes,
    getCorpusFrequencies,
    batchLookupFamilies,
    batchValidateWords,
    batchLookupPos,
    searchEntries,
    suggestEntries,
    lookupSynonyms,
    lookupAntonyms,
    lookupRelated,
    lookupSymbolsLoose,
    extractGloss,
    close,
    __unsafe: {
      get connected() { return !!(db && db.open); },
      get dbPath() { return resolvedPath; },
      get reconnectCount() { return reconnectCount; },
      get healthLog() { return healthLog; },
    },
  };
}

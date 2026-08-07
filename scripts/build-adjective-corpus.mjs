#!/usr/bin/env node
/**
 * ADJECTIVE CORPUS BUILDER — co-occurrence distances for the words WordNet can't reach
 *
 * WHY THIS EXISTS, measured rather than assumed:
 *
 *   semantotopography holds 7,161 distinct addresses for 84,677 lemmas and
 *   resolves open-class words by morphology, so `shadowy`, `murky`, `radiant`
 *   and `gloomy` all reduce to ["STATE"] — one point, cos = 1.0000.
 *
 *   WordNet graph distance fixes that for nouns (100% pair coverage) and verbs
 *   (99.3%), but WordNet's adjectives are satellite/head clusters, not a
 *   hierarchy: 7,502 head synsets carrying 2,709 head-to-head edges, 0.36 per
 *   cluster. Adjective pair coverage measured 0.7%, and 12.5% across the
 *   imagery register a poetry tool actually runs on. Those clusters are islands
 *   by construction; no traversal reaches between them.
 *
 * Co-occurrence is the one signal that does not care about WordNet's topology.
 * `shadowy` and `dusky` keep the same company in running text whether or not
 * WordNet links their clusters.
 *
 * METHOD. Positive PMI over a symmetric window, cosine over the sparse rows.
 * Deterministic and closed-form — no training loop, no seed, no model file,
 * so a rebuild from the same corpus yields identical numbers.
 *
 *   PMI(w,c) = log( p(w,c) / (p(w)·p(c)) )      PPMI = max(0, PMI)
 *
 * DIALOGUE-ONLY IS NOT ENOUGH. The existing oracle_memory.sqlite ingest keeps
 * only quoted speech across 8 books — 329,543 trigrams. Imagery lives in
 * descriptive prose, which that pass discards precisely where adjectives are
 * densest. This one reads full text.
 *
 * Usage:
 *   node scripts/build-adjective-corpus.mjs --books 120 --out adjective_corpus.sqlite
 *   node scripts/build-adjective-corpus.mjs --report          # measure an existing build
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const CACHE_DIR = join(process.cwd(), 'cache', 'gutenberg');
const DICT_PATH = join(process.cwd(), 'scholomance_dict.sqlite');
const WINDOW = 5;
const MIN_WORD_COUNT = 5;        // a word seen 4 times has no usable distribution
const MIN_PAIR_COUNT = 2;        // a pair seen once is noise, not company
/**
 * Context dimensions kept, ranked by corpus frequency.
 *
 * NOT the memory control — that lever was tried and measured, and it failed.
 * Cutting 40,000 -> 15,000 removed only 15% of pairs at the same book count
 * (7.36M vs 8.69M at 400 books), because pair growth is driven by the corpus,
 * not by the width of the context vocabulary. Peak memory is now bounded by
 * FLUSH_EVERY_BOOKS instead, so this is free to sit where it serves the
 * vectors rather than where it rescues the build.
 *
 * A PMI computed from a handful of observations is noise wearing the shape of
 * a dimension, so the rare tail is still dropped — and localCosine narrows to a
 * per-neighbourhood frame on top of this anyway.
 */
const MAX_CONTEXT_VOCAB = 30000;
/**
 * Books accumulated in memory before staging to disk. THE memory control.
 *
 * 250 was still too large: each chunk reached ~6M pairs before flushing and the
 * build OOMed at 3,750 of 5,318 books with 93.9M rows already safely staged —
 * the drain worked, the bucket feeding it was simply oversized. 40 books keeps
 * a chunk near 1M pairs, which is flat in corpus size.
 */
const FLUSH_EVERY_BOOKS = 40;

const START_MARKERS = ['*** START OF THIS PROJECT GUTENBERG', '*** START OF THE PROJECT GUTENBERG'];
const END_MARKERS = ['*** END OF THIS PROJECT GUTENBERG', '*** END OF THE PROJECT GUTENBERG'];

/**
 * Literary spread, deliberately weighted to descriptive prose and poetry rather
 * than the conversational picks the dialogue ingest used. Gothic, romantic and
 * nature writing carry the imagery register this build exists to serve.
 */
const BOOK_IDS = [
  1342, 84, 2701, 1400, 768, 1260, 174, 345, 43, 76, 1661, 2542, 5200, 1232,
  98, 1080, 219, 2814, 4300, 158, 161, 141, 105, 121, 1023, 730, 786, 580,
  766, 917, 963, 1023, 19337, 46, 24022, 25344, 33, 11, 12, 120, 271, 289,
  74, 205, 215, 244, 1497, 2600, 1727, 3207, 6130, 1322, 8800, 1567, 10, 30,
  2199, 3296, 100, 1041, 2147, 1065, 932, 14082, 15784, 2852, 696, 829, 1998,
  16328, 18857, 3600, 3825, 1250, 5230, 35, 36, 164, 1268, 2488, 558, 209,
  514, 550, 507, 969, 1013, 3268, 375, 42, 1155, 2814, 863, 155, 434, 60,
  113, 236, 15, 27, 2265, 1112, 1513, 1524, 2264, 1531, 1533, 1120, 3771,
  16, 55, 113, 289, 517, 621, 902, 1257, 2091, 4217, 5658, 20203, 28054,
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

function stripBoilerplate(text) {
  let out = text;
  for (const m of START_MARKERS) {
    const i = out.indexOf(m);
    if (i !== -1) { const nl = out.indexOf('\n', i); out = out.slice(nl + 1); break; }
  }
  for (const m of END_MARKERS) {
    const i = out.indexOf(m);
    if (i !== -1) { out = out.slice(0, i); break; }
  }
  return out;
}

async function fetchBook(id) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const cached = join(CACHE_DIR, `pg${id}.txt`);
  if (existsSync(cached)) return readFileSync(cached, 'utf8');

  for (const url of [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
  ]) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Scholomance/adjective-corpus' } });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.length < 5000) continue;
      writeFileSync(cached, text);
      return text;
    } catch { /* try next mirror */ }
  }
  return null;
}

/** Lowercase alphabetic tokens. Contractions split; hyphenates kept whole. */
function tokenize(text) {
  return text.toLowerCase().replace(/[’']/g, '').match(/[a-z]+(?:-[a-z]+)*/g) || [];
}

const STOP = new Set(('a an the and or but if then else of in on at to for with without from by as is are was were '
  + 'be been being have has had do does did will would shall should may might must can could not no nor so than that '
  + 'this these those there here it its his her their our your my me him them us we you i he she they what which who '
  + 'whom when where why how all any both each few more most other some such only own same too very just now also '
  + 'into out up down over under again further once about against between through during before after above below')
  .split(' '));

async function build(dbOutPath, maxBooks) {
  const dict = new Database(DICT_PATH, { readonly: true });
  const adjectives = new Set(
    dict.prepare(`SELECT DISTINCT lemma_lower AS w FROM wordnet_lemma
                  WHERE pos IN ('a','s') AND lemma_lower NOT LIKE '% %' AND length(lemma_lower) > 2`)
      .all().map((r) => r.w),
  );
  dict.close();
  console.log(`[corpus] target vocabulary: ${adjectives.size.toLocaleString()} adjectives`);

  /**
   * THE CACHE IS THE CORPUS. Reading whatever cache/gutenberg holds — rather
   * than a fixed id list — decouples growing the corpus from rebuilding the
   * vectors: scripts/fetch-gutenberg-corpus.mjs adds books by register, and
   * this reads all of them. BOOK_IDS is only a seed for a cold cache.
   */
  const cached = existsSync(CACHE_DIR)
    ? readdirSync(CACHE_DIR).filter((f) => f.endsWith('.txt')).map((f) => Number(f.slice(2, -4)))
    : [];
  const ids = (cached.length > 0 ? cached : [...new Set(BOOK_IDS)]).slice(0, maxBooks);
  console.log(`[corpus] reading ${ids.length} books (${cached.length} in cache)`);

  /**
   * TWO PASSES, BECAUSE ONE DOES NOT FIT.
   *
   * A single pass accumulating every (adjective, context) pair held 6.3M pairs
   * over 117 books. At 1,320 books that projects well past this machine's V8
   * heap ceiling, and the build would die partway leaving a corpus that looks
   * merely small rather than truncated.
   *
   * Pass 1 counts frequencies and fixes a context vocabulary of the top
   * MAX_CONTEXT_VOCAB words; pass 2 records only pairs whose context is in it.
   * That bounds memory by construction, and improves the vectors besides: a
   * context seen a handful of times yields a PMI built on almost no evidence,
   * which is noise wearing the shape of a dimension.
   */
  const wordCount = new Map();
  let totalTokens = 0;
  let fetched = 0;

  for (const id of ids) {
    const raw = await fetchBook(id);
    if (!raw) continue;
    fetched += 1;
    const tokens = tokenize(stripBoilerplate(raw)).filter((t) => !STOP.has(t) && t.length > 2);
    totalTokens += tokens.length;
    for (const t of tokens) wordCount.set(t, (wordCount.get(t) || 0) + 1);
    if (fetched % 200 === 0) {
      console.log(`[corpus] pass 1: ${fetched}/${ids.length} books, ${totalTokens.toLocaleString()} tokens`);
    }
  }
  console.log(`[corpus] pass 1: ${fetched} books, ${totalTokens.toLocaleString()} tokens, ${wordCount.size.toLocaleString()} types`);

  const contextVocab = new Set(
    [...wordCount.entries()]
      .filter(([, n]) => n >= MIN_WORD_COUNT)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_CONTEXT_VOCAB)
      .map(([w]) => w),
  );
  console.log(`[corpus] context vocabulary: ${contextVocab.size.toLocaleString()} words`);

  /**
   * ADJECTIVE -> (CONTEXT -> COUNT), not a flat "w c" key.
   *
   * The flat form died at 16.7M entries with RangeError: Map maximum size
   * exceeded — a hard V8 cap, not heap pressure, so a bigger --max-old-space
   * would not have helped. Nesting keeps every map under the cap by
   * construction (outer <= 20,922 adjectives, inner <= the context vocabulary)
   * and stops allocating a fresh joined string for every pair occurrence.
   */
  /**
   * PAIRS ARE FLUSHED TO SQLITE, NOT HELD.
   *
   * Holding the whole co-occurrence table in memory does not scale with the
   * corpus, and two measured failures proved it rather than suggesting it:
   *
   *   flat "w c" keys, 40k contexts   RangeError at 16.7M entries (hard V8 cap)
   *   nested maps, 40k contexts       5.7GB RSS at 38% of pass 2, ~43M pairs
   *                                   projected against a 9GB heap
   *   nested maps, 15k contexts       only 15% fewer pairs — the vocabulary is
   *                                   not the lever, the corpus is
   *
   * The accumulator now holds one CHUNK of books and flushes to a staging table
   * every FLUSH_EVERY_BOOKS, so peak memory is set by the chunk size and is
   * flat in corpus size. Aggregation and the PPMI arithmetic happen in SQL,
   * where the working set spills to disk instead of dying.
   */
  const out = new Database(dbOutPath);
  out.pragma('journal_mode = WAL');
  out.pragma('synchronous = OFF');
  out.exec(`
    DROP TABLE IF EXISTS ppmi;
    DROP TABLE IF EXISTS corpus_meta;
    DROP TABLE IF EXISTS pair_stage;
    CREATE TABLE pair_stage (word TEXT NOT NULL, context TEXT NOT NULL, n INTEGER NOT NULL);
    CREATE TABLE ppmi (word TEXT NOT NULL, context TEXT NOT NULL, value REAL NOT NULL);
    CREATE TABLE corpus_meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  const insStage = out.prepare('INSERT INTO pair_stage (word, context, n) VALUES (?,?,?)');

  let pairCount = new Map();
  let staged = 0;
  const flush = out.transaction(() => {
    for (const [w, row] of pairCount) {
      for (const [c, n] of row) { insStage.run(w, c, n); staged += 1; }
    }
  });

  let pass2 = 0;
  for (const id of ids) {
    const raw = await fetchBook(id);
    if (!raw) continue;
    pass2 += 1;
    const tokens = tokenize(stripBoilerplate(raw)).filter((t) => !STOP.has(t) && t.length > 2);

    for (let i = 0; i < tokens.length; i += 1) {
      const w = tokens[i];
      if (!adjectives.has(w)) continue;         // only adjectives get a row
      const lo = Math.max(0, i - WINDOW);
      const hi = Math.min(tokens.length, i + WINDOW + 1);
      let row = pairCount.get(w);
      if (row === undefined) { row = new Map(); pairCount.set(w, row); }
      for (let j = lo; j < hi; j += 1) {
        if (j === i) continue;
        const c = tokens[j];
        if (!contextVocab.has(c)) continue;
        row.set(c, (row.get(c) || 0) + 1);
      }
    }

    if (pass2 % FLUSH_EVERY_BOOKS === 0) {
      flush();
      pairCount = new Map();
      // Truncate the WAL, or it grows unbounded across a build this long and
      // the pages stay resident rather than settling into the main file.
      if (pass2 % (FLUSH_EVERY_BOOKS * 10) === 0) {
        out.pragma('wal_checkpoint(TRUNCATE)');
        console.log(`[corpus] pass 2: ${pass2}/${ids.length} books, ${staged.toLocaleString()} rows staged`);
      }
    }
  }
  flush();
  pairCount = new Map();
  console.log(`[corpus] ingested ${fetched} books, ${totalTokens.toLocaleString()} tokens, ${staged.toLocaleString()} staged rows`);

  // ── PPMI, computed in SQL over the aggregated staging table ─────────────
  console.log('[corpus] aggregating pairs');
  out.exec(`
    CREATE TABLE pair_agg AS
      SELECT word, context, SUM(n) AS n FROM pair_stage GROUP BY word, context;
    DROP TABLE pair_stage;
    CREATE TABLE word_tot AS SELECT word, SUM(n) AS n FROM pair_agg GROUP BY word;
    CREATE TABLE ctx_tot  AS SELECT context, SUM(n) AS n FROM pair_agg GROUP BY context;
    CREATE INDEX idx_word_tot ON word_tot(word);
    CREATE INDEX idx_ctx_tot ON ctx_tot(context);
  `);
  const pairTotal = out.prepare('SELECT SUM(n) AS t FROM pair_agg').get().t;
  console.log(`[corpus] ${out.prepare('SELECT count(*) c FROM pair_agg').get().c.toLocaleString()} distinct pairs, ${pairTotal.toLocaleString()} occurrences`);

  /** Rare words are dropped here rather than in JS so wordCount need not survive. */
  const rare = new Set([...wordCount.entries()].filter(([, n]) => n < MIN_WORD_COUNT).map(([w]) => w));
  out.exec('CREATE TABLE rare_word (word TEXT PRIMARY KEY)');
  const insRare = out.prepare('INSERT OR IGNORE INTO rare_word (word) VALUES (?)');
  out.transaction(() => { for (const w of rare) insRare.run(w); })();

  out.exec(`
    INSERT INTO ppmi (word, context, value)
    SELECT p.word, p.context,
           log((p.n * ${pairTotal}.0) / (w.n * 1.0 * c.n))
    FROM pair_agg p
    JOIN word_tot w ON w.word = p.word
    JOIN ctx_tot  c ON c.context = p.context
    WHERE p.n >= ${MIN_PAIR_COUNT}
      AND p.word NOT IN (SELECT word FROM rare_word)
      AND p.context NOT IN (SELECT word FROM rare_word)
      AND (p.n * ${pairTotal}.0) / (w.n * 1.0 * c.n) > 1.0
  `);
  const written = out.prepare('SELECT count(*) c FROM ppmi').get().c;
  out.exec('DROP TABLE pair_agg; DROP TABLE word_tot; DROP TABLE ctx_tot; DROP TABLE rare_word;');

  out.exec('CREATE INDEX idx_ppmi_word ON ppmi(word)');
  const meta = out.prepare('INSERT INTO corpus_meta (key,value) VALUES (?,?)');
  for (const [k, v] of Object.entries({
    books: String(fetched), tokens: String(totalTokens), window: String(WINDOW),
    rows: String(written), built: new Date().toISOString(),
  })) meta.run(k, v);

  const covered = out.prepare('SELECT count(DISTINCT word) c FROM ppmi').get().c;
  console.log(`[corpus] wrote ${written.toLocaleString()} PPMI rows covering ${covered.toLocaleString()} adjectives`);
  out.close();
}

const outPath = arg('out', 'adjective_corpus.sqlite');
const bookLimit = Number(arg('books', '100000'));
build(outPath, bookLimit).catch((err) => { console.error(err); process.exit(1); });

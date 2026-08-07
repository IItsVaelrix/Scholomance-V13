#!/usr/bin/env node
/**
 * ADJECTIVE INTENSITY — the scalar the vector channel structurally cannot carry
 *
 * WHY A SCALAR AT ALL. Measured: corpus cosine ranks same-scale pairs well
 * (median rank #24) and ranks OPPOSITE POLES of the same scale just as well —
 * `pale`/`crimson` at #8, `silent`/`loud` at #64. That is not a defect in the
 * cosine. Poles of one scale share nearly every context ("the room was silent"
 * / "the room was loud"), so position along a scale leaves no distributional
 * trace to measure. Which scale a word is on is a direction; where it sits on
 * that scale is a number, and no amount of co-occurrence recovers it.
 *
 * WordNet supplies the scale and the poles for free — a head synset is a pole,
 * its satellites are the words clustered there (`dark`'s head carries 16), and
 * an antonym edge joins the two heads. What WordNet does NOT record is any
 * ordering among those satellites. `dusky`, `gloomy`, `shadowy` and `murky` sit
 * under one head as an unordered set. That ordering is what this builds.
 *
 * ─── WHAT WAS TRIED AND MEASURABLY FAILED ─────────────────────────────────
 *
 * The standard method for adjective intensity is pairwise lexical patterns —
 * "warm but not hot" yields warm < hot. Counted over all 117 cached books:
 *
 *     X but not Y      35 adjective pairs      needful<lavish, coquettish<heartless
 *     not just X but Y 21 pairs                necessary<just, manifold<involute
 *     more X than Y   190 pairs                precious<fine, short<waste
 *
 * Sparse AND wrong: in literary English "X but not Y" is overwhelmingly
 * contrast rather than degree, so the few hits are noise. That method needs a
 * billion-word corpus; 7M tokens of 19th-century prose cannot support it, and
 * folding those pairs in would have imported noise wearing the shape of data.
 *
 * ─── WHAT IS USED INSTEAD ─────────────────────────────────────────────────
 *
 * Intensifier selection, ~34,000 hits in the same corpus. The linguistics is
 * well established: gradable adjectives with a relative standard (`warm`,
 * `dark`, `large`) combine freely with `very` and `slightly`, while
 * maximum-standard adjectives (`freezing`, `enormous`) resist `very` and take
 * `absolutely`, `utterly`, `completely`. The intensifier a word attracts is a
 * measurable proxy for where it sits.
 *
 * Deterministic and closed-form — counts and a weighted mean, no training.
 *
 * Usage:
 *   node scripts/build-adjective-intensity.mjs --out adjective_corpus.sqlite
 */

import Database from 'better-sqlite3';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadWordnetGraph } from '../codex/server/adapters/wordnetGraph.sqlite.adapter.js';
import { classifyCluster, orderScale } from '../codex/core/semantic/scale-structure.js';

const CACHE_DIR = join(process.cwd(), 'cache', 'gutenberg');
const DICT_PATH = join(process.cwd(), 'scholomance_dict.sqlite');
const CORPUS_PATH = join(process.cwd(), 'scholomance_corpus.sqlite');
const MIN_HITS = 4;
/**
 * NO GRADABILITY THRESHOLD LIVES HERE ANY MORE.
 *
 * Three were built and each fixed its stated case then leaked elsewhere:
 * periphrastic degree caught 2 of 9 non-gradable words; an absolute hit count
 * caught 11/11 and decayed to 1/11 as the corpus grew tenfold (at 571,715 hits
 * `impossible` had accrued 8 stray weak modifiers); a proportional threshold
 * rejected correctly and was immediately undone by the endpoint path.
 *
 * The ordering is now constrained to clusters that scale-structure certifies as
 * having a vertical, which removes the need for the filter rather than fixing
 * it: inside `dark`'s cluster there are no `impossible`s to exclude.
 */

/**
 * Bands, with the scalar each contributes. `quite` is deliberately absent: in
 * 19th-century British prose it reads as "completely" and in modern usage as
 * "moderately", so it would push a word in opposite directions depending on the
 * book it came from.
 */
const BANDS = Object.freeze([
  { value: 0.0, words: ['slightly', 'somewhat', 'rather', 'fairly', 'mildly', 'partly', 'faintly', 'a bit'] },
  { value: 0.5, words: ['very', 'extremely', 'highly', 'exceedingly', 'intensely', 'deeply', 'greatly'] },
  { value: 1.0, words: ['absolutely', 'utterly', 'completely', 'totally', 'perfectly', 'downright', 'wholly', 'entirely', 'positively'] },
]);

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

function main() {
  const outPath = arg('out', 'adjective_corpus.sqlite');
  if (!existsSync(CACHE_DIR)) {
    console.error(`[intensity] no corpus cache at ${CACHE_DIR}; run build-adjective-corpus.mjs first`);
    process.exit(1);
  }

  const dict = new Database(DICT_PATH, { readonly: true });
  const adjectives = new Set(
    dict.prepare(`SELECT DISTINCT lemma_lower AS w FROM wordnet_lemma
                  WHERE pos IN ('a','s') AND lemma_lower NOT LIKE '% %' AND length(lemma_lower) > 2`)
      .all().map((r) => r.w),
  );
  dict.close();

  /** word -> [weakCount, midCount, strongCount, gradableCount] */
  const counts = new Map();
  const bandOf = new Map();
  BANDS.forEach((b, i) => b.words.forEach((w) => bandOf.set(w, i)));

  const bandRow = (adj) => {
    let r = counts.get(adj);
    if (!r) { r = [0, 0, 0, 0]; counts.set(adj, r); }
    return r;
  };
  const GRADABLE = 3;

  /**
   * Morphological comparative and superlative forms, mapped back to their base.
   * `darker`/`darkest` occurring at all is proof `dark` admits degree; the
   * spelling rules cover the four regular English patterns.
   */
  const inflected = new Map();
  /**
   * COMPARATIVE FORMS ARE NOT BASE ADJECTIVES.
   *
   * Measured: the ten weakest-scoring words were `lower`, `larger`, `smaller`,
   * `higher`, `older`, `later` — every one a comparative of a word already in
   * the list. WordNet lemmatises them as adjectives in their own right, so they
   * accumulated their own counts and landed at the bottom of the scale, where
   * they mean nothing: `lower` is not a mild form of anything, it is `low` with
   * a comparative on it.
   */
  const comparativeForms = new Set();
  for (const a of adjectives) {
    if (a.length < 3 || a.includes('-')) continue;
    const forms = [];
    if (a.endsWith('e')) forms.push(`${a}r`, `${a}st`);
    else if (a.endsWith('y')) forms.push(`${a.slice(0, -1)}ier`, `${a.slice(0, -1)}iest`);
    else {
      forms.push(`${a}er`, `${a}est`);
      // Consonant doubling: big -> bigger, thin -> thinnest.
      if (/[^aeiou][aeiou][bdgklmnprt]$/.test(a)) forms.push(`${a}${a.at(-1)}er`, `${a}${a.at(-1)}est`);
    }
    for (const f of forms) {
      if (adjectives.has(f)) {
        // Listed as an adjective AND derivable from another adjective: it is an
        // inflection wearing a lemma's clothes. Excluded as a scoring target,
        // and not attributed as evidence either, since "bitter"/"clever" would
        // otherwise credit degree to a base that was never meant.
        comparativeForms.add(f);
      } else if (!inflected.has(f)) {
        inflected.set(f, a);
      }
    }
  }
  console.log(`[intensity] excluding ${comparativeForms.size.toLocaleString()} comparative/superlative forms`);

  /**
   * PERIPHRASTIC DEGREE IS NOT ADMISSIBLE EVIDENCE.
   *
   * Counting "more X" / "most X" toward gradability was measured and failed:
   * it cleared only 2 of the 9 non-gradable words that topped the ranking, and
   * `impossible` sailed through on 14 hits. English produces "more impossible"
   * and "most unknown" freely as rhetoric — "nothing could be more impossible"
   * — so the construction says nothing about whether the word admits partial
   * degree.
   *
   * `slightly impossible` is the phrase English actually declines to produce.
   * Weak intensifiers and morphological comparatives are the strict tests, and
   * both are kept; periphrastic degree is dropped.
   */

  function scan(text) {
    const tokens = text.toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) || [];
    let hits = 0;
    for (let i = 0; i < tokens.length; i += 1) {
      const tok = tokens[i];

      // Inflected comparative/superlative anywhere is gradability evidence.
      const base = inflected.get(tok);
      if (base !== undefined) bandRow(base)[GRADABLE] += 1;

      if (i + 1 >= tokens.length) continue;
      const adj = tokens[i + 1];
      if (!adjectives.has(adj)) continue;

      const band = bandOf.get(tok);
      if (band === undefined) continue;
      const r = bandRow(adj);
      r[band] += 1;
      // A weak intensifier IS a partial degree, so it counts as gradability too.
      if (band === 0) r[GRADABLE] += 1;
      hits += 1;
    }
    return hits;
  }

  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith('.txt'));
  console.log(`[intensity] scanning ${files.length} books for ${adjectives.size.toLocaleString()} adjectives`);
  let bookHits = 0;
  for (const f of files) bookHits += scan(readFileSync(join(CACHE_DIR, f), 'utf8'));
  console.log(`[intensity]   gutenberg cache: ${bookHits.toLocaleString()} intensifier hits`);

  /**
   * The in-repo sentence corpus, which the Gutenberg cache does not subsume:
   * 49,596 of its 115,680 sentences are WordNet usage examples rather than
   * prose, and dictionary examples carry intensifiers at a different rate than
   * narrative does. Its ten Gutenberg titles DO overlap the cache, so those
   * contribute nothing new — the WordNet examples are the reason to read it.
   */
  if (existsSync(CORPUS_PATH)) {
    const corpus = new Database(CORPUS_PATH, { readonly: true });
    let corpusHits = 0;
    let sentences = 0;
    try {
      for (const sentence of corpus.prepare('SELECT text FROM sentence').iterate()) {
        corpusHits += scan(sentence.text || '');
        sentences += 1;
      }
    } catch { /* table absent: the cache alone is still a valid build */ }
    corpus.close();
    console.log(`[intensity]   sentence corpus: ${corpusHits.toLocaleString()} hits over ${sentences.toLocaleString()} sentences`);
  } else {
    console.log('[intensity]   sentence corpus: not present, skipping');
  }

  /**
   * ENDPOINTS ARE NOT NON-GRADABLE — the correction the last build forced.
   *
   * The first filter asked one question: does the corpus show this word taking
   * partial degree? Measured, that withheld a score from exactly the words a
   * scale most needs positioned:
   *
   *     furious    n=24   weak=1  mid=14  strong=9    -> WITHHELD
   *     enormous   n=6    weak=0  mid=3   strong=3    -> WITHHELD
   *     delighted  n=128  weak=1  mid=107 strong=20   -> WITHHELD
   *
   * `slightly furious` and `enormouser` are odd for the same reason `slightly
   * impossible` is, so one test cannot separate two different things:
   *
   *   NON-GRADABLE      `impossible`, `unknown` — no scale at all
   *   MAXIMUM-STANDARD  `furious`, `enormous`  — a scale, at its endpoint
   *
   * Resisting `very` is the POSITIVE signal that a word is maximal. Reading it
   * as evidence of no degree inverted the meaning of the strongest evidence
   * available.
   *
   * WordNet's clusters are the discriminator. A head synset is a pole and its
   * satellites are the words at that pole, so a word that resists weak
   * modifiers while sharing a cluster with a demonstrably gradable neighbour is
   * the endpoint OF THAT SCALE. `freezing` beside `cool`/`chilly`/`cold` is an
   * endpoint; `impossible` with no gradable company is not on a scale at all.
   */
  const out = new Database(outPath);
  out.exec(`
    DROP TABLE IF EXISTS intensity;
    DROP TABLE IF EXISTS scale_order;
    CREATE TABLE intensity (
      word TEXT PRIMARY KEY, degree REAL NOT NULL,
      weak INTEGER NOT NULL, mid INTEGER NOT NULL, strong INTEGER NOT NULL, total INTEGER NOT NULL
    );
    CREATE TABLE scale_order (
      head TEXT NOT NULL, attribute TEXT, word TEXT NOT NULL,
      rank INTEGER NOT NULL, relative REAL NOT NULL, raw REAL NOT NULL,
      span REAL NOT NULL, memberCount INTEGER NOT NULL
    );
  `);

  /**
   * `intensity` IS AN OBSERVATION TABLE, NOT A RANKING.
   *
   * `degree` is the raw weighted mean of the intensifier bands and nothing
   * more. It carries no claim that one word outranks another, because compared
   * across scales it does not: asking whether `destroyed` is more intense than
   * `dark` is asking whether Tuesday weighs more than blue.
   *
   * Read globally this column is actively misleading — its extremes are
   * `bereft`, `motionless`, `oblivious` at one end and participles like
   * `rolled`, `earned`, `heard` at the other, neither of which is a statement
   * about degree. Order it only through scale_order.
   */
  const insInt = out.prepare(`INSERT INTO intensity
    (word,degree,weak,mid,strong,total) VALUES (?,?,?,?,?,?)`);
  const degreeOf = new Map();
  let observed = 0;
  out.transaction(() => {
    for (const [word, [weak, mid, strong]] of counts) {
      const total = weak + mid + strong;
      if (total < MIN_HITS) continue;
      if (comparativeForms.has(word)) continue;
      const degree = (BANDS[0].value * weak + BANDS[1].value * mid + BANDS[2].value * strong) / total;
      insInt.run(word, degree, weak, mid, strong, total);
      degreeOf.set(word, degree);
      observed += 1;
    }
  })();
  console.log(`[intensity] ${observed.toLocaleString()} adjectives observed with >= ${MIN_HITS} intensifier hits`);

  /**
   * THE ORDERING IS PER SCALE, AND ONLY WHERE A SCALE EXISTS.
   *
   * Three global gradability filters were built to keep `impossible` out of an
   * intensity ranking, and each fixed its stated case and leaked somewhere new:
   * periphrastic degree caught 2 of 9; an absolute hit threshold caught 11/11
   * and then decayed to 1/11 as the corpus grew tenfold; a proportional
   * threshold rejected correctly and was immediately undone by the endpoint
   * path. The pattern — every fix revealing the next leak elsewhere — meant the
   * method was wrong, not the threshold.
   *
   * Constraining the ordering to a cluster dissolves the problem instead of
   * filtering it. scale-structure decides whether a neighbourhood HAS a
   * vertical, and inside `dark`'s cluster there are no `impossible`s to
   * exclude, so the filter that kept breaking is not needed at all.
   *
   * Every row carries its scale's `span`, because scales differ in vertical
   * extent — measured: large 0.708, hot 0.833, dark 0.345. A consumer comparing
   * across scales has to reckon with span rather than be handed a normalised
   * number that hides it.
   */
  const graph = loadWordnetGraph(DICT_PATH);
  const insOrder = out.prepare(`INSERT INTO scale_order
    (head,attribute,word,rank,relative,raw,span,memberCount) VALUES (?,?,?,?,?,?,?,?)`);
  let scales = 0;
  let placed = 0;
  let skippedFlat = 0;
  out.transaction(() => {
    for (const head of graph.clusterMembers.keys()) {
      const c = classifyCluster(graph, head);
      if (c.kind !== 'scalar') { skippedFlat += 1; continue; }
      const o = orderScale(graph, head, degreeOf);
      if (o.ordered.length < 2) continue;
      scales += 1;
      for (const row of o.ordered) {
        insOrder.run(head, c.attribute, row.word, row.rank, row.relative, row.raw, o.span, c.memberCount);
        placed += 1;
      }
    }
  })();
  out.exec('CREATE INDEX idx_scale_word ON scale_order(word); CREATE INDEX idx_scale_head ON scale_order(head)');

  console.log(`[intensity] ordered ${placed.toLocaleString()} words across ${scales.toLocaleString()} scales`);
  console.log(`[intensity]   clusters with no vertical, left unordered: ${skippedFlat.toLocaleString()}`);
  out.close();
}

main();

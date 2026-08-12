/**
 * Grounding Index — PB-GROUNDING-v1
 * ========================================================================
 * Deterministic corpus co-occurrence index for Concept Chemistry.
 *
 * Replaces hand-typed grounding estimates with actual document attestation.
 * Given a corpus of text documents, builds an inverted index and computes:
 *   - attestation(concept): fraction of documents mentioning the concept
 *   - coOccurrence(A, B): Jaccard overlap of document sets for A and B
 *
 * DETERMINISM: Pure text processing. Same documents → same tokens → same
 * index → same scores. No neural model. No floating-point vector math.
 * Content-addressed checksum over the index for replay verification.
 *
 * DESIGN: Document-level co-occurrence (not sentence-level). A concept is
 * "attested" if its tokens appear in a document. Two concepts "co-occur"
 * if they appear in the same document. Coarse but robust and transparent.
 *
 * CORPUS: The Scholomance Encyclopedia (PDRs, PIRs, White Papers, Bug
 * Reports) + LAW documents. ~270 KB across ~22 documents. Small enough
 * to load entirely. This is institutional knowledge, not implementation.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

export const SCHEMA = 'PB-GROUNDING-v1';

// ─── Tokenization ────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'because', 'but', 'and', 'or', 'if', 'while', 'that', 'this',
  'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'our',
  'you', 'your', 'he', 'she', 'his', 'her', 'i', 'me', 'my', 'what',
  'which', 'who', 'whom', 'up', 'about', 'also', 'any', 'are', 'get',
  'got', 'let', 'must', 'one', 'two', 'three', 'new', 'use', 'using',
  'used', 'via', 'per', 'etc', 'eg', 'ie', 'vs', 'see', 'note',
]);

/**
 * Simple deterministic suffix-stripping stemmer.
 * Not linguistically perfect — just enough to merge morphological variants.
 */
function stem(word) {
  if (word.length <= 3) return word;
  // Order matters: longest suffixes first
  const suffixes = [
    'ation', 'tion', 'sion', 'ness', 'ment', 'ence', 'ance',
    'ible', 'able', 'ious', 'eous', 'ting', 'ing', 'ity',
    'ally', 'ally', 'ful', 'ous', 'ive', 'ize', 'ise',
    'ed', 'er', 'ly', 'al', 'es', 's',
  ];
  for (const suf of suffixes) {
    if (word.endsWith(suf) && word.length - suf.length >= 3) {
      return word.slice(0, word.length - suf.length);
    }
  }
  return word;
}

/**
 * Tokenize text into stemmed, stopword-filtered tokens.
 * Deterministic: same text → same tokens, always.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  const raw = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  return raw.map(stem);
}

// ─── Index Construction ──────────────────────────────────────────────

/**
 * @typedef {Object} GroundingIndex
 * @property {Map<string, Set<number>>} inverted - token → Set<docIndex>
 * @property {string[]} docIds - document identifiers
 * @property {number} docCount
 * @property {number} tokenCount - unique stemmed tokens
 * @property {string} checksum - content-addressed hash
 */

/**
 * Build a grounding index from an array of documents.
 * @param {Array<{id: string, text: string}>} documents
 * @returns {GroundingIndex}
 */
export function buildIndex(documents) {
  const inverted = new Map();
  const docIds = [];
  const docTokenSets = [];

  // Paragraph-window data for PMI (granularity fix). A "window" is a
  // blank-line-delimited paragraph. PMI measured over windows can go
  // NEGATIVE (repulsion), which document-level Jaccard cannot, because
  // set-overlap over document unions is bounded below by zero.
  const windowInverted = new Map(); // token -> Set<windowIdx>
  let windowCount = 0;

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    docIds.push(doc.id);
    const tokens = new Set(tokenize(doc.text));
    docTokenSets.push(tokens);
    for (const tok of tokens) {
      if (!inverted.has(tok)) inverted.set(tok, new Set());
      inverted.get(tok).add(i);
    }

    // Paragraph windows for this document (fall back to whole doc if no
    // blank lines — window then equals document, which is still valid).
    const paragraphs = String(doc.text)
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const wins = paragraphs.length > 0 ? paragraphs : [String(doc.text)];
    for (const para of wins) {
      const wIdx = windowCount++;
      const wTokens = new Set(tokenize(para));
      for (const tok of wTokens) {
        if (!windowInverted.has(tok)) windowInverted.set(tok, new Set());
        windowInverted.get(tok).add(wIdx);
      }
    }
  }

  // Content-addressed checksum over sorted token→docCount pairs.
  // NOTE: computed over the DOCUMENT-level inverted index ONLY, so adding
  // paragraph-window data does not change the checksum. The grnd1 identity
  // is stable across this upgrade; window data is additive.
  const pairs = [...inverted.entries()]
    .map(([tok, docs]) => `${tok}:${docs.size}`)
    .sort();
  const canon = pairs.join('|');
  const checksum = 'grnd1:' + createHash('sha256').update(canon, 'utf8').digest('hex').slice(0, 16);

  // Memoised on first read. Most callers of buildIndex never touch the base rate,
  // and computing it eagerly measurably slowed the suite — it is a sampled scan
  // over the vocabulary, not a byproduct of indexing.
  let baseCooccurRate = null;
  return Object.freeze({
    schema: SCHEMA,
    inverted,
    docIds,
    docTokenSets,
    docCount: documents.length,
    tokenCount: inverted.size,
    windowInverted,
    windowCount,
    // Additive, like the window data above, and deliberately OUTSIDE the grnd1
    // checksum for the same reason: the identity is over the document-level
    // inverted index.
    get baseCooccurRate() {
      if (baseCooccurRate === null) baseCooccurRate = computeBaseCooccurRate(windowInverted);
      return baseCooccurRate;
    },
    checksum,
  });
}

/**
 * The corpus's own co-occurrence base rate: of the token pairs that are attested
 * at all, what fraction actually co-occur in some window.
 *
 * This exists because NEVER-CO-OCCURRING IS THE DEFAULT STATE OF THIS SUBSTRATE.
 * Measured 2026-08-12: only 17.6% of attested pairs co-occur in the 8-document
 * test corpus, and just 3.4% in the encyclopedia index (6,680 vocab / 5,116
 * windows / 32,208 pairs sampled). Scoring a pair's isolation against zero
 * therefore reads ordinary sparsity as maximum repulsion.
 *
 * NEVER hardcode a value for this. It differs 5x between the two corpora above,
 * which is the same non-portability that makes `osmosisConcentrationLimit`
 * refuse to have a default.
 *
 * Deterministic sample: the first SAMPLE_VOCAB tokens in sorted order, so index
 * construction stays O(SAMPLE_VOCAB^2) rather than O(vocab^2).
 */
function computeBaseCooccurRate(windowInverted) {
  const MAX_PAIRS = 1200;
  // Deterministic sample: sorted vocabulary walked with a stride chosen so the
  // sample spreads across the whole list rather than clustering at 'a'.
  const vocab = [...windowInverted.keys()].sort();
  if (vocab.length < 2) return 0;
  const side = Math.min(vocab.length, Math.ceil(Math.sqrt(MAX_PAIRS)) + 1);
  const stride = Math.max(1, Math.floor(vocab.length / side));
  const sample = [];
  for (let i = 0; i < vocab.length && sample.length < side; i += stride) sample.push(vocab[i]);

  let attested = 0, live = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const wx = windowInverted.get(sample[i]);
    for (let j = i + 1; j < sample.length; j += 1) {
      const wy = windowInverted.get(sample[j]);
      if (!wx || !wy) continue; // unattested: no signal, mirrors pmiPair
      attested += 1;
      // Only WHETHER they share a window matters, so stop at the first hit
      // instead of counting them all the way pmiPair does.
      const [small, large] = wx.size <= wy.size ? [wx, wy] : [wy, wx];
      for (const w of small) {
        if (large.has(w)) { live += 1; break; }
      }
    }
  }
  return attested === 0 ? 0 : round4(live / attested);
}

// ─── Query Functions ─────────────────────────────────────────────────

/**
 * Compute attestation score for a concept.
 * Score = fraction of documents whose token set overlaps with the concept tokens.
 * A document "matches" if it contains at least one concept token.
 * Weighted by coverage: more concept tokens matched → higher score.
 *
 * @param {GroundingIndex} index
 * @param {string} conceptText
 * @returns {{score: number, matchingDocs: number, totalDocs: number, tokenHits: Object}}
 */
export function attest(index, conceptText) {
  const conceptTokens = [...new Set(tokenize(conceptText))];
  if (conceptTokens.length === 0) {
    return { score: 0, matchingDocs: 0, totalDocs: index.docCount, tokenHits: {} };
  }

  // For each concept token, find matching documents
  const tokenHits = {};
  const docScores = new Array(index.docCount).fill(0);

  for (const tok of conceptTokens) {
    const docs = index.inverted.get(tok);
    if (docs) {
      tokenHits[tok] = docs.size;
      for (const docIdx of docs) {
        docScores[docIdx] += 1;
      }
    } else {
      tokenHits[tok] = 0;
    }
  }

  // A document matches if it hits at least one concept token
  const matchingDocs = docScores.filter((s) => s > 0).length;

  // Score: base attestation (fraction of docs) boosted by average coverage
  const baseAttestation = matchingDocs / Math.max(index.docCount, 1);
  const totalHits = Object.values(tokenHits).reduce((a, b) => a + b, 0);
  const avgCoverage = totalHits / (conceptTokens.length * Math.max(index.docCount, 1));
  const score = Math.min(1, baseAttestation * 0.7 + avgCoverage * 0.3);

  return {
    score: Math.round(score * 1e4) / 1e4,
    matchingDocs,
    totalDocs: index.docCount,
    tokenHits,
  };
}

/**
 * Compute co-occurrence between two concepts.
 * Jaccard similarity of their document sets:
 *   |docs(A) ∩ docs(B)| / |docs(A) ∪ docs(B)|
 *
 * @param {GroundingIndex} index
 * @param {string} conceptA
 * @param {string} conceptB
 * @returns {{jaccard: number, intersection: number, union: number, docsA: number, docsB: number}}
 */
export function coOccurrence(index, conceptA, conceptB) {
  const tokensA = [...new Set(tokenize(conceptA))];
  const tokensB = [...new Set(tokenize(conceptB))];

  const docsA = new Set();
  const docsB = new Set();

  for (const tok of tokensA) {
    const docs = index.inverted.get(tok);
    if (docs) for (const d of docs) docsA.add(d);
  }
  for (const tok of tokensB) {
    const docs = index.inverted.get(tok);
    if (docs) for (const d of docs) docsB.add(d);
  }

  let intersection = 0;
  for (const d of docsA) {
    if (docsB.has(d)) intersection++;
  }
  const union = new Set([...docsA, ...docsB]).size;

  return {
    jaccard: union === 0 ? 0 : Math.round((intersection / union) * 1e4) / 1e4,
    intersection,
    union,
    docsA: docsA.size,
    docsB: docsB.size,
  };
}

/**
 * Compute grounding score for a concept pair.
 *
 * COMPOSITE (fix #1): grounding = mean(attestA, attestB) — ATTESTATION ONLY.
 *
 * The document-level Jaccard co-occurrence term that used to be wired into
 * this composite (0.3 * jaccard) is now NON-SCORING. Rationale: in a small
 * corpus, set-overlap over document unions saturates near 1 for any two
 * concepts that are both attested anywhere, so it carries no discriminative
 * signal and systematically inflated false friends (both sides "attested"
 * ⇒ high score even when the concepts are incompatible). It is retained on
 * the return object for diagnostics only, flagged `coOccurrenceScoring:false`.
 *
 * The SIGNED co-occurrence signal now lives in conceptPMI() — token-pair PMI
 * over paragraph windows — which can go negative and therefore express
 * repulsion. That is the correct false-friend detector, not this composite.
 *
 * @param {GroundingIndex} index
 * @param {string} conceptA
 * @param {string} conceptB
 * @returns {{grounding:number, attestA:number, attestB:number, coOcc:number, coOccurrenceScoring:boolean, details:object}}
 */
export function groundingScore(index, conceptA, conceptB) {
  const a = attest(index, conceptA);
  const b = attest(index, conceptB);
  const co = coOccurrence(index, conceptA, conceptB);

  // Attestation-only composite. Jaccard (co.jaccard) deliberately excluded.
  const grounding = (a.score + b.score) / 2;

  return {
    grounding: Math.round(grounding * 1e4) / 1e4,
    attestA: a.score,
    attestB: b.score,
    coOcc: co.jaccard,
    coOccurrenceScoring: false, // ← explicitly NON-SCORING (fix #1)
    details: {
      a,
      b,
      co,
      compositeNote:
        'grounding = mean(attestA, attestB). Document-level Jaccard (coOcc) is ' +
        'diagnostics-only: it saturates in small corpora and cannot express ' +
        'repulsion. Signed co-occurrence → conceptPMI().',
    },
  };
}

// ─── PMI: signed co-occurrence (granularity fix #2) ──────────────────

function round4(x) {
  return Math.round(x * 1e4) / 1e4;
}

/**
 * Floor for PMI when two tokens are both attested but NEVER co-occur in any
 * window. True PMI is -infinity; we clamp to a finite floor so the signal is
 * usable and deterministic. -10 bits ≈ "strongly repelled".
 */
export const PMI_FLOOR = -10;

/**
 * Pointwise Mutual Information between two individual tokens, measured over
 * paragraph windows:
 *
 *   PMI(x,y) = log2( P(x,y) / (P(x) · P(y)) )
 *
 *   P(x)   = fraction of windows containing x
 *   P(x,y) = fraction of windows containing both x and y
 *
 * Unlike document-level Jaccard, PMI is SIGNED:
 *   PMI > 0  → x,y co-occur MORE than chance  (attraction)
 *   PMI = 0  → independent
 *   PMI < 0  → x,y co-occur LESS than chance  (repulsion / false friend)
 *
 * This is the granularity change: set-overlap over document unions is bounded
 * below by zero and saturates in a small corpus, so it cannot express
 * repulsion. PMI over token-pair windows can, which is exactly what a
 * corpus-derived false-friend detector needs.
 *
 * @param {GroundingIndex} index
 * @param {string} x stemmed token
 * @param {string} y stemmed token
 * @returns {{pmi:number|null, coWindows?:number, px?:number, py?:number, note?:string}}
 *          pmi === null when either token is unattested (no signal).
 */
export function pmiPair(index, x, y) {
  const N = index.windowCount;
  if (!N) return { pmi: 0, note: 'no-windows' };
  const wx = index.windowInverted.get(x);
  const wy = index.windowInverted.get(y);
  if (!wx || !wy) return { pmi: null, note: 'unattested' };
  const px = wx.size / N;
  const py = wy.size / N;
  let co = 0;
  const [small, large] = wx.size <= wy.size ? [wx, wy] : [wy, wx];
  for (const w of small) if (large.has(w)) co++;
  if (co === 0) {
    // Both attested, never together → maximum repulsion (floored).
    return { pmi: PMI_FLOOR, coWindows: 0, px: round4(px), py: round4(py), note: 'never-cooccur (floored)' };
  }
  const pxy = co / N;
  const pmi = Math.log2(pxy / (px * py));
  return { pmi: round4(pmi), coWindows: co, px: round4(px), py: round4(py) };
}

/**
 * Aggregate signed PMI across the token cross-product of two concepts.
 * Returns a SIGNED corpus co-occurrence signal:
 *
 *   meanPMI < 0  → the concepts' tokens avoid each other → REPULSION
 *   meanPMI > 0  → the concepts' tokens cluster together → ATTRACTION
 *
 * This is a corpus-derived FALSE-FRIEND DETECTOR. It is surfaced as a
 * diagnostic on the synthesize() result and logged per reaction; it is NOT
 * folded into the feasibility weight (that would be fitting to a handful of
 * labelled negatives). Correlate it against measured truth in the regression
 * harness (scripts/concept-chem-determinism.mjs) and accumulate labels before
 * ever wiring it into a score.
 *
 * @param {GroundingIndex} index
 * @param {string} conceptA
 * @param {string} conceptB
 * @returns {{meanPMI:number, pairs:number, attractive:number, repulsive:number, flooredNeverCooccur:number, signal:string}}
 */
export function conceptPMI(index, conceptA, conceptB) {
  const toksA = [...new Set(tokenize(conceptA))];
  const toksB = [...new Set(tokenize(conceptB))];
  let sum = 0, pairs = 0, attractive = 0, repulsive = 0, floored = 0;
  let crossPairs = 0, liveSum = 0, live = 0;
  for (const ta of toksA) {
    for (const tb of toksB) {
      if (ta === tb) continue; // skip self-pairs
      // Counted even when unattested: dropping these silently is what let a pair
      // the corpus knows nothing about arrive looking unanimous.
      crossPairs += 1;
      const r = pmiPair(index, ta, tb);
      if (r.pmi === null) continue; // unattested pair → no signal
      sum += r.pmi;
      pairs++;
      const isFloored = Boolean(r.note && r.note.startsWith('never'));
      if (isFloored) {
        floored++;
      } else {
        // Only pairs that ACTUALLY co-occur carry directional information. The
        // floored majority is substrate background — measured 2026-08-12 at 82.4%
        // of this test corpus and 96.6% of the encyclopedia index — and averaging
        // it in measures corpus sparsity rather than the concept pair.
        liveSum += r.pmi;
        live++;
      }
      if (r.pmi < 0) repulsive++; else attractive++;
    }
  }
  const meanPMI = pairs === 0 ? 0 : sum / pairs;
  // Descriptive bands only — NOT scoring thresholds.
  const signal = meanPMI < -0.5 ? 'REPULSION' : meanPMI > 0.5 ? 'ATTRACTION' : 'NEUTRAL';
  return {
    meanPMI: round4(meanPMI),
    liveMean: round4(live === 0 ? 0 : liveSum / live),
    live,
    cooccurRate: pairs === 0 ? 0 : round4(live / pairs),
    crossPairs,
    coverage: crossPairs === 0 ? 0 : round4(pairs / crossPairs),
    pairs,
    attractive,
    repulsive,
    flooredNeverCooccur: floored,
    signal,
  };
}

// ─── Corpus Loader ───────────────────────────────────────────────────

/**
 * Recursively collect all .md files under a directory.
 * @param {string} dir
 * @returns {string[]}
 */
function collectMarkdownFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectMarkdownFiles(full));
    } else if (extname(full) === '.md' && stat.size > 0) {
      files.push(full);
    }
  }
  return files.sort();
}

/**
 * Load the Scholomance Encyclopedia + LAW documents into a grounding index.
 *
 * Corpus sources (in priority order):
 *   1. PolarisOS/Polaris-OS-Encyclopedia/ (PDRs, PIRs, White Papers, Bug Reports)
 *   2. docs/scholomance-encyclopedia/Scholomance LAW/ (VAELRIX_LAW, RESONANCE_LAW)
 *   3. Root LAW/agent docs (VAELRIX_LAW.md, CODEX.md, CLAUDE.md, GEMINI.md)
 *
 * @param {string} basePath - repository root (default: process.cwd())
 * @returns {GroundingIndex}
 */
export function loadEncyclopediaIndex(basePath = process.cwd()) {
  const corpusDirs = [
    join(basePath, 'PolarisOS', 'Polaris-OS-Encyclopedia'),
    join(basePath, 'docs', 'scholomance-encyclopedia', 'Scholomance LAW'),
  ];

  const rootFiles = [
    'VAELRIX_LAW.md',
    'CODEX.md',
    'CLAUDE.md',
    'GEMINI.md',
  ];

  const documents = [];

  // Collect from corpus directories
  for (const dir of corpusDirs) {
    for (const file of collectMarkdownFiles(dir)) {
      const text = readFileSync(file, 'utf8');
      const id = file.replace(basePath + '/', '');
      documents.push({ id, text });
    }
  }

  // Collect root files
  for (const file of rootFiles) {
    const full = join(basePath, file);
    if (existsSync(full)) {
      const text = readFileSync(full, 'utf8');
      documents.push({ id: file, text });
    }
  }

  if (documents.length === 0) {
    throw new Error(`PB-GROUNDING: No corpus documents found under ${basePath}`);
  }

  return buildIndex(documents);
}

/**
 * Convenience: build index from raw text strings (for testing).
 * @param {string[]} texts
 * @returns {GroundingIndex}
 */
export function buildIndexFromTexts(texts) {
  return buildIndex(texts.map((text, i) => ({ id: `doc-${i}`, text })));
}

/**
 * Attach grounding functions to an index for use with synthesize().
 * Returns a new frozen object that carries `_groundingFns` so that
 * concept-chemistry.js can call groundingScore without circular imports.
 *
 * Usage:
 *   const index = prepareForSynthesize(loadEncyclopediaIndex());
 *   const result = synthesize({ a, b, product, index });
 *
 * @param {GroundingIndex} index
 * @returns {GroundingIndex & {_groundingFns: object}}
 */
export function prepareForSynthesize(index) {
  return Object.freeze({
    ...index,
    _groundingFns: Object.freeze({ groundingScore, attest, coOccurrence, conceptPMI, pmiPair }),
  });
}

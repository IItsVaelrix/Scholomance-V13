#!/usr/bin/env node
/**
 * ADJECTIVE SUBSTRATE BUILDER — condense a 6.3GB PPMI matrix into 2.3MB
 *
 * WHY THIS EXISTS. adjective_corpus.sqlite is 6,323,527,680 bytes across
 * 14,808,425 ppmi rows. It cannot ship: the whole Docker build context is
 * ~923MB and the Fly volume is 1GB. So production has never had corpus vectors
 * at all — scaleField falls back to WordNet, which answers 0.7% of adjective
 * pairs, and the page emits "corpus vectors unavailable" on every request.
 *
 * This produces two artifacts that DO ship, measured on 212 labelled pairs
 * (SYNONYM / UNRELATED / ANTONYM) whose labels come from neither PPMI nor
 * WordNet:
 *
 *   embeddings   truncated SVD of the PPMI matrix to 128 dims, int8-quantised.
 *                ~1.7MB. Answers similarity for ANY pair in the vocabulary.
 *                AUC(synonym > unrelated) = 0.995, against 0.696 for the
 *                WordNet fallback currently live. Note it beats the 6.3GB
 *                matrix it compresses (0.987) — the truncation discards
 *                idiosyncratic co-occurrence noise.
 *
 *   lattice      8 nearest neighbours per word plus signed antonym edges from
 *                WordNet. ~0.62MB. Distributional methods rank antonyms as
 *                SIMILAR because opposites share contexts — full PPMI scores
 *                AUC(synonym > antonym) = 0.435, BELOW chance. wordnet-distance
 *                already knows this and excludes antonym edges entirely
 *                (NON_DISTANCE_RELS). Keeping them with a negative sign instead
 *                lifts that to 0.935.
 *
 * The artifacts are DERIVED DATA that is committed rather than generated at
 * image-build time, because generating them requires cache/gutenberg (1.9GB of
 * source books) or live downloads from gutenberg.org. corpusChecksum is
 * recorded so a stale substrate is detectable rather than silently wrong.
 *
 * Usage:
 *   node scripts/build-adjective-substrate.mjs [--corpus adjective_corpus.sqlite]
 *                                              [--out public/substrate]
 */
import Database from 'better-sqlite3';
import { loadWordnetGraph } from '../codex/server/adapters/wordnetGraph.sqlite.adapter.js';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const DIMS = 128;
const OVERSAMPLE = 24;
const POWER_ITERATIONS = 2;
const EDGES = 8;
const SEED = 20260814;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const CORPUS = arg('corpus', 'adjective_corpus.sqlite');
const DICT = arg('dict', 'scholomance_dict.sqlite');
const OUT_DIR = arg('out', join('public', 'substrate'));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** Deterministic RNG — the substrate must rebuild byte-identically. */
function mulberry32(a) {
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  let u = 0; let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

log(`reading ${CORPUS} ...`);
const db = new Database(CORPUS, { readonly: true });
const meta = Object.fromEntries(
  db.prepare('SELECT key, value FROM corpus_meta').all().map((r) => [r.key, r.value]),
);
const wordIds = new Map(); const ctxIds = new Map();
const rw = []; const rc = []; const rv = [];
for (const r of db.prepare('SELECT word, context, value FROM ppmi').iterate()) {
  let w = wordIds.get(r.word); if (w === undefined) { w = wordIds.size; wordIds.set(r.word, w); }
  let c = ctxIds.get(r.context); if (c === undefined) { c = ctxIds.size; ctxIds.set(r.context, c); }
  rw.push(w); rc.push(c); rv.push(r.value);
}
db.close();
const W = wordIds.size; const C = ctxIds.size; const N = rw.length;
const words = new Array(W); for (const [s, i] of wordIds) words[i] = s;
log(`${N} rows, ${W} words, ${C} contexts`);

// CSR by word.
const counts = new Int32Array(W);
for (let i = 0; i < N; i += 1) counts[rw[i]] += 1;
const start = new Int32Array(W + 1);
for (let i = 0; i < W; i += 1) start[i + 1] = start[i] + counts[i];
const cursor = start.slice(0, W);
const csrC = new Int32Array(N); const csrV = new Float32Array(N);
for (let i = 0; i < N; i += 1) { const p = cursor[rw[i]]++; csrC[p] = rc[i]; csrV[p] = rv[i]; }
// Inverted index, for neighbour ranking.
const ccnt = new Int32Array(C);
for (let i = 0; i < N; i += 1) ccnt[rc[i]] += 1;
const cstart = new Int32Array(C + 1);
for (let i = 0; i < C; i += 1) cstart[i + 1] = cstart[i] + ccnt[i];
const ccur = cstart.slice(0, C);
const invW = new Int32Array(N); const invV = new Float32Array(N);
for (let w = 0; w < W; w += 1) {
  for (let p = start[w]; p < start[w + 1]; p += 1) { const q = ccur[csrC[p]]++; invW[q] = w; invV[q] = csrV[p]; }
}
rw.length = 0; rc.length = 0; rv.length = 0;
const norm = new Float64Array(W);
for (let w = 0; w < W; w += 1) {
  let s = 0; for (let p = start[w]; p < start[w + 1]; p += 1) s += csrV[p] * csrV[p];
  norm[w] = Math.sqrt(s) || 1;
}

// ─── Randomized truncated SVD (Halko et al.) ────────────────────────────────
const R = DIMS + OVERSAMPLE;
log(`randomized SVD -> ${DIMS} dims (rank ${R}, ${POWER_ITERATIONS} power iterations) ...`);
const rng = mulberry32(SEED);
const Omega = new Float64Array(C * R);
for (let i = 0; i < Omega.length; i += 1) Omega[i] = gauss(rng);
const Y = new Float64Array(W * R); const Z = new Float64Array(C * R);
const aTimes = (X, O) => {
  O.fill(0);
  for (let w = 0; w < W; w += 1) {
    const ob = w * R;
    for (let p = start[w]; p < start[w + 1]; p += 1) {
      const cb = csrC[p] * R; const v = csrV[p];
      for (let d = 0; d < R; d += 1) O[ob + d] += v * X[cb + d];
    }
  }
};
const atTimes = (X, O) => {
  O.fill(0);
  for (let w = 0; w < W; w += 1) {
    const wb = w * R;
    for (let p = start[w]; p < start[w + 1]; p += 1) {
      const cb = csrC[p] * R; const v = csrV[p];
      for (let d = 0; d < R; d += 1) O[cb + d] += v * X[wb + d];
    }
  }
};
function orth(Mx, rows) {
  for (let d = 0; d < R; d += 1) {
    for (let e = 0; e < d; e += 1) {
      let dot = 0;
      for (let r = 0; r < rows; r += 1) dot += Mx[r * R + d] * Mx[r * R + e];
      if (!dot) continue;
      for (let r = 0; r < rows; r += 1) Mx[r * R + d] -= dot * Mx[r * R + e];
    }
    let nr = 0;
    for (let r = 0; r < rows; r += 1) nr += Mx[r * R + d] * Mx[r * R + d];
    nr = Math.sqrt(nr);
    if (nr < 1e-12) { for (let r = 0; r < rows; r += 1) Mx[r * R + d] = 0; continue; }
    for (let r = 0; r < rows; r += 1) Mx[r * R + d] /= nr;
  }
}
aTimes(Omega, Y); orth(Y, W);
for (let q = 0; q < POWER_ITERATIONS; q += 1) {
  atTimes(Y, Z); orth(Z, C);
  aTimes(Z, Y); orth(Y, W);
  log(`  power iteration ${q + 1}/${POWER_ITERATIONS}`);
}

// int8 quantisation, one scale per word (rows are compared by cosine, so a
// per-row scale cancels out of the similarity entirely).
const quant = new Int8Array(W * DIMS);
const scales = new Float32Array(W);
for (let w = 0; w < W; w += 1) {
  const yb = w * R; const qb = w * DIMS;
  let mx = 0;
  for (let d = 0; d < DIMS; d += 1) mx = Math.max(mx, Math.abs(Y[yb + d]));
  const sc = mx / 127 || 1;
  scales[w] = sc;
  for (let d = 0; d < DIMS; d += 1) {
    quant[qb + d] = Math.max(-127, Math.min(127, Math.round(Y[yb + d] / sc)));
  }
}
log('embeddings quantised');

// ─── Lattice: nearest neighbours ────────────────────────────────────────────
log(`lattice: ${EDGES} neighbours/word ...`);
const acc = new Float64Array(W); const touched = new Int32Array(W);
const edgeTo = new Int32Array(W * EDGES); const edgeW = new Float32Array(W * EDGES);
for (let w = 0; w < W; w += 1) {
  let t = 0;
  for (let p = start[w]; p < start[w + 1]; p += 1) {
    const c = csrC[p]; const v = csrV[p];
    for (let q = cstart[c]; q < cstart[c + 1]; q += 1) {
      const o = invW[q];
      if (acc[o] === 0) touched[t++] = o;
      acc[o] += v * invV[q];
    }
  }
  const scored = [];
  for (let i = 0; i < t; i += 1) {
    const o = touched[i];
    if (o !== w) scored.push([o, acc[o] / (norm[w] * norm[o])]);
    acc[o] = 0;
  }
  scored.sort((a, b) => b[1] - a[1]);
  for (let j = 0; j < EDGES; j += 1) {
    const e = scored[j];
    edgeTo[w * EDGES + j] = e ? e[0] : w;
    edgeW[w * EDGES + j] = e ? e[1] : 0;
  }
  if ((w + 1) % 4000 === 0) log(`  ${w + 1}/${W}`);
}

// ─── Typed antonym edges from WordNet ───────────────────────────────────────
log('typed antonym edges ...');
const graph = loadWordnetGraph(DICT);
if (!graph?.stats?.available) throw new Error(`wordnet graph unavailable at ${DICT}`);
const synsetToLemmas = new Map();
for (const [lemma, senses] of graph.sensesOf) {
  for (const sy of senses) {
    if (!synsetToLemmas.has(sy)) synsetToLemmas.set(sy, []);
    synsetToLemmas.get(sy).push(lemma);
  }
}
const antonyms = {};
let antCount = 0;
for (const [lemma, senses] of graph.sensesOf) {
  const wa = wordIds.get(lemma);
  if (wa === undefined) continue;
  const outs = new Set();
  for (const sy of senses) {
    for (const anti of graph.antonymsOf.get(sy) || []) {
      for (const other of synsetToLemmas.get(anti) || []) {
        const wb = wordIds.get(other);
        if (wb !== undefined && wb !== wa) outs.add(wb);
      }
    }
  }
  if (outs.size) { antonyms[wa] = [...outs]; antCount += outs.size; }
}
log(`${antCount} antonym edges over ${Object.keys(antonyms).length} words`);

/**
 * DICTIONARY IDENTITY. The antonym edges above are baked out of
 * scholomance_dict.sqlite, but corpusChecksum only covers the adjective corpus.
 * Rebuild the dictionary — as the Kaikki etymology work does, schema 2 -> 3 —
 * and this substrate's antonyms silently describe the OLD dictionary with
 * nothing to detect it. That is the same silent-success failure that hid the
 * missing scale ladder: the artifact loads fine and is quietly wrong.
 *
 * Hashing 324MB on every server boot is not viable, so identity is the dict's
 * declared schema_version plus the antonym edge count actually taken from it.
 * Either changing means the substrate needs rebuilding.
 */
const dictMeta = new Database(DICT, { readonly: true });
let dictSchemaVersion = null;
try {
  dictSchemaVersion = dictMeta.prepare("SELECT value FROM meta WHERE key='schema_version'").get()?.value ?? null;
} catch {
  // Pre-meta dictionary: recorded as null, which still differs from any version.
}
dictMeta.close();
log(`dictionary identity: schema_version=${dictSchemaVersion}, antonymEdges=${antCount}`);

/**
 * SCALE ORDERS. The v1 substrate shipped embeddings, lattice and antonyms and
 * left these behind, so scaleField.scale has been null in production: the
 * ladder ("dim < shadowy < murky < pitch-black") is what makes the channel a
 * SCALE rather than a neighbour list, and it was simply absent.
 *
 * They are small — measured 2,814 scale_order rows and 4,581 intensity rows
 * against 14.8M in ppmi — so there was never a size reason to omit them. Same
 * shape loadScaleOrders() produces, so the adapter is a drop-in.
 */
log('reading scale orders...');
const db2 = new Database(CORPUS, { readonly: true });
const scaleOrders = {};
let scaleRows = 0;
try {
  for (const r of db2.prepare(
    'SELECT head, word, rank, relative, span FROM scale_order ORDER BY head, rank',
  ).iterate()) {
    (scaleOrders[r.head] ||= []).push({ word: r.word, rank: r.rank, relative: r.relative, span: r.span });
    scaleRows += 1;
  }
} catch {
  // Pre-migration corpus: no orderings, which reads as "no scale measured".
}
const intensity = {};
let intensityRows = 0;
try {
  for (const r of db2.prepare('SELECT * FROM intensity').iterate()) {
    const key = r.word ?? r.lemma;
    if (key == null) continue;
    intensity[key] = r;
    intensityRows += 1;
  }
} catch {
  // Optional table.
}
db2.close();
log(`scale_order: ${scaleRows} rows over ${Object.keys(scaleOrders).length} heads; intensity: ${intensityRows} rows`);

// ─── Emit ───────────────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
const binParts = [
  Buffer.from(quant.buffer, quant.byteOffset, quant.byteLength),
  Buffer.from(new Float32Array(scales).buffer),
  Buffer.from(new Int32Array(edgeTo).buffer),
  Buffer.from(new Float32Array(edgeW).buffer),
];
const bin = Buffer.concat(binParts);
const binPath = join(OUT_DIR, 'adjective-substrate.bin');
writeFileSync(binPath, bin);

const corpusChecksum = createHash('sha256')
  .update(`${meta.books || '?'}:${meta.tokens || '?'}:${N}:${W}:${C}`)
  .digest('hex')
  .slice(0, 16);

const manifest = {
  // v2 adds scaleOrders + intensity. The version is bumped rather than the
  // field added silently, so a stale v1 substrate is REJECTED loudly instead of
  // loading fine and leaving the scale ladder mysteriously null.
  contract: 'SCHOL-ADJ-SUBSTRATE-v2',
  builtAt: new Date().toISOString(),
  generator: 'scripts/build-adjective-substrate.mjs',
  source: { corpus: CORPUS, rows: N, words: W, contexts: C, corpusMeta: meta },
  corpusChecksum,
  // Identity of the DICTIONARY the antonym edges came from, which corpusChecksum
  // does not cover. See the note at the dictionary-identity read above.
  dictSchemaVersion,
  antonymEdges: antCount,
  dims: DIMS,
  edges: EDGES,
  seed: SEED,
  layout: {
    note: 'offsets in bytes into adjective-substrate.bin',
    embeddings: { offset: 0, type: 'Int8', length: W * DIMS },
    scales: { offset: W * DIMS, type: 'Float32', length: W },
    edgeTo: { offset: W * DIMS + W * 4, type: 'Int32', length: W * EDGES },
    edgeWeight: { offset: W * DIMS + W * 4 + W * EDGES * 4, type: 'Float32', length: W * EDGES },
  },
  words,
  antonyms,
  scaleOrders,
  intensity,
};
const manifestPath = join(OUT_DIR, 'adjective-substrate.json');
writeFileSync(manifestPath, JSON.stringify(manifest));

const mb = (p) => (statSync(p).size / 1024 / 1024).toFixed(2);
log(`wrote ${binPath} (${mb(binPath)} MB)`);
log(`wrote ${manifestPath} (${mb(manifestPath)} MB)`);
log(`corpusChecksum ${corpusChecksum}`);

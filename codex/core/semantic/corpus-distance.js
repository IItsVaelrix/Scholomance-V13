/**
 * CORPUS DISTANCE — adjective similarity from company kept, not structure walked
 *
 * The complement to wordnet-distance.js. That module answers well for nouns
 * (100% pair coverage) and verbs (99.3%) and cannot answer for adjectives
 * (0.7%), because WordNet's adjectives are satellite/head islands — 7,502 head
 * synsets with 0.36 head-to-head links each. This module answers exactly where
 * that one abstains, from positive-PMI co-occurrence over running text.
 *
 * The two compose without conflict precisely BECAUSE wordnet-distance returns
 * null rather than a small number when it cannot answer. A caller takes the
 * structural verdict when there is one and falls through to company here when
 * there is not; neither ever has to overrule the other.
 *
 * PURE AND ZERO-I/O (PDR §18 Core law). Vectors are injected as sparse
 * Map<context, ppmi> — see server/adapters/corpusVectors.sqlite.adapter.js.
 *
 * @module codex/core/semantic/corpus-distance
 */

/** Below this many shared contexts, a cosine is arithmetic, not evidence. */
const MIN_SHARED_CONTEXTS = 3;

/**
 * Cosine over two sparse PPMI rows.
 *
 * @param {Map<string, number>} a
 * @param {Map<string, number>} b
 * @returns {{ similarity: number|null, sharedContexts: number }}
 *   similarity is null when neither word was seen enough to have a
 *   distribution, or when they share too few contexts to mean anything.
 *   Null is "the corpus has not observed this", never "unrelated".
 */
export function cosineSparse(a, b) {
  if (!a?.size || !b?.size) return { similarity: null, sharedContexts: 0 };

  // Iterate the smaller row; the union is irrelevant to the dot product.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  let shared = 0;
  for (const [ctx, va] of small) {
    const vb = large.get(ctx);
    if (vb === undefined) continue;
    dot += va * vb;
    shared += 1;
  }
  if (shared < MIN_SHARED_CONTEXTS) return { similarity: null, sharedContexts: shared };

  let na = 0;
  for (const v of a.values()) na += v * v;
  let nb = 0;
  for (const v of b.values()) nb += v * v;
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return { similarity: null, sharedContexts: shared };

  return { similarity: Math.max(0, Math.min(1, dot / denom)), sharedContexts: shared };
}

/**
 * Similarity between two words from their injected corpus vectors.
 *
 * @param {Map<string, Map<string, number>>} vectors  word → sparse PPMI row
 * @param {string} wordA
 * @param {string} wordB
 * @returns {{ similarity: number|null, sharedContexts: number, method: 'corpus-ppmi'|null }}
 */
export function corpusSimilarity(vectors, wordA, wordB) {
  const a = vectors?.get(String(wordA || '').trim().toLowerCase());
  const b = vectors?.get(String(wordB || '').trim().toLowerCase());
  const r = cosineSparse(a, b);
  return { ...r, method: r.similarity === null ? null : 'corpus-ppmi' };
}

/**
 * Rank candidates by corpus similarity to a target, dropping unobserved ones.
 * Unobserved candidates are OMITTED rather than sorted to the bottom — a word
 * the corpus never saw is not a distant word, and ranking it last would state
 * something the data does not support.
 *
 * @returns {Array<{ word: string, similarity: number, sharedContexts: number }>}
 */
export function rankByCorpus(vectors, target, candidates) {
  const out = [];
  for (const c of candidates || []) {
    const r = corpusSimilarity(vectors, target, c);
    if (r.similarity === null) continue;
    out.push({ word: c, similarity: r.similarity, sharedContexts: r.sharedContexts });
  }
  return out.sort((x, y) => y.similarity - x.similarity);
}

// ─── Local frames ────────────────────────────────────────────────────────

/**
 * Below this many surviving dimensions a cosine is arithmetic on noise, so the
 * frame declines rather than returning a confident number off four contexts.
 */
const MIN_FRAME_DIMS = 20;

/**
 * The contexts that DISCRIMINATE inside one neighbourhood.
 *
 * WHY A LOCAL FRAME AT ALL. Measured on the 117-book corpus: global cosine
 * separates same-pole from cross-pole adjective pairs by only 0.0163, because
 * `silent` and `loud` share nearly every context — "room", "voice", "night" —
 * and those shared dimensions dominate the dot product while the handful that
 * actually distinguish the poles get averaged away. Restricting to contexts
 * that vary WITHIN the field raised separation to 0.0450, a 2.8× gain that
 * replicated across all three fields tested:
 *
 *     volume       0.0207 → 0.0755
 *     luminosity   0.0165 → 0.0344
 *     temperature  0.0118 → 0.0250
 *
 * THE CRITERION. A context is kept when at least `minPresence` neighbourhood
 * members have it — fewer than that and no pair can be compared through it —
 * but NOT when every member has it. A context the whole field shares is what
 * makes the field a field; it cannot also tell its members apart.
 *
 * HONEST LIMIT. 2.8× is a ranking improvement, not a classifier. Volume moved
 * from near 0.074 / far 0.053 to near 0.189 / far 0.113 — a visible gap, still
 * an overlapping one.
 *
 * @param {Map<string, Map<string, number>>} vectors
 * @param {string[]} neighbourhood  words forming the local field
 * @param {{ minPresence?: number }} [options]
 * @returns {{ contexts: Set<string>, members: string[], dims: number }}
 */
export function deriveLocalFrame(vectors, neighbourhood, options = {}) {
  const minPresence = options.minPresence ?? 2;
  const members = [];
  const rows = [];
  for (const w of neighbourhood || []) {
    const r = vectors?.get(String(w || '').trim().toLowerCase());
    if (r?.size) { members.push(w); rows.push(r); }
  }

  const presence = new Map();
  for (const r of rows) for (const c of r.keys()) presence.set(c, (presence.get(c) || 0) + 1);

  const contexts = new Set();
  for (const [c, n] of presence) {
    if (n >= minPresence && n < rows.length) contexts.add(c);
  }
  return { contexts, members, dims: contexts.size };
}

/** Project a sparse row onto a frame's contexts. */
function project(row, contexts) {
  if (!row) return null;
  const out = new Map();
  for (const [c, v] of row) if (contexts.has(c)) out.set(c, v);
  return out;
}

/**
 * Cosine inside a local frame rather than the global context space.
 *
 * A frame with too few surviving dimensions returns null so the caller can fall
 * back to the global cosine — a narrow frame is a weaker measurement than the
 * global one, not a stronger one, and silently preferring it would trade a
 * noisy answer for a confident-looking noisier answer.
 *
 * @param {Map<string, Map<string, number>>} vectors
 * @param {string} wordA
 * @param {string} wordB
 * @param {{ contexts: Set<string>, dims: number }} frame  from deriveLocalFrame
 * @returns {{ similarity: number|null, sharedContexts: number, frameDims: number,
 *   method: 'corpus-ppmi-local'|null }}
 */
export function localCosine(vectors, wordA, wordB, frame) {
  const dims = frame?.dims ?? 0;
  const none = { similarity: null, sharedContexts: 0, frameDims: dims, method: null };
  if (!frame?.contexts || dims < MIN_FRAME_DIMS) return none;

  const a = project(vectors?.get(String(wordA || '').trim().toLowerCase()), frame.contexts);
  const b = project(vectors?.get(String(wordB || '').trim().toLowerCase()), frame.contexts);
  const r = cosineSparse(a, b);
  if (r.similarity === null) return { ...none, sharedContexts: r.sharedContexts };
  return { ...r, frameDims: dims, method: 'corpus-ppmi-local' };
}

/**
 * Bootstrap a neighbourhood for a word that has no curated cluster, by taking
 * its nearest global neighbours. WordNet supplies a real cluster for words it
 * covers; measured, 35% of this corpus's adjective vocabulary is outside it,
 * and those words still need a frame.
 *
 * The global cosine is weak — that is the whole reason the local frame exists —
 * so this is a seed, not a verdict. It only has to gather roughly the right
 * company for the frame to then sharpen.
 *
 * @returns {string[]} the word itself plus its top-k neighbours
 */
export function bootstrapNeighbourhood(vectors, word, candidates, k = 24) {
  const target = String(word || '').trim().toLowerCase();
  const ranked = rankByCorpus(vectors, target, (candidates || []).filter((c) => c !== target));
  return [target, ...ranked.slice(0, k).map((r) => r.word)];
}

/**
 * The combined verdict: structure first, company second.
 *
 * Structure is preferred when available because it is curated — a lexicographer
 * asserted the relation. Co-occurrence is inferred, and it will happily report
 * that `shadowy` and `lantern` are close because they share prose, which is
 * association rather than similarity. That is the right fallback and the wrong
 * primary.
 *
 * @param {{ similarity: number|null, method: string|null }} wordnetResult
 * @param {{ similarity: number|null, method: string|null }} corpusResult
 */
export function combineVerdicts(wordnetResult, corpusResult) {
  if (wordnetResult?.similarity !== null && wordnetResult?.similarity !== undefined) {
    return { similarity: wordnetResult.similarity, method: wordnetResult.method, source: 'wordnet' };
  }
  if (corpusResult?.similarity !== null && corpusResult?.similarity !== undefined) {
    return { similarity: corpusResult.similarity, method: corpusResult.method, source: 'corpus' };
  }
  return { similarity: null, method: null, source: null };
}

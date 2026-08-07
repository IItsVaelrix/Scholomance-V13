/**
 * WORDNET GRAPH DISTANCE — semantic distance from the lexical hierarchy
 *
 * Answers "how close in meaning are these two words" from WordNet's own
 * structure, for words the graph actually covers.
 *
 * WHY THIS EXISTS. semantotopography resolves open-class words by morphology:
 * `shadowy`, `murky`, `radiant` and `gloomy` all reduce to the single primitive
 * ["STATE"], so all four occupy one point and cos(shadowy, radiant) reads a
 * perfect 1.0000. Measured over the lexicon, that map holds 7,161 distinct
 * addresses for 84,677 single-word lemmas — 11,543 of them in ["STATE"] alone.
 * No clustering, curvature or added axis separates points that are identical;
 * the coordinates have to carry the distinction first. This module is the
 * cheapest source of that distinction, because the graph is already local.
 *
 * PURE AND ZERO-I/O (PDR §18 Core law). The graph is injected, exactly as
 * freqMap and posMap are injected into phraseAnalysis. See
 * server/adapters/wordnetGraph.sqlite.adapter.js for the loader.
 *
 * ─── THE THREE THINGS THIS DELIBERATELY REFUSES TO DO ──────────────────────
 *
 * 1. ANTONYM IS NOT AN EDGE. `hot` and `cold` are one hop apart in WordNet and
 *    maximally opposite in meaning. Walking antonym edges would score `radiant`
 *    as a near-neighbour of `shadowy` — reinstating the exact collapse this
 *    module exists to remove. Oppositeness is a real signal; it is simply not
 *    the same signal as distance, and it gets its own channel.
 *
 * 2. NO RAW HOP COUNT ACROSS THE NOUN HIERARCHY. Measured: the highest-degree
 *    synsets are "city" (665 edges), "woman" (459) and "man" (435). Raw path
 *    length routes through those hubs, which put `granite` exactly 8 hops from
 *    `shadowy` — tied with `gloomy`, which is a real neighbour. Wu-Palmer reads
 *    the depth of the lowest common subsumer instead, so a path that only meets
 *    at the top of the tree scores near zero however few hops it took.
 *
 * 3. NO NUMBER WHEN THE GRAPH CANNOT ANSWER. WordNet's adjectives are not a
 *    hierarchy — they are satellite/head clusters, and measured there are 7,502
 *    head synsets carrying only 2,709 head-to-head edges: 0.36 links per
 *    cluster. Most adjective clusters are islands. `shadowy` and `dusky` are
 *    genuinely close in English and sit in different islands, so the graph has
 *    no path and no opinion. Returning 0.09 there would be inventing evidence;
 *    `similarity: null, method: null` says the true thing, and lets a caller
 *    fall back to a channel that does know.
 *
 * @module codex/core/semantic/wordnet-distance
 */

/** Relations that mean "related to", walked as undirected edges. */
export const RELATEDNESS_RELS = Object.freeze([
  'hypernym', 'hyponym', 'instance_hypernym', 'instance_hyponym',
  'similar', 'also', 'attribute',
]);

/** Relations that carry meaning but NOT proximity. Never walked as distance. */
export const NON_DISTANCE_RELS = Object.freeze(['antonym']);

/**
 * WordNet's noun hierarchy runs about 14 levels deep. Measured on a 150-pair
 * noun sample: a cap of 6 answered only 34.7% of pairs, 10 answered 89.3%, and
 * 14 answered 100% — while `dog`/`wolf` rose from 0.857 to 0.909 and
 * `river`/`democracy` stayed at 0.000. A cap below the tree's own depth does
 * not make the metric conservative; it makes it silently blind to any pair
 * whose common subsumer sits near the root.
 */
const DEFAULT_MAX_DEPTH = 14;

/**
 * @typedef {object} WordnetGraph
 * @property {Map<string, string[]>} sensesOf        lemma → synset ids
 * @property {Map<string, string[]>} hypernymsOf     synset → parent synset ids
 * @property {Map<string, string[]>} relatedOf       synset → undirected neighbours
 * @property {Map<string, string>}   posOf           synset → 'n'|'v'|'a'|'s'|'r'
 * @property {Map<string, string[]>} headsOf         adjective satellite → head synsets
 */

/**
 * @typedef {object} WordnetSimilarity
 * @property {number|null} similarity  [0,1], or null when the graph cannot answer
 * @property {'identity'|'wu-palmer'|'adjective-cluster'|null} method
 * @property {number|null} lcsDepth    depth of the lowest common subsumer, when used
 */

const UNKNOWN = Object.freeze({ similarity: null, method: null, lcsDepth: null });

/** All ancestors of a synset with their minimum depth, root included. */
function ancestorDepths(graph, synsetId, maxDepth) {
  const depths = new Map([[synsetId, 0]]);
  let frontier = [synsetId];
  for (let d = 1; d <= maxDepth; d += 1) {
    const next = [];
    for (const node of frontier) {
      for (const parent of graph.hypernymsOf.get(node) || []) {
        if (depths.has(parent)) continue;
        depths.set(parent, d);
        next.push(parent);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return depths;
}

/**
 * Wu-Palmer over two synsets: 2·depth(LCS) / (depth(a) + depth(b)), where depth
 * is measured from the root down. Reads 0 when the only common ancestor is the
 * root itself, which is the correct verdict for `granite` and `gloomy`.
 */
function wuPalmerPair(graph, a, b, maxDepth) {
  const upA = ancestorDepths(graph, a, maxDepth);
  const upB = ancestorDepths(graph, b, maxDepth);

  // Root distance for a synset = how far UP it is to the deepest shared node.
  let best = null;
  for (const [node, da] of upA) {
    const dbz = upB.get(node);
    if (dbz === undefined) continue;
    /**
     * depth(subsumer) is its distance from the ROOT — the longest upward chain.
     * Counting distinct ancestors instead overcounts badly under WordNet's
     * multiple inheritance, where one synset can have several parents at the
     * same level, and inflates every score that passes through such a node.
     */
    const upSub = ancestorDepths(graph, node, maxDepth);
    let subsumerDepth = 0;
    for (const d of upSub.values()) if (d > subsumerDepth) subsumerDepth = d;
    // Wu-Palmer: 2·depth(LCS) / (depth(a) + depth(b)), with depth(x) = dx + depth(LCS).
    const denom = da + dbz + 2 * subsumerDepth;
    const score = denom === 0 ? 1 : (2 * subsumerDepth) / denom;
    if (best === null || score > best.score) best = { score, node, subsumerDepth };
  }
  if (!best) return null;
  return { similarity: Math.max(0, Math.min(1, best.score)), lcsDepth: best.subsumerDepth };
}

/**
 * Adjective proximity is cluster membership, not path length. Two satellites of
 * the same head are the same idea; satellites of different heads are, as far as
 * WordNet is concerned, unrelated — and saying so is the honest answer.
 */
function adjectiveCluster(graph, sensesA, sensesB) {
  const headsA = new Set();
  const headsB = new Set();
  for (const s of sensesA) for (const h of graph.headsOf.get(s) || []) headsA.add(h);
  for (const s of sensesB) for (const h of graph.headsOf.get(s) || []) headsB.add(h);
  if (headsA.size === 0 || headsB.size === 0) return null;

  let shared = 0;
  for (const h of headsA) if (headsB.has(h)) shared += 1;
  if (shared === 0) return null;   // different islands: no opinion, not "far"

  // Jaccard over head clusters: how much of each word's sense range coincides.
  const union = new Set([...headsA, ...headsB]).size;
  return { similarity: shared / union, lcsDepth: null };
}

function isAdjective(graph, synsetId) {
  const pos = graph.posOf.get(synsetId);
  return pos === 'a' || pos === 's';
}

/**
 * Semantic similarity between two words, or an explicit "cannot answer".
 *
 * @param {WordnetGraph} graph
 * @param {string} wordA
 * @param {string} wordB
 * @param {{ maxDepth?: number }} [options]
 * @returns {WordnetSimilarity}
 */
export function wordnetSimilarity(graph, wordA, wordB, options = {}) {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const a = String(wordA || '').trim().toLowerCase();
  const b = String(wordB || '').trim().toLowerCase();
  if (!a || !b) return UNKNOWN;

  const sensesA = graph.sensesOf.get(a);
  const sensesB = graph.sensesOf.get(b);
  // Not in WordNet at all is not "unrelated" — it is unmeasured.
  if (!sensesA?.length || !sensesB?.length) return UNKNOWN;

  // A shared synset is identity of sense, whatever the part of speech.
  const setB = new Set(sensesB);
  for (const s of sensesA) {
    if (setB.has(s)) return { similarity: 1, method: 'identity', lcsDepth: null };
  }

  // Adjectives first: they have no hypernym tree, so Wu-Palmer would silently
  // read 0 for every adjective pair and look like a confident "unrelated".
  const adjA = sensesA.some((s) => isAdjective(graph, s));
  const adjB = sensesB.some((s) => isAdjective(graph, s));
  if (adjA && adjB) {
    const cluster = adjectiveCluster(graph, sensesA, sensesB);
    if (!cluster) return UNKNOWN;
    return { similarity: cluster.similarity, method: 'adjective-cluster', lcsDepth: null };
  }

  let best = null;
  for (const sa of sensesA) {
    if (isAdjective(graph, sa)) continue;
    for (const sb of sensesB) {
      if (isAdjective(graph, sb)) continue;
      if (graph.posOf.get(sa) !== graph.posOf.get(sb)) continue;  // n vs v is not comparable
      const wp = wuPalmerPair(graph, sa, sb, maxDepth);
      if (wp && (best === null || wp.similarity > best.similarity)) best = wp;
    }
  }
  if (!best) return UNKNOWN;
  return { similarity: best.similarity, method: 'wu-palmer', lcsDepth: best.lcsDepth };
}

/**
 * Every synset a word occupies, plus the head of each adjective cluster it
 * belongs to.
 *
 * WHY THE HEADS. WordNet records adjective antonymy between HEAD synsets, not
 * between satellites. `bright` sits in the cluster headed by oewn-00270855-a
 * ("having lots of light"), and `dark`'s head oewn-00273948-a carries
 * `antonym → oewn-00270855-a`. Checking satellite synsets alone never sees that
 * edge, which is why a satellite-only test reported bright/dark — and every
 * other adjective pair — as not opposites.
 */
function sensesWithHeads(graph, word) {
  const senses = graph.sensesOf.get(String(word || '').trim().toLowerCase()) || [];
  const out = new Set(senses);
  for (const s of senses) {
    for (const h of graph.headsOf.get(s) || []) out.add(h);
  }
  return out;
}

/**
 * Whether two words are recorded as opposites. Kept separate from distance on
 * purpose — see note 1 in the module header.
 *
 * Poles of one scale are the hardest case for any distributional measure:
 * `silent` and `loud` share nearly every context, so co-occurrence ranks them
 * as neighbours. This is the channel that says otherwise.
 *
 * @returns {boolean}
 */
export function areAntonyms(graph, wordA, wordB) {
  const a = sensesWithHeads(graph, wordA);
  const b = sensesWithHeads(graph, wordB);
  if (a.size === 0 || b.size === 0) return false;

  for (const sa of a) {
    for (const target of graph.antonymsOf?.get(sa) || []) {
      if (b.has(target)) return true;
    }
  }
  // The relation is symmetric in WordNet, but both directions are not always
  // materialised for satellites, so the reverse is checked rather than assumed.
  for (const sb of b) {
    for (const target of graph.antonymsOf?.get(sb) || []) {
      if (a.has(target)) return true;
    }
  }
  return false;
}

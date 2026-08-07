/**
 * SCALE STRUCTURE — which neighbourhoods have a height, and how tall they are
 *
 * A degree score is only meaningful inside a scale, and only some
 * neighbourhoods ARE scales. This module answers the question that was being
 * skipped: before asking "how intense is this word", ask "does this word sit on
 * something with a vertical at all".
 *
 * ─── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * WordNet's adjective clusters vary by three orders of magnitude — 14,716
 * clusters, median size 1, p90 5, max 389 — so a fixed [0,1] normalisation
 * stretches `damp/wet/soaked` and crushes a 389-member cluster onto the same
 * ruler. But size is not height either: the largest clusters are the FLATTEST.
 *
 *     389  "being or denoting a numerical quantity"
 *     267  "being or having or characterized by hue"
 *     184  "being or denoting a numerical order"
 *
 * `blue` is not a stronger `red`; `hexagonal` is not a more intense `round`.
 * Those members are ALTERNATIVES, not degrees — many words, no altitude.
 *
 * ─── TWO SIGNALS MEASURED AND REJECTED ────────────────────────────────────
 *
 * 1. Fraction of cluster members showing gradability in the corpus. Failed:
 *    `hue` read 0.90 and `numerical` 1.00, against `dark` at 1.00. Polysemy
 *    defeats it — a word in the numerical cluster is gradable in some other
 *    sense entirely.
 *
 * 2. Spread of the members' intensifier profiles. Failed: scalar `good` (sd
 *    0.119) sat BELOW categorical `shape` (sd 0.260). No separating threshold
 *    exists.
 *
 * ─── THE SIGNAL THAT WORKS IS STRUCTURAL, NOT STATISTICAL ─────────────────
 *
 * WordNet's `attribute` relation links an adjective head to the NOUN whose
 * values it ranges over, and that is exactly the "is there a vertical here"
 * question, already answered by a lexicographer:
 *
 *     dark   -> "the visual effect of illumination on objects"   2 poles
 *     loud   -> "the magnitude of sound"                         2 poles
 *     large  -> "the physical magnitude of something"            2 poles
 *     hot    -> "the degree of hotness or coldness of a body"    4 poles
 *     numerical / shape / order -> no attribute
 *
 * COVERAGE IS THE HONEST LIMIT. Only 562 of 14,716 adjective heads carry an
 * attribute (3.8%); 2,614 carry an antonym head (17.8%). So this confidently
 * names a few hundred scales, not the whole lexicon — and it says `unknown`
 * for the rest rather than guessing a height for flat ground.
 *
 * PURE AND ZERO-I/O (PDR §18 Core law). The graph is injected.
 *
 * @module codex/core/semantic/scale-structure
 */

/**
 * @typedef {'scalar'|'singleton'|'unstructured'} ScaleKind
 *
 *   scalar        an attribute noun names the dimension, on this pole or on its
 *                 opposite. A height exists and WordNet says what it measures.
 *   singleton     one member. Nothing to order — half of all clusters.
 *   unstructured  members are alternatives, not degrees. NO height. Asking for
 *                 an intensity here is the category error this module prevents.
 *
 * THERE IS NO `polar` KIND, and its removal was forced by measurement. It began
 * as a hedge — "opposing poles but no named dimension, probably a scale" — and
 * probably was wrong. The largest such clusters were exactly the flat ones:
 *
 *     361  "being or denoting a numerical quantity"
 *     184  "being or denoting a numerical order in a series"
 *      87  "having or given a form or shape"
 *      72  "having patterns"
 *      42  "having or covered with leaves"
 *
 * An antonym alone does not make a scale. `shaped`/`shapeless` and
 * `leafy`/`leafless` are CONTRADICTORY — presence against absence, with no
 * middle — while `hot`/`cold` are CONTRARY, with `warm` between them. Only the
 * second kind has anything to order.
 *
 * Cluster size does not separate them either: at 14 members, "quick or skillful
 * in action" is a scale and "having or covered with feathers" is a binary.
 */

/**
 * Classify one adjective cluster.
 *
 * @param {object} graph            from wordnetGraph.sqlite.adapter
 * @param {string} head             head synset id
 * @returns {{kind: ScaleKind, attribute: string|null, oppositeHead: string|null,
 *   memberCount: number, members: string[]}}
 */
export function classifyCluster(graph, head) {
  const members = [...(graph.clusterMembers?.get(head) || [])];
  const own = (graph.attributeOf?.get(head) || [])[0] || null;
  const oppositeHead = (graph.antonymsOf?.get(head) || [])[0] || null;

  /**
   * A DIMENSION NAMED ON EITHER POLE COUNTS FOR BOTH.
   *
   * WordNet attaches `attribute` unevenly across an opposed pair, so requiring
   * it on this pole alone discarded real scales: `not having a sharp edge`
   * carries no link while its opposite `having a thin edge or sharp point`
   * does, and `impossible to measure` is flat while `capable of being measured`
   * names the dimension. The two poles share one axis by definition; whichever
   * end the lexicographer labelled, the axis is the same.
   */
  const viaOpposite = !own && oppositeHead
    ? (graph.attributeOf?.get(oppositeHead) || [])[0] || null
    : null;
  const attribute = own || viaOpposite;

  let kind;
  if (attribute) kind = 'scalar';
  else if (members.length <= 1) kind = 'singleton';
  else kind = 'unstructured';

  return {
    kind,
    attribute,
    // Which end of the axis carried the label. Useful when auditing a verdict.
    attributeVia: own ? 'self' : (viaOpposite ? 'opposite' : null),
    oppositeHead,
    memberCount: members.length,
    members,
  };
}

/**
 * The scales a word sits on. A word in no cluster gets an empty list, which
 * reads as "unplaced", never as "flat".
 *
 * @returns {Array<{head: string, kind: ScaleKind, attribute: string|null, members: string[]}>}
 */
export function scalesOf(graph, word) {
  const w = String(word || '').trim().toLowerCase();
  const out = [];
  const seen = new Set();
  for (const sense of graph.sensesOf?.get(w) || []) {
    for (const head of graph.headsOf?.get(sense) || []) {
      if (seen.has(head)) continue;
      seen.add(head);
      const c = classifyCluster(graph, head);
      out.push({ head, kind: c.kind, attribute: c.attribute, members: c.members });
    }
  }
  return out;
}

/**
 * Whether a degree score is meaningful for a word IN A GIVEN CLUSTER.
 *
 * This is the gate that was missing. Three filters were built to keep
 * `impossible` out of an intensity ranking and each leaked somewhere new,
 * because they answered "how tall is this" for words standing on flat ground.
 * Ask whether there is a vertical first.
 *
 * THE CLUSTER ARGUMENT IS NOT OPTIONAL, and the measurement is why. A
 * word-level version of this function returned true for `blue`, `crimson`,
 * `impossible` and `unknown`, because across all its senses almost every word
 * touches SOME scale. Worse, picking a word's "first scalar cluster" resolved
 * `dark` to a hair-colour scale (brown, adust, black-haired), `loud` to
 * vulgarity (brassy, cheap, flashy) and `cold` to spoiled food (addled,
 * flyblown, maggoty). A word is not on a scale; a word IN A SENSE is.
 *
 * @param {object} graph
 * @param {string} word
 * @param {string} head   the cluster the caller has already settled on
 */
export function admitsDegree(graph, word, head) {
  const w = String(word || '').trim().toLowerCase();
  if (!graph.clusterMembers?.get(head)?.has(w)) return false;
  const kind = classifyCluster(graph, head).kind;
  return kind === 'scalar';
}

/**
 * ADAPTABLE HEIGHT — a scale is ranked in ITS OWN units, not on a shared ruler.
 *
 * Scales differ enormously in how much vertical they actually span. The
 * distance from `small` to `celestial` is not the distance from `cool` to
 * `cold`, and flattening both to [0,1] asserts that it is. So the return value
 * carries BOTH the position and the evidence of how far the scale reaches:
 * `rank` orders the members, `span` reports the observed extent, and a caller
 * comparing across scales has to reckon with span rather than being handed a
 * number that hides it.
 *
 * Members with no observed degree are omitted, not sorted to the bottom — an
 * unmeasured word is not a mild one.
 *
 * @param {object} graph
 * @param {string} head                       the cluster to order
 * @param {Map<string, number>} degreeOf      word -> raw degree observation
 * @returns {{kind: ScaleKind, span: number|null, ordered: Array<{word: string,
 *   raw: number, rank: number, relative: number}>}}
 */
export function orderScale(graph, head, degreeOf) {
  const c = classifyCluster(graph, head);
  if (c.kind !== 'scalar') {
    return { kind: c.kind, span: null, ordered: [] };
  }

  const seen = [];
  for (const w of c.members) {
    const raw = degreeOf?.get(w);
    if (typeof raw !== 'number') continue;      // unmeasured, not mild
    seen.push({ word: w, raw });
  }
  if (seen.length < 2) return { kind: c.kind, span: null, ordered: [] };

  seen.sort((a, b) => a.raw - b.raw);
  const lo = seen[0].raw;
  const hi = seen[seen.length - 1].raw;
  const span = hi - lo;

  return {
    kind: c.kind,
    span,
    ordered: seen.map((s, i) => ({
      word: s.word,
      raw: s.raw,
      rank: i + 1,
      // Position WITHIN this scale. Meaningless across scales — that is what
      // `span` is reported for.
      relative: span === 0 ? 0 : (s.raw - lo) / span,
    })),
  };
}

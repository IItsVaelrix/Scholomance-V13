/**
 * GOVERNED SENSE — which cluster an adjective belongs to, decided by its governor
 *
 * The governor of an attributive adjective is the noun it is predicated of, and
 * that one word settles which sense is meant:
 *
 *     shadowy wood      -> wood      keeps company with shade-words
 *     shadowy figure    -> figure    keeps company with indistinctness-words
 *
 * ─── WHAT SCORES THE CLUSTERS, AND WHAT MEASURABLY DOES NOT ───────────────
 *
 * WU-PALMER SCORED 0 OF 3. Comparing a cluster's adjective members to the
 * governing noun through the noun hierarchy only connects when a member happens
 * to carry a noun sense, so the score is accidental polysemy rather than
 * signal. It put `shadowy wood` on "lacking material form" (0.706) and
 * `shadowy figure` on the same cluster (0.615) — the same failure mode that
 * kept taxonomic similarity out of the page's sense probe.
 *
 * CORPUS AFFINITY SCORED 2 OF 3. Mean PPMI between a cluster's members and the
 * governing noun put `wood` on "protected from heat and light with shade"
 * (0.628) and `figure` on "not clearly defined" (0.549), both correct.
 *
 * THE THIRD CASE IS WHY THE SUPPORT FLOOR EXISTS. `shadowy dealings` picked the
 * shade cluster at 0.774 off ONE co-occurring member out of six, beating two
 * clusters that had none. A single observation is not evidence, and a cluster
 * with zero observations is UNMEASURED rather than unrelated — ranking 0.000
 * as "distant" is the conflation this codebase has had to correct repeatedly.
 * Below the floor the function declines to choose, which for `dealings` is the
 * honest answer: 19th-century literary prose barely contains the word.
 *
 * PURE AND ZERO-I/O (PDR §18 Core law). Graph and vectors are injected.
 *
 * @module codex/core/semantic/governed-sense
 */

import { scalesOf } from './scale-structure.js';

/**
 * Members that must actually co-occur with the governor before a cluster is
 * allowed to win. Measured: at 1 the method picks a cluster off a single stray
 * PPMI value and beats clusters with no evidence at all.
 */
const MIN_SUPPORT = 3;

/** A winner must beat the runner-up by this much, or the evidence is a tie. */
const MIN_MARGIN = 0.05;

/**
 * @typedef {object} GovernedSenseVerdict
 * @property {string|null} head        winning cluster, or null when undecided
 * @property {number|null} score       mean affinity of that cluster to the governor
 * @property {number|null} support     how many members carried the evidence
 * @property {'selected'|'insufficient_support'|'tied'|'no_candidates'|'no_governor'} reason
 * @property {Array} candidates        every cluster considered, ranked
 */

/**
 * Choose the cluster an adjective occupies, given the noun that governs it.
 *
 * @param {object} graph                   wordnet graph (for scalesOf)
 * @param {object} vectors                 corpus vectors (sparse PPMI rows)
 * @param {string} adjective
 * @param {string} governor                the noun resolved by governor.js
 * @param {{ minSupport?: number, minMargin?: number }} [options]
 * @returns {GovernedSenseVerdict}
 */
export function selectGovernedSense(graph, vectors, adjective, governor, options = {}) {
  const minSupport = options.minSupport ?? MIN_SUPPORT;
  const minMargin = options.minMargin ?? MIN_MARGIN;
  const adj = String(adjective || '').trim().toLowerCase();
  const gov = String(governor || '').trim().toLowerCase();

  const none = (reason, candidates = []) => ({
    head: null, score: null, support: null, reason, candidates,
  });
  if (!adj || !gov) return none('no_governor');

  const clusters = scalesOf(graph, adj);
  if (clusters.length === 0) return none('no_candidates');

  const candidates = clusters.map((c) => {
    const values = [];
    for (const member of c.members) {
      if (member === adj) continue;
      const ppmi = vectors?.get(member)?.get(gov);
      // Absent means the corpus never saw the pair. It contributes nothing —
      // it does NOT contribute a zero, which would drag a mean toward "distant".
      if (typeof ppmi === 'number' && ppmi > 0) values.push(ppmi);
    }
    const support = values.length;
    return {
      head: c.head,
      kind: c.kind,
      score: support ? values.reduce((a, b) => a + b, 0) / support : 0,
      support,
      memberCount: c.members.length,
    };
  }).sort((a, b) => b.score - a.score);

  /**
   * FILTER BEFORE RANKING, not after.
   *
   * Ranking first and then testing the winner's support let an under-evidenced
   * candidate occupy the top slot and veto the whole decision. Measured on
   * `the dark wood`: "not enlightened; ignorant" led at 0.567 off ONE member,
   * pushing the correct "devoid of or deficient in light" — 0.380 across TEN
   * members — into second place, and the function then abstained on the
   * strength of the interloper. A candidate that cannot clear the evidence
   * floor is not a weaker answer; it is not an answer, and it does not belong
   * in the ranking at all.
   */
  const eligible = candidates.filter((c) => c.support >= minSupport);
  const top = eligible[0];
  if (!top) {
    const best = candidates[0];
    return { ...none('insufficient_support', candidates), score: best?.score ?? null, support: best?.support ?? 0 };
  }

  /**
   * A runner-up that also clears the floor and scores within a hair is a TIE,
   * not a win. Reporting the near-miss as a selection would hand a reader a
   * confident answer built on a difference the evidence cannot support.
   */
  const rival = eligible.find((c) => c.head !== top.head);
  if (rival && top.score - rival.score < minMargin) {
    return { ...none('tied', candidates), score: top.score, support: top.support };
  }

  return { head: top.head, score: top.score, support: top.support, reason: 'selected', candidates };
}

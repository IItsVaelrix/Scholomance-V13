/**
 * CUE ARBITER — the traffic cop for competing syntactic cues
 *
 * Head selection and governor resolution each run several cues whose precedence
 * lives in statement order, and whose winner is never recorded. That has broken
 * things twice already, in both directions:
 *
 *   A CUE APPLIED UNCONDITIONALLY. Filtering the nominal pool through
 *   resolveFrame fixed neither case it targeted AND flipped `he wound the clock`
 *   onto `clock`, discarding the heteronym the query exists to disambiguate.
 *   The only available remedy was deleting the cue wholesale, because there was
 *   no way to say "this cue does not get to speak here".
 *
 *   A CUE FIRING ON A SHAPE IT DOES NOT COVER. `past the barn` resolved
 *   `past` as an attributive adjective governing `barn`, because `past` carries
 *   an "a" tag and nothing outranked that tag.
 *
 * So cues stop being statements and become DECLARATIONS. Each names itself,
 * returns support / veto / abstain, and the arbiter reports which one decided.
 * A caller can then show its work, and a new cue can be added without silently
 * reordering the old ones.
 *
 * ─── THE THREE RULES ──────────────────────────────────────────────────────
 *
 * 1. A VETO IS ABSOLUTE. Vetoes encode structural impossibility, not low
 *    confidence — a determiner between an adjective and a noun does not make
 *    attributive attachment unlikely, it makes it ungrammatical. No amount of
 *    support outweighs one.
 *
 * 2. ABSTENTION IS NOT A VOTE. A cue with nothing to say contributes nothing,
 *    and is never counted as evidence against. This is the same discipline the
 *    distance channels keep: unmeasured is not "unrelated".
 *
 * 3. THE WINNER IS NAMED. `decidedBy` travels with the verdict, so an
 *    unexplained answer becomes impossible to ship — the failure mode that let
 *    wordnet's rank-1 pass as an evidenced sense until it was caught rendering
 *    "United States film actress (1938-1981)".
 *
 * PURE AND ZERO-I/O (PDR §18 Core law).
 *
 * @module codex/core/constellation/cue-arbiter
 */

/**
 * @typedef {object} Cue
 * @property {string} name        stable identifier, reported as `decidedBy`
 * @property {'support'|'veto'|'abstain'} verdict
 * @property {number} [precedence] higher wins among supporters; default 0
 * @property {*} [payload]        whatever the cue wants to hand its caller
 */

/**
 * @typedef {object} Ruling
 * @property {boolean} decided
 * @property {string|null} decidedBy   the supporting cue that won
 * @property {string|null} vetoedBy    the first veto, when one fired
 * @property {*} payload               the winning cue's payload
 * @property {string[]} supported      every supporting cue, ranked
 * @property {string[]} abstained      cues that had nothing to say
 */

const EMPTY = Object.freeze({
  decided: false, decidedBy: null, vetoedBy: null,
  payload: null, supported: [], abstained: [],
});

/**
 * Resolve a set of cue declarations into one ruling.
 *
 * @param {Cue[]} cues
 * @returns {Ruling}
 */
export function arbitrate(cues) {
  const list = Array.isArray(cues) ? cues.filter(Boolean) : [];
  if (list.length === 0) return { ...EMPTY };

  const abstained = list.filter((c) => c.verdict === 'abstain').map((c) => c.name);

  /**
   * Vetoes are checked before supporters are even ranked. Ranking first and
   * then testing the winner is the shape that let an under-evidenced candidate
   * occupy the top slot and veto a whole decision in governed-sense; the same
   * ordering error is not repeated here.
   */
  const veto = list.find((c) => c.verdict === 'veto');
  if (veto) {
    return {
      decided: false, decidedBy: null, vetoedBy: veto.name,
      payload: null, supported: [], abstained,
    };
  }

  const supporters = list
    .filter((c) => c.verdict === 'support')
    .sort((a, b) => (b.precedence ?? 0) - (a.precedence ?? 0));

  if (supporters.length === 0) {
    return { ...EMPTY, abstained };
  }

  const winner = supporters[0];
  return {
    decided: true,
    decidedBy: winner.name,
    vetoedBy: null,
    payload: winner.payload ?? null,
    supported: supporters.map((c) => c.name),
    abstained,
  };
}

/** Convenience constructors, so a cue site reads as a declaration. */
export const support = (name, payload, precedence = 0) => ({ name, verdict: 'support', payload, precedence });
export const veto = (name) => ({ name, verdict: 'veto' });
export const abstain = (name) => ({ name, verdict: 'abstain' });

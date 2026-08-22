/**
 * NP ANCHOR — the nominal head the parser already computed, read back out.
 *
 * `projectAnswer` asks a chart for `{subject, verb}`. That is the right question for a
 * clause and the wrong one for `the shadowy wood`, which has neither. The clause projection
 * reads `chart.stable`, and only `S` reaches `stable`, so a phrase whose only complete
 * reading is an NP projects nothing at all — even though the chart contains
 * `NP[0-2] head=["wood"]` in `chart.spanning`.
 *
 * That is semantic-chemistry §20: `root = S` is not the same as "valid complete utterance",
 * and an NP utterance is a legitimate root the doorway does not admit.
 *
 * THIS MODULE DOES NOT ADMIT IT. Promoting NP into `stable` would change what the parser
 * accepts, move every treebank-gate number, and is the named failure mode in §27.4 (fake
 * coverage: admitting broad root categories because coverage rises). So this reads, and
 * writes nothing:
 *
 *     chart -> full-span NP molecule -> nucleus.headLemmas -> anchor
 *
 * Pure, zero-I/O. Takes a chart, returns a string or null. No chart is mutated.
 *
 * ─── REFUTED FOR WIRING — DENY-0002, 2026-08-19 ───────────────────────────────
 * This module WORKS and is NOT wired, deliberately. Measured on 809 held-out short
 * NPs (`2026-08-19-seam-2-np-anchor.json`, checksum 24f1bb7708aadf71) with the live
 * lexicon:
 *
 *     last token tagged `n`   0.8616   <- one line of code
 *     npAnchor (this module)  0.7874   (answers 86.0% of the time, 91.5% right when it does)
 *     shipped phrase layer    0.7676
 *     clause projection       0.0099   <- what this module was built to replace
 *
 * The diagnosis was right — the clause projection really does discard the answer
 * (0.0099 confirms it) — and fixing it still does not pay. npAnchor loses to
 * `lastTaggedNoun` (McNemar chi2cc 29.5 against) and does not separate from what
 * already ships (chi2cc 1.48, p~0.22).
 *
 * It unbinds if the lexicon is thin: at 31% POS coverage the ranking inverts —
 * lastTaggedNoun 0.4116, npAnchor 0.4747, phrase layer 0.7033. Anyone re-proposing
 * this must measure on a lexicon-poor corpus, not a rich one.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { headsOf } from './compose-packed.js';

/** Molecule types that name a nominal constituent, most specific first. */
const NOMINAL_TYPES = ['NP', 'NC', 'N'];

/**
 * Molecule types that can head a whole UTTERANCE, phrase-level before atom-level.
 *
 * Wider than `NOMINAL_TYPES` because this list answers a different question. A bare
 * `PROPN`, a `DATE` and an `APPOS` are not noun phrases, but they are perfectly good
 * sentence roots — `Tayib Rauf , 21 , Birmingham` and `07/06/2000 14:57` are both
 * complete UD sentences with a nominal gold root.
 *
 * Ordered, and the order is load-bearing: a full-span `NP` is a more committed
 * reading than the bare `N` sitting under it, and both are in `spanning`.
 */
const NOMINAL_ROOT_TYPES = ['NP', 'NPCOMMA', 'NC', 'APPOS', 'GEN', 'NPO', 'DATE', 'PROPN', 'N'];

/**
 * The nominal anchor of a chart: the head of the widest nominal molecule that spans
 * the whole input.
 *
 * A span shorter than the input is NOT accepted. `the shadowy wood` must be answered by
 * `NP[0-2]`, never by `NP[2-2]` — the latter is the trivially correct answer to a
 * different question and would make the measurement a tautology.
 *
 * @param {object} chart          a chart from `composePacked` / `compose`
 * @param {number} tokenCount     how many tokens were composed
 * @returns {{anchor: string|null, type: string|null, ambiguous: boolean, candidates: string[]}}
 */
export function npAnchor(chart, tokenCount) {
  const empty = { anchor: null, type: null, ambiguous: false, candidates: [] };
  if (!chart || !Number.isInteger(tokenCount) || tokenCount < 1) return empty;

  const pool = [
    ...(Array.isArray(chart.spanning) ? chart.spanning : []),
    ...(Array.isArray(chart.molecules) ? chart.molecules : []),
  ];
  if (pool.length === 0) return empty;

  const fullSpan = pool.filter((m) => m && m.from === 0 && m.to === tokenCount - 1);
  if (fullSpan.length === 0) return empty;

  for (const type of NOMINAL_TYPES) {
    const hit = fullSpan.find((m) => m.type === type && m.nucleus
      && Array.isArray(m.nucleus.headLemmas) && m.nucleus.headLemmas.length > 0);
    if (!hit) continue;
    const candidates = [...hit.nucleus.headLemmas];
    /**
     * More than one head lemma is a real ambiguity the chart is reporting, not noise to
     * average away: `stone bridge` yields `["bridge","stone"]` because either can head the
     * compound. The first is returned as the anchor and the rest are kept, so a caller can
     * see that the phrase is genuinely two-ways-readable rather than being told a number.
     */
    return { anchor: candidates[0], type, ambiguous: candidates.length > 1, candidates };
  }
  return empty;
}

/**
 * The answer a chart states when its root is NOMINAL, in `projectAnswers` shape.
 *
 * ─── A DIFFERENT ENDPOINT FROM DENY-0002 ─────────────────────────────────────
 * The refutation above is about SHORT NOUN PHRASES, where `lastTaggedNoun` beat the
 * chart 0.8616 to 0.7874. This function answers SENTENCES WHOSE CLAUSAL PARSE
 * ABSTAINED — a population the phrase study never contained. On that population the
 * ranking inverts, measured on held-out `en_ewt-ud-test` with the product lexicon:
 * the chart head is right 63.8% against `lastTaggedNoun`'s 41.5%, and on the 50 of 94
 * rows where the two disagree the chart wins 25 to 4. DENY-0002 stands where it was
 * issued; it does not reach here.
 *
 * WHY THE CHART ALREADY KNOWS. 43% of UD English-EWT sentences have a non-verb gold
 * root. `composePacked` composes them fine — `chart.spanning` holds the full-span
 * nominal — but `ROOT_DOORWAY.CLAUSAL` filters `stable` down to `S`, so nothing
 * downstream ever sees it and `pickResonantDerivation` abstains. This reads that
 * molecule and asks `headsOf` for the head the bond table already declared. It does
 * NOT widen the doorway: what the parser ACCEPTS is unchanged, only what it REPORTS
 * when it would otherwise say nothing. Opening the doorway instead was measured and
 * is worse on its own (right answers 11.2% -> 10.6% held-out).
 *
 * Pure, zero-I/O. No chart is mutated.
 *
 * @param {object} chart        a chart from `composePacked`
 * @param {number} tokenCount   how many tokens were composed
 * @returns {{subject: string|null, verb: string}|null} null is an ABSTENTION
 */
export function nominalRootAnswer(chart, tokenCount) {
  if (!chart || !Number.isInteger(tokenCount) || tokenCount < 1) return null;

  const pool = [
    ...(Array.isArray(chart.spanning) ? chart.spanning : []),
    ...(Array.isArray(chart.molecules) ? chart.molecules : []),
  ];
  /**
   * Full span only. A nominal covering part of the input is the right answer to a
   * question nobody asked — the same trap `npAnchor` refuses above.
   */
  const fullSpan = pool.filter((m) => m && m.from === 0 && m.to === tokenCount - 1);
  if (fullSpan.length === 0) return null;

  for (const type of NOMINAL_ROOT_TYPES) {
    const node = fullSpan.find((m) => m.type === type);
    if (!node) continue;
    /**
     * `headsOf` unions heads across a packed node's derivations. That union is a real
     * wound elsewhere, but it is not one here: on the 164 dev+test rows this function
     * fires on, the set came back a SINGLETON every time, because a nominal root's
     * derivations agree about which child is the head even when they disagree about
     * structure. A set that is not a singleton is a genuine ambiguity the chart is
     * reporting, and guessing inside it would be exactly the coin-flip this function
     * exists to replace — so it abstains instead.
     */
    const heads = Array.isArray(node.derivations)
      ? [...headsOf(node)]
      : [...((node.nucleus && node.nucleus.headLemmas) || [])];
    if (heads.length !== 1) continue;
    if (heads[0] == null) continue;
    return { subject: null, verb: heads[0] };
  }
  return null;
}

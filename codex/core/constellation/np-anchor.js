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

/** Molecule types that name a nominal constituent, most specific first. */
const NOMINAL_TYPES = ['NP', 'NC', 'N'];

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

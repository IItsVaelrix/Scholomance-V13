/**
 * PRECEDENT — rulings that were actually made, cited by exact match
 *
 * The arbiter in `cue-arbiter.js` is already a bench: parties argue, some have
 * no standing, a veto is absolute, and the verdict names its author. What it has
 * never had is a MEMORY of its own decisions. Every input is tried from scratch,
 * so a judgement a human made yesterday cannot bind the identical case today.
 *
 * ─── WHY THIS AND NOT ANOTHER SCORER ──────────────────────────────────────
 *
 * Measured across a long series: the blocker is not that the machinery lacks
 * mechanism, it is that nothing available can tell a good parse from a bad one.
 * Semantic topography scored 50% on attachment — chance, and noun-biased.
 * Attraction ranking scored 86.1% against an 84.3% random baseline on n=20,
 * three wins to two losses. Adding a fifth mechanism upstream of that gap does
 * not close it.
 *
 * Precedent closes it differently: it does not manufacture evidence, it records
 * AUTHORITY. A human rules once, the ruling is stored with its rationale, and
 * the identical case is decided by citation rather than by re-derivation.
 *
 * ─── THE LINE THIS LIVES OR DIES ON ───────────────────────────────────────
 *
 * Citing a ruling by EXACT MATCH is a lookup — injected data, the same class as
 * the POS table and the sense counts, and pure under the Core law.
 *
 * Retrieving "the nearest precedent" by similarity would be inference over
 * cases. That is a learned ranker, it is the thing four separate measurements
 * rejected, and it must never be added here. One word different is a DIFFERENT
 * CASE and the honest answer is abstention.
 *
 * ─── WHAT IT CANNOT DO ────────────────────────────────────────────────────
 *
 * Precedent has ZERO coverage on inputs never ruled on, and that is not a defect
 * to be engineered away — it is the property that keeps it a lookup. It
 * institutionalises the annotation work rather than removing it.
 *
 * PURE AND ZERO-I/O (PDR §18 Core law). The case book is injected.
 *
 * @module codex/core/constellation/precedent
 */

import { support, abstain } from './cue-arbiter.js';

/**
 * @typedef {object} Case
 * @property {string} id          citable identifier, travels in `decidedBy`
 * @property {string} key         `caseKey` of the input this was ruled on
 * @property {Object<string,string>} ruling  token -> the reading held correct
 * @property {string} rationale   why, in a line a reviewer can check
 * @property {string} authority   who ruled, and when
 */

/**
 * The identity of an input for citation purposes.
 *
 * Case and spacing are not part of what was ruled on, so they are normalised
 * away. Nothing else is: word order and every token are load-bearing, because
 * a case is a ruling about THIS sentence and not about sentences like it.
 *
 * @param {string[]} tokens
 * @returns {string}
 */
export function caseKey(tokens) {
  return (tokens || []).map((t) => String(t).toLowerCase()).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Find the ruling made on exactly this input.
 *
 * @param {string[]} tokens
 * @param {Case[]} caseBook injected; nothing is read from disk here
 * @returns {Case|null} null means NO RULING EXISTS — not "all readings equal"
 */
export function citePrecedent(tokens, caseBook) {
  const key = caseKey(tokens);
  if (!key) return null;
  return (caseBook || []).find((c) => c && c.key === key) || null;
}

/**
 * Precedent as a CUE, so it is arbitrated alongside every other cue rather than
 * standing outside the process. It returns `support` with a citation, or
 * `abstain` — never a guess.
 *
 * Precedence is high because a recorded human ruling outranks a derived
 * preference. It is deliberately NOT a veto: a veto asserts structural
 * impossibility, and a past ruling is authority, not physics.
 *
 * @param {string[]} tokens
 * @param {object[]} molecules candidate readings
 * @param {Case[]} caseBook
 * @param {(m: object) => Map<string,string>} assignmentOf reads a molecule's
 *   token -> reading map, so this module needs no knowledge of molecule shape.
 *   VOCABULARY TRANSLATION LIVES HERE: rulings are written in whatever notation
 *   the annotator used, the chart speaks its own categories, and reconciling
 *   them is the adapter's job — not something this module should guess at.
 * @returns {object} a cue verdict for `arbitrate`
 */
export function precedentCue(tokens, molecules, caseBook, assignmentOf) {
  const ruled = citePrecedent(tokens, caseBook);
  if (!ruled) return abstain('precedent');

  const entries = Object.entries(ruled.ruling || {});
  const match = (molecules || []).find((m) => {
    const assigned = assignmentOf(m);
    return entries.every(([token, reading]) => {
      const got = assigned.get(String(token).toLowerCase());
      // A token the molecule does not assign is not a contradiction of the
      // ruling — the ruling simply has nothing to say about that reading.
      return got === undefined || got === reading;
    });
  });

  /**
   * A ruling that fits none of the molecules on offer is a CONTRADICTION between
   * the case book and the grammar. Reporting that as abstention keeps it
   * visible; silently picking something would hide a real disagreement.
   */
  if (!match) return abstain('precedent');

  return support('precedent', {
    molecule: match,
    citation: ruled.id,
    rationale: ruled.rationale,
    authority: ruled.authority,
  }, 100);
}

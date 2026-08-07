/**
 * READINGS — competing analyses of a phrase, left standing
 *
 * Head selection returns ONE token. That forced a choice the evidence does not
 * always support, and the forcing is where it broke:
 *
 *   `the man saw a comet`  subjecthood says `man`, salience says `comet`, and
 *                          BOTH are right about different questions
 *   `the horse raced past the barn fell`
 *                          subjecthood says `horse`, salience says `barn`, and
 *                          here only one is right
 *
 * A single return value cannot tell those two situations apart. This module
 * lets specialists propose, records who proposed what, and reports the readings
 * as a set — so a phrase that is genuinely two-ways-readable is SHOWN to be,
 * rather than silently resolved to whichever cue happened to run last.
 *
 * ─── SPECIALISTS PROPOSE, THEY DO NOT DECIDE ──────────────────────────────
 *
 * Each specialist declares a JURISDICTION — the shape it is competent over —
 * separately from its proposal. Outside it, the specialist is not asked at all,
 * which is a different fact from being asked and abstaining. That distinction
 * is why resolveFrame had to be deleted rather than scoped: it spoke about
 * `he wound the clock`, a shape its cue tables do not cover, and nothing could
 * say "not your intersection".
 *
 * ─── UNCERTAINTY SURVIVES ─────────────────────────────────────────────────
 *
 * `contested` is a first-class result, not a failure. The same discipline runs
 * through every channel here — null is not zero, abstain is not "unrelated",
 * `ambiguous` is not "pick the first" — and head selection was the last place
 * still collapsing it.
 *
 * PURE AND ZERO-I/O (PDR §18 Core law). Frequencies and POS are injected.
 *
 * @module codex/core/constellation/readings
 */

import { resolveHead } from './phraseAnalysis.js';
import { PREPOSITION_CUES } from '../phonology/prosodic-metronome.js';
import { arbitrate, support, outside, abstain } from './cue-arbiter.js';

/**
 * @typedef {object} Reading
 * @property {string} anchor        the token this reading is about
 * @property {string} role          what the anchor IS under this reading
 * @property {string} proposedBy    the specialist that proposed it
 * @property {string} rationale     one line a reader can check
 * @property {boolean} candidate    does this reading claim the phrase is ABOUT
 *   this token? A prepositional object is a fact about the phrase, not a rival
 *   claim to its subject, and counting it as one made every phrase containing a
 *   preposition look contested.
 */

/**
 * CLAUSE SUBJECT — the first eligible nominal, which in an English declarative
 * is the subject.
 *
 * Jurisdiction: multi-token input with at least one surviving nominal. A single
 * word has no clause and a bare noun phrase has no subject to find, so the
 * specialist stays silent rather than declaring the only token a subject and
 * manufacturing agreement with salience.
 */
function proposeClauseSubject(tokens, pool) {
  if ((tokens || []).length < 3 || pool.length === 0) return outside('clause-subject');
  const first = pool[0];
  return support('clause-subject', {
    anchor: first,
    role: 'clause-subject',
    candidate: true,
    rationale: 'first surviving nominal; English declaratives put the subject first',
  }, 5);
}

/**
 * LEXICAL SALIENCE — the rarest survivor, PDR §3.2's "rarest/last content word
 * as the semantic anchor".
 *
 * Jurisdiction: a frequency signal must exist. With no freqMap the rule is not
 * conservative, it is blind, and saying so beats ranking on nothing.
 */
function proposeSalience(pool, freqMap) {
  if (!freqMap || freqMap.size === 0 || pool.length === 0) return outside('lexical-salience');
  let best = pool[pool.length - 1];
  let bestFreq = freqMap.get(best) ?? 0;
  for (let i = pool.length - 2; i >= 0; i -= 1) {
    const freq = freqMap.get(pool[i]) ?? 0;
    if (freq < bestFreq) { best = pool[i]; bestFreq = freq; }
  }
  return support('lexical-salience', {
    anchor: best,
    role: 'rarest-content-word',
    candidate: true,
    rationale: `corpus frequency ${bestFreq}, rarest of the surviving nominals`,
  }, 4);
}

/**
 * PREPOSITIONAL OBJECT — a nominal inside a prepositional phrase, offered as a
 * reading in its own right rather than only as something to veto.
 *
 * Jurisdiction: the phrase must actually contain a preposition. This is the
 * specialist that closed the garden path, and surfacing its finding lets a
 * reader see WHY `barn` lost rather than only that it did.
 */
function proposePrepositionalObject(tokens, demoted) {
  const hasPrep = (tokens || []).some((t) => PREPOSITION_CUES.has(t));
  if (!hasPrep) return outside('prepositional-object');
  const obj = (demoted || []).find((d) => d.vetoedBy === 'pp-object');
  if (!obj) return abstain('prepositional-object');
  return support('prepositional-object', {
    anchor: obj.token,
    role: 'prepositional-object',
    // Explicitly NOT a candidate: this reading's whole content is that the
    // token is unavailable as the subject.
    candidate: false,
    rationale: 'object of a preposition; inside a phrase, so not the clause subject',
  }, 1);
}

/**
 * Resolve every reading a phrase supports.
 *
 * @param {string[]} tokens
 * @param {Map<string, number>} [freqMap]
 * @param {Map<string, string[]>} [posMap]
 * @returns {{ readings: Reading[], contested: boolean, primary: Reading|null,
 *   pool: string[], demoted: Array<{token: string, vetoedBy: string}>,
 *   silent: string[] }}
 */
export function resolveReadings(tokens, freqMap, posMap) {
  const head = resolveHead(tokens, freqMap, posMap);
  const pool = head.pool || [];

  const proposals = [
    proposeClauseSubject(tokens, pool),
    proposeSalience(pool, freqMap),
    proposePrepositionalObject(tokens, head.demoted),
  ];

  /**
   * The arbiter names a PRIMARY, but the losers are not discarded. Precedence
   * decides which reading leads; it does not decide that the others are wrong,
   * which is exactly the conflation a single return value forced.
   */
  const ruling = arbitrate(proposals);

  const readings = [];
  const seen = new Set();
  for (const p of proposals) {
    if (p.verdict !== 'support' || !p.payload) continue;
    const key = `${p.payload.anchor}:${p.payload.role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    readings.push({ ...p.payload, proposedBy: p.name });
  }

  /**
   * CONTESTED MEANS THE CANDIDATES DISAGREE, and only the candidates count.
   *
   * Measured: counting every reading marked `shadows fall across the road`
   * contested, because the prepositional-object reading names `road` — while
   * both anchor specialists agreed on `shadows`. A PP object is a fact ABOUT
   * the phrase, not a rival claim to what it is about, so a phrase merely
   * containing a preposition was looking ambiguous.
   *
   * When subjecthood and salience both land on `wound`, the phrase is not
   * ambiguous either; it is over-determined, which is the opposite thing.
   */
  const candidateAnchors = new Set(readings.filter((r) => r.candidate).map((r) => r.anchor));
  const contested = candidateAnchors.size > 1;

  const primary = readings.find((r) => r.proposedBy === ruling.decidedBy && r.candidate)
    ?? readings.find((r) => r.candidate) ?? null;

  return {
    readings,
    contested,
    primary,
    pool,
    demoted: head.demoted,
    silent: ruling.silent,
  };
}

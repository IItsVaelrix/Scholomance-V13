/**
 * CHEM GATE — Concept Chemistry results adjudicated by the Semantic Calculus.
 * ========================================================================
 * PB-SIM-CHEMGATE-v1
 *
 * Concept Chemistry spent a day reinventing, badly, instruments that already
 * exist in codex/core/semantic-calculus:
 *
 *   my "control bar"          → assessMargin() with a risk-derived minMargin
 *   my "NOT SEPARATED"        → Clarify (thin-margin), a named act, not a shrug
 *   my hand-rolled lawGate    → adjudicateLaw(), typed rule IDs
 *   my "unattested/no bond"   → Theory (nothing binds)
 *   a scored reaction         → Hypothesis (a candidate binding, NEVER executable)
 *
 * THE CENTRAL CORRECTION
 *
 * A chemistry run ranks rival readings and I reported the top one as the
 * answer. The margin law says that is exactly the move the architecture exists
 * to forbid: "A thin margin is NOT a weak Do. It is a Clarify — the difference
 * between the top two is the system's own admission that it cannot tell them
 * apart, and resolving that from a coin flip is the exact soft Do this
 * architecture exists to prevent."
 *
 * So a chemistry verdict is capped at Hypothesis and usually lands on Clarify.
 * It can never be a Do. What decides a design question is an architectural
 * PROBE with receipts — which is, in fact, what actually settled every question
 * today (BytecodeHealth has no generative surface; inverse_square is already
 * implemented; the no-ingest render hashed identical). The chemistry ranked;
 * the probe decided.
 *
 * PROMOTION
 *   Hypothesis → fact requires physical evidence AND human authority (F10).
 *   That is precisely the ledger's SIMULATED → PHYSICAL tier boundary.
 */

import { riskFor } from '../../semantic-calculus/cliLexicon.ts';
import { assessMargin, validateProposal } from '../../semantic-calculus/proposer.ts';
import { adjudicateLaw } from '../../semantic-calculus/kind.ts';
import { computeControlBar } from './control-gate.js';

export const SCHEMA = 'PB-SIM-CHEMGATE-v1';

/**
 * A chemistry result is never executable. The strongest act it can reach is
 * Hypothesis: the run supplied a candidate binding for a term that does not
 * bind. Promotion needs a probe's receipts, not a higher score.
 */
export const CHEMISTRY_CEILING = 'Hypothesis';

/**
 * Adjudicate a scored Concept Chemistry run.
 *
 * @param {Array<{id:string, group:string, feasibility:number}>} results
 * @param {object} [opts]
 * @param {'reversible_ui'|'destructive'|'security'} [opts.consequence='destructive']
 *   How costly is acting on this verdict? A design decision that spawns a
 *   subsystem is not reversible_ui. destructive carries minMargin 0.5.
 * @param {boolean} [opts.excludeControls=true] Controls are instruments, not
 *   candidates; they never compete for the pick.
 * @returns {object} the adjudication
 */
export function adjudicateChemistry(results, opts = {}) {
  const { consequence = 'destructive', groupKey = 'group' } = opts;

  // THE UNITS PROBLEM. minMargin is calibrated for the CLI lexicon's fuzzy
  // match scores, which use most of [0,1]. Raw feasibilities live in a
  // compressed band (~0.09–0.51) because W_GROUND=0.65 multiplies a fractional
  // attestation, so a raw gap of 0.13 can be a landslide and still read as
  // "thin". Feeding one distribution's numbers to another's threshold is the
  // same category error as STABLE_MIN.
  //
  // So the bar-setting controls define the noise floor, and the margin is
  // expressed as the fraction of the signal ABOVE that floor which separates
  // the top two:
  //
  //     margin = (top - rival) / (top - floor)
  //
  // Scale-free, comparable across question domains, and it lets minMargin keep
  // its plain meaning: "the winner must beat its rival by most of the distance
  // it beat noise by."
  const { bar } = computeControlBar(results, { groupKey });

  // A reading that does not clear the noise floor is not a candidate at all.
  const contenders = results
    .filter((r) => r[groupKey] !== 'control')
    .filter((r) => r.feasibility > bar);

  const risk = riskFor(consequence);

  if (contenders.length === 0) {
    const law0 = adjudicateLaw({ kind: 'Theory', riskProfile: risk });
    return {
      schema: SCHEMA,
      kind: 'Theory',
      law: law0,
      verdict: { decided: false, margin: 0, reason: 'no-candidates' },
      bar,
      risk: { consequence: risk.consequence, minMargin: risk.minMargin },
      executable: false,
      promotionRequires:
        'nothing in this run cleared the noise floor. There is no candidate to promote.',
    };
  }

  const ranked = [...contenders].sort((a, b) => b.feasibility - a.feasibility);
  const top = ranked[0];
  const span = top.feasibility - bar;
  const normalized = ranked.length === 1
    ? 1
    : span <= 0
      ? 0
      : (top.feasibility - ranked[1].feasibility) / span;

  // Closed candidate set: the run's own reaction ids. validateProposal throws
  // on anything invented — the same guard the CLI gate uses to stop a proposer
  // inventing a script that does not exist.
  const known = ranked.map((r) => r.id);
  const proposal = {
    proposerId: 'concept-chemistry',
    slot: 'reading',
    candidates: ranked.map((r, i) => ({
      key: r.id,
      // Rank 0 carries the normalized separation; everything below it carries 0,
      // so assessMargin's (top - second) subtraction yields the normalized gap.
      score: i === 0 ? normalized : 0,
    })),
  };
  validateProposal(proposal, known);

  const verdict = assessMargin(proposal, risk);
  // Restore real identities and raw scores for the report.
  if (verdict.pick) verdict.pick = { key: top.id, score: top.feasibility };
  if (verdict.rival) verdict.rival = { key: ranked[1].id, score: ranked[1].feasibility };

  // Map the margin verdict onto the kind lattice. A chemistry run can never
  // produce a Do: nothing here binds an executable act.
  let kind;
  if (verdict.reason === 'no-candidates') kind = 'Theory';
  else if (!verdict.decided) kind = 'Clarify';
  else kind = CHEMISTRY_CEILING;

  const law = adjudicateLaw({ kind, riskProfile: risk });

  return {
    schema: SCHEMA,
    kind,
    law,
    verdict,
    bar,
    clearedFloor: ranked.length,
    risk: { consequence: risk.consequence, minMargin: risk.minMargin },
    executable: false,
    promotionRequires:
      'a Probe with observation receipts, plus human authority (F10). ' +
      'Score alone never promotes a Hypothesis.',
  };
}

/**
 * Render the adjudication for a terminal report.
 * @param {ReturnType<typeof adjudicateChemistry>} a
 * @returns {string}
 */
export function formatChemGate(a) {
  const L = [];
  L.push(`  kind=${a.kind}   law=${a.law.decision}  ${a.law.ruleIds.join(',')}`);
  L.push(`  risk=${a.risk.consequence}  minMargin=${a.risk.minMargin}  noise floor=${(a.bar ?? 0).toFixed(4)}  cleared=${a.clearedFloor ?? 0}`);

  const v = a.verdict;
  if (v.reason === 'no-candidates') {
    L.push('  nothing bound — Theory. No reading in this run earned a binding.');
  } else if (!v.decided) {
    L.push(`  separation ${(v.margin * 100).toFixed(1)}% of signal-above-noise < ${a.risk.minMargin * 100}% — THIN.`);
    L.push(`    pick  ${v.pick.key}  ${v.pick.score.toFixed(4)}`);
    L.push(`    rival ${v.rival.key}  ${v.rival.score.toFixed(4)}`);
    L.push('  The run cannot tell these apart. Reporting the pick as the answer');
    L.push('  would be a soft Do. The correct act is one bounded question.');
  } else {
    L.push(`  separation ${(v.margin * 100).toFixed(1)}% of signal-above-noise >= ${a.risk.minMargin * 100}%  (${v.reason})`);
    L.push(`    pick  ${v.pick.key}  ${v.pick.score.toFixed(4)}`);
    L.push('  Bound as a Hypothesis — a candidate binding, still not executable.');
  }
  L.push(`  executable: NO — ${a.promotionRequires}`);
  return L.join('\n');
}

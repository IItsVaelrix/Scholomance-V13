/**
 * CLERI GATE — Cleri probe results adjudicated by the Semantic Calculus.
 * ========================================================================
 * PB-SIM-CLERIGATE-v1
 *
 * The Cleri probe is NOT shaped like Concept Chemistry, and wiring it through
 * the same instrument would be wrong. Chemistry ranks rival readings, so it
 * needs assessMargin. Cleri already separates ranking from proving:
 *
 *   "A verifier proves structure, so it reads the file's normalized facts —
 *    never the raw source, and NEVER THE RETRIEVAL SCORE."
 *
 * Its verdict is binary VERIFIED, carrying supportingEvidence,
 * counterEvidenceChecked, verificationSteps and lawRefs. There is no margin to
 * assess. What it needs is deriveEpistemic: the calculus's account of what a
 * result WARRANTS.
 *
 * THE EXPOSURE THIS CLOSES
 *
 * Cleri's soft-Do is not a thin margin. It is NO_VERIFIED_FINDINGS being read
 * as "clean". That is a Theory — nothing bound — reported as a fact. The probe
 * is trustworthy but narrow (a handful of verifier families over a retrieval
 * cut at `limit`), so silence means "these verifiers proved nothing here",
 * never "there is nothing here".
 *
 * KIND MAPPING
 *   findings with receipts  → Probe, warrants [lexicon, observation] present
 *   findings without steps  → Probe needing evidence (gap='evidence')
 *   zero findings           → Theory. Explicitly NOT a clean bill of health.
 *
 * A Cleri finding WITH receipts is the one thing that can promote a chemistry
 * Hypothesis out of the ledger's SIMULATED tier. That is the whole reason both
 * gates exist.
 */

import { riskFor } from '../../semantic-calculus/cliLexicon.ts';
import { adjudicateLaw } from '../../semantic-calculus/kind.ts';
import { deriveEpistemic } from '../../semantic-calculus/epistemic.ts';

export const SCHEMA = 'PB-SIM-CLERIGATE-v1';

/**
 * Does this finding carry the receipts that make it an observation warrant?
 * A verdict without verification steps is an assertion, not evidence.
 *
 * @param {object} f - a Cleri finding
 * @returns {boolean}
 */
export function hasReceipts(f) {
  const steps = Array.isArray(f?.verificationSteps) ? f.verificationSteps : [];
  const supporting = Array.isArray(f?.supportingEvidence) ? f.supportingEvidence : [];
  return steps.length > 0 && supporting.length > 0;
}

/** Does it cite the law or raid corpus it rests on? */
export function hasCites(f) {
  const law = Array.isArray(f?.lawRefs) ? f.lawRefs : [];
  const raid = Array.isArray(f?.raidRefs) ? f.raidRefs : [];
  return law.length + raid.length > 0;
}

/**
 * Adjudicate a Cleri probe run.
 *
 * @param {object} run
 * @param {Array<object>} run.findings - VERIFIED findings from the probe
 * @param {number} [run.candidatesConsidered] - how many candidates survived retrieval
 * @param {number} [run.retrievalLimit] - the `limit` the candidate cut used
 * @param {number} [run.verifierFamilies] - how many verifier families were active
 * @param {object} [opts]
 * @param {'reversible_ui'|'destructive'|'security'} [opts.consequence='security']
 *   Acting on a probe finding means changing code on a claim of pathology.
 * @returns {object}
 */
export function adjudicateCleri(run, opts = {}) {
  const { consequence = 'security' } = opts;
  const findings = Array.isArray(run?.findings) ? run.findings : [];
  const risk = riskFor(consequence);

  const withReceipts = findings.filter(hasReceipts);
  const withCites = findings.filter(hasCites);

  // Zero findings is NOT a clean result. Nothing bound.
  const kind = findings.length === 0 ? 'Theory' : 'Probe';

  const epistemic = deriveEpistemic({
    kind,
    bound: findings.length > 0,
    hasUnresolvedSlots: false,
    unknownReferent: false,
    // A finding with no verification steps still needs evidence to conclude.
    needsEvidence: findings.length > 0 && withReceipts.length < findings.length,
    hasObservationReceipts: withReceipts.length > 0,
    hasGeneCites: withCites.length > 0,
  });

  const law = adjudicateLaw({ kind, riskProfile: risk });

  // The coverage caveat travels with the verdict, always — it is the standing
  // reason silence cannot be read as absence.
  const truncated =
    typeof run?.candidatesConsidered === 'number' &&
    typeof run?.retrievalLimit === 'number' &&
    run.candidatesConsidered >= run.retrievalLimit;

  // VACUOUS COVERAGE. A run that analyzed nothing reports coverage.complete=true
  // because there was nothing left to do — complete by virtue of never starting.
  // Observed live: plan.supported=false, reasonCode=NO_REGISTERED_PATHOLOGY_CLASS,
  // selectedVerifiers=[], analyzedPaths=[], coverage.complete=true.
  // render-human.js prints "NO VERIFIED FINDINGS" on coverage.complete + zero
  // findings, and is saved here only because an INCONCLUSIVE status is checked
  // first. That ordering is load-bearing and undeclared.
  const vacuous =
    run?.coverageComplete === true &&
    (run?.candidatesConsidered ?? 0) === 0 &&
    (run?.verifierFamilies ?? 0) === 0;

  return {
    schema: SCHEMA,
    kind,
    law,
    epistemic,
    findings: findings.length,
    withReceipts: withReceipts.length,
    withCites: withCites.length,
    coverage: {
      verifierFamilies: run?.verifierFamilies ?? null,
      candidatesConsidered: run?.candidatesConsidered ?? null,
      retrievalLimit: run?.retrievalLimit ?? null,
      truncated,
      vacuous,
      planSupported: run?.planSupported ?? null,
      reasonCode: run?.reasonCode ?? null,
    },
    executable: false,
    absenceClaim:
      findings.length === 0
        ? vacuous
          ? 'VACUOUS. No verifier ran and no path was analyzed, yet coverage reports ' +
            'complete. This report says nothing whatsoever about the code — it is not ' +
            'a weak result, it is the absence of a result.'
          : 'NOT PROVEN. Zero findings means these verifier families proved nothing over ' +
            'the retrieved candidates. It is a Theory, never a clean bill of health.'
        : null,
  };
}

/**
 * Render a Cleri adjudication for a terminal report.
 * @param {ReturnType<typeof adjudicateCleri>} a
 * @returns {string}
 */
export function formatCleriGate(a) {
  const L = [];
  L.push(`  kind=${a.kind}   law=${a.law.decision}  ${a.law.ruleIds.join(',')}`);
  L.push(
    `  epistemic.gap=${a.epistemic.gap}  method=${a.epistemic.method}` +
      `  warrants required=[${a.epistemic.warrantRequired.join(',')}]` +
      ` present=[${a.epistemic.warrantPresent.join(',')}]`,
  );
  L.push(`  findings=${a.findings}  with receipts=${a.withReceipts}  with cites=${a.withCites}`);

  const c = a.coverage;
  L.push(
    `  coverage: ${c.verifierFamilies ?? '?'} verifier families` +
      `, ${c.candidatesConsidered ?? '?'} candidates` +
      (c.truncated ? ` (TRUNCATED at limit ${c.retrievalLimit})` : ''),
  );

  if (a.absenceClaim) {
    L.push(`  ⚠ ${a.absenceClaim}`);
  }
  if (c.truncated) {
    L.push('  ⚠ retrieval hit its limit — candidates below the cut were never verified.');
  }
  if (c.vacuous) {
    L.push('  ⚠ coverage.complete=true over ZERO analyzed paths and ZERO verifiers —');
    L.push('    complete because nothing was attempted. A check that cannot fail.');
    if (c.planSupported === false) {
      L.push(`    plan.supported=false  reasonCode=${c.reasonCode ?? 'unknown'}`);
    }
  }
  if (a.findings > 0 && a.withReceipts < a.findings) {
    L.push(
      `  ⚠ ${a.findings - a.withReceipts} finding(s) carry no verification steps —` +
        ' assertions, not observations. They cannot promote anything.',
    );
  }
  L.push('  executable: NO — a finding licenses a fix proposal, never the fix.');
  return L.join('\n');
}

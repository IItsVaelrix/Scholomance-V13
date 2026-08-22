/**
 * SEMANTIC EXPOSURE GATE
 *
 * Did any medicine enter the patient? Accuracy is not consulted here.
 * Thresholds are frozen in the 2026-08-16 substrate-gate preregistration.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/exposure-gate
 */

import { exactTwoSidedSignP } from './stats.js';

export const EXPOSURE_THRESHOLDS = Object.freeze({
  minAmbiguous: 300,
  minEvidenceRate: 0.6,
  minScoreDisagreementRate: 0.1,
  minRankDisagreements: 30,
  maxAllUnknownRate: 0.4,
});

export function evaluateExposure(stats, thresholds = EXPOSURE_THRESHOLDS) {
  const ambiguous = Number(stats?.ambiguous) || 0;
  const withEvidence = Number(stats?.withEvidence) || 0;
  const scoreDisagreements = Number(stats?.scoreDisagreements) || 0;
  const rankDisagreements = Number(stats?.rankDisagreements) || 0;
  const allUnknown = Number(stats?.allUnknown) || 0;
  const evidenceRate = ambiguous > 0 ? withEvidence / ambiguous : 0;
  const scoreDisagreementRate = ambiguous > 0 ? scoreDisagreements / ambiguous : 0;
  const allUnknownRate = ambiguous > 0 ? allUnknown / ambiguous : 1;

  const failures = [];
  if (ambiguous < thresholds.minAmbiguous) failures.push('minAmbiguous');
  if (evidenceRate < thresholds.minEvidenceRate) failures.push('minEvidenceRate');
  if (scoreDisagreementRate < thresholds.minScoreDisagreementRate) {
    failures.push('minScoreDisagreementRate');
  }
  if (rankDisagreements < thresholds.minRankDisagreements) {
    failures.push('minRankDisagreements');
  }
  if (allUnknownRate > thresholds.maxAllUnknownRate) failures.push('maxAllUnknownRate');

  if (failures.length > 0) {
    return Object.freeze({
      verdict: 'INSUFFICIENT_EXPOSURE',
      evaluateEfficacy: false,
      failures: Object.freeze(failures),
      evidenceRate,
      scoreDisagreementRate,
      allUnknownRate,
      rankDisagreements,
      ambiguous,
    });
  }
  return Object.freeze({
    verdict: 'EVALUATE_EFFICACY',
    evaluateEfficacy: true,
    failures: Object.freeze([]),
    evidenceRate,
    scoreDisagreementRate,
    allUnknownRate,
    rankDisagreements,
    ambiguous,
  });
}

/** Significance the crown requires. Frozen with the substrate-gate prereg. */
export const EFFICACY_ALPHA = 0.05;

/**
 * ─── A MARGIN IS NOT A RESULT ─────────────────────────────────────────────
 *
 * This function used to return `REAL_BEATS_CONTROLS` for any positive margin
 * whatsoever. Measured on 2026-08-20: `{realHits: 1, derangeHits: 0}` was
 * crowned, and so was `{realHits: 301, derangeHits: 300}` — a one-hit margin
 * over three hundred trials. No effect size, no interval, no test.
 *
 * The callers were not the problem: `scripts/semantic-substrate-gate.mjs`
 * already computed an exact two-sided sign test on the paired discordant
 * counts and printed it in the same report. The headline label simply did not
 * consult it, so a page could read REAL_BEATS_CONTROLS directly beside a
 * p-value saying nothing happened.
 *
 * MARGINAL COUNTS CANNOT SETTLE SIGNIFICANCE. `realHits` and `derangeHits`
 * are marginals; 200 vs 199 is consistent with one discordant pair or with two
 * hundred. So the paired discordant counts are a required input for the crown,
 * and their ABSENCE is reported as absence rather than filled in:
 *
 *   FALSIFIED_OR_NONDISCRIMINATIVE          the arms tied
 *   CONTROL_WINS_OR_FLAT                    direction does not favour real
 *   REAL_EXCEEDS_CONTROLS_UNTESTED          direction favours real, no test
 *   REAL_EXCEEDS_CONTROLS_NOT_SIGNIFICANT   tested, did not clear alpha
 *   REAL_BEATS_CONTROLS                     tested, cleared alpha
 *
 * Call only after evaluateExposure().evaluateEfficacy === true.
 *
 * @param {{realHits: number, derangeHits: number, nullHits?: number|null,
 *   pairedWins?: number|null, pairedLosses?: number|null}} counts
 *   `pairedWins`/`pairedLosses` are the DISCORDANT pairs of the real-vs-derange
 *   comparison — the sign test's numerator and its complement, not the marginals.
 * @param {number} [alpha]
 * @returns {string}
 */
export function efficacyVerdict({
  realHits, derangeHits, nullHits, pairedWins, pairedLosses,
}, alpha = EFFICACY_ALPHA) {
  if (realHits === derangeHits) {
    return 'FALSIFIED_OR_NONDISCRIMINATIVE';
  }
  const directionFavoursReal = realHits > derangeHits
    && (nullHits == null || realHits > nullHits);
  if (!directionFavoursReal) {
    return 'CONTROL_WINS_OR_FLAT';
  }
  if (pairedWins == null || pairedLosses == null) {
    return 'REAL_EXCEEDS_CONTROLS_UNTESTED';
  }
  const p = exactTwoSidedSignP(pairedWins, pairedWins + pairedLosses);
  return p < alpha ? 'REAL_BEATS_CONTROLS' : 'REAL_EXCEEDS_CONTROLS_NOT_SIGNIFICANT';
}

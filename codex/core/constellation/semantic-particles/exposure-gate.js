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

/** Call only after evaluateExposure().evaluateEfficacy === true. */
export function efficacyVerdict({ realHits, derangeHits, nullHits }) {
  if (realHits === derangeHits) {
    return 'FALSIFIED_OR_NONDISCRIMINATIVE';
  }
  if (realHits > derangeHits && (nullHits == null || realHits > nullHits)) {
    return 'REAL_BEATS_CONTROLS';
  }
  return 'CONTROL_WINS_OR_FLAT';
}

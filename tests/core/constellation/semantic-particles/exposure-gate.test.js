/**
 * Semantic exposure gate — medicine-in-the-patient check.
 *
 * Production change that would make these fail: sending a zero-disagreement
 * run to the accuracy tribunal, or moving thresholds after seeing accuracy.
 */
import { describe, expect, it } from 'vitest';

import {
  EXPOSURE_THRESHOLDS,
  evaluateExposure,
} from '../../../../codex/core/constellation/semantic-particles/exposure-gate.js';

describe('semantic exposure gate', () => {
  it('freezes the preregistered thresholds', () => {
    expect(EXPOSURE_THRESHOLDS).toEqual({
      minAmbiguous: 300,
      minEvidenceRate: 0.6,
      minScoreDisagreementRate: 0.1,
      minRankDisagreements: 30,
      maxAllUnknownRate: 0.4,
    });
    expect(Object.isFrozen(EXPOSURE_THRESHOLDS)).toBe(true);
  });

  it('refuses the tribunal when nothing entered the patient', () => {
    const v = evaluateExposure({
      ambiguous: 1513,
      withEvidence: 0,
      scoreDisagreements: 0,
      rankDisagreements: 0,
      allUnknown: 1513,
    });
    expect(v.verdict).toBe('INSUFFICIENT_EXPOSURE');
    expect(v.failures).toEqual(expect.arrayContaining([
      'minEvidenceRate',
      'minScoreDisagreementRate',
      'minRankDisagreements',
      'maxAllUnknownRate',
    ]));
    expect(v.evaluateEfficacy).toBe(false);
  });

  it('treats zero rank movement as missing exposure, not as an accuracy result', () => {
    const v = evaluateExposure({
      ambiguous: 400,
      withEvidence: 300,
      scoreDisagreements: 80,
      rankDisagreements: 0,
      allUnknown: 50,
    });
    expect(v.verdict).toBe('INSUFFICIENT_EXPOSURE');
    expect(v.failures).toContain('minRankDisagreements');
    expect(v.evaluateEfficacy).toBe(false);
  });

  it('opens the tribunal only after exposure and disagreement both hold', () => {
    const v = evaluateExposure({
      ambiguous: 400,
      withEvidence: 280,
      scoreDisagreements: 50,
      rankDisagreements: 40,
      allUnknown: 80,
    });
    expect(v.verdict).toBe('EVALUATE_EFFICACY');
    expect(v.evaluateEfficacy).toBe(true);
    expect(v.failures).toEqual([]);
  });
});

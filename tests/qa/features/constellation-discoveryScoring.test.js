import { describe, it, expect } from 'vitest';
import {
  computeModifierFit,
  computeRarityBoost,
  applyDiscoveryPreScore,
} from '../../../codex/core/constellation/discoveryScoring.js';
import { PRE_SCORE } from '../../../codex/core/constellation/discoveryWeights.js';

describe('discoveryScoring', () => {
  it('modifierFit is 0 without evidence paths even if attractors non-empty', () => {
    const r = computeModifierFit('abyss', new Set(['emotion', 'feeling']), []);
    expect(r.score).toBe(0);
    expect(r.paths).toEqual([]);
  });

  it('modifierFit records paths when gloss overlaps attractor', () => {
    const r = computeModifierFit(
      'sorrow',
      new Set(['emotion', 'feeling', 'sorrow']),
      ['deep', 'sorrow', 'pain'],
    );
    expect(r.score).toBeGreaterThan(0);
    expect(r.paths.some((p) => p.includes('sorrow'))).toBe(true);
  });

  it('rarityBoost is 0 when baseEvidence is false', () => {
    expect(computeRarityBoost(false, 1)).toBe(0);
  });

  it('rarityBoost prefers low band (rare) over high band (common)', () => {
    const rare = computeRarityBoost(true, 1);
    const common = computeRarityBoost(true, 8);
    expect(rare).toBeGreaterThan(0);
    expect(common).toBeGreaterThan(0);
    expect(rare).toBeGreaterThan(common);
    expect(rare).toBeLessThanOrEqual(1);
  });

  it('pre-score formula is deterministic', () => {
    const s = applyDiscoveryPreScore(0.8, 0.5, 0.2);
    const expected = Math.min(1, Math.max(0, 0.8 * (PRE_SCORE.K0 + PRE_SCORE.K1 * 0.5 + PRE_SCORE.K2 * 0.2)));
    expect(s).toBeCloseTo(expected, 8);
  });
});

import { describe, it, expect } from 'vitest';
import {
  OSMOTIC_EQUILIBRIUM_CONTRACT,
  crowdingFromHeat,
  shouldEquilibrate,
} from '../../../../codex/core/pixelbrain/osmotic-equilibrium.js';

describe('crowdingFromHeat', () => {
  it('maps an unvisited region to zero crowding', () => {
    expect(crowdingFromHeat(0)).toBe(0);
  });

  it('increases with heat and stays below 1', () => {
    const low = crowdingFromHeat(1);
    const mid = crowdingFromHeat(5);
    const high = crowdingFromHeat(1000);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    expect(high).toBeLessThan(1);
  });

  it('rejects non-finite heat instead of coercing it', () => {
    expect(() => crowdingFromHeat(Number.NaN)).toThrow(/finite/i);
    expect(() => crowdingFromHeat(Number.POSITIVE_INFINITY)).toThrow(/finite/i);
  });

  it('rejects negative heat', () => {
    expect(() => crowdingFromHeat(-1)).toThrow(/>= 0/);
  });
});

describe('shouldEquilibrate', () => {
  it('fires when the membrane reports over-concentration', () => {
    expect(shouldEquilibrate({ anomalyKind: 'concentration' })).toBe(true);
  });

  it('does NOT fire on baseline drift — drift is not crowding', () => {
    expect(shouldEquilibrate({ anomalyKind: 'baseline_drift' })).toBe(false);
  });

  it('does not fire when the membrane is silent', () => {
    expect(shouldEquilibrate({ anomalyKind: 'none' })).toBe(false);
  });

  it('does not fire on a missing result', () => {
    expect(shouldEquilibrate(undefined)).toBe(false);
  });
});

describe('contract', () => {
  it('declares its identity', () => {
    expect(OSMOTIC_EQUILIBRIUM_CONTRACT).toBe('PB-OSMOTIC-EQUILIBRIUM-v1');
  });
});

import { calibrateConcentrationLimit } from '../../../../codex/core/pixelbrain/osmotic-equilibrium.js';

describe('calibrateConcentrationLimit', () => {
  const ramp = (n) => Array.from({ length: n }, (_, i) => i / n);

  it('places the limit at the requested upper percentile of observed crowding', () => {
    const samples = ramp(100); // 0.00 .. 0.99
    const result = calibrateConcentrationLimit(samples, { percentile: 0.90, governed: samples });
    expect(result.limit).toBeCloseTo(0.90, 2);
    expect(result.admissible).toBe(true);
  });

  // REGRESSION 2026-08-12: `Math.ceil(p * n)` clamped to n-1 returns the LAST
  // index — the maximum — for every n < 2/(1-p). At p=0.90 that is every
  // sample under 20, and the shipped calibration ran at n=12. The limit was
  // the maximum observed value, so exactly one sample cleared it: the one that
  // defined it. `derived limit == max crowding` is the fingerprint.
  it('does not collapse to the maximum on a small sample', () => {
    const samples = ramp(12); // 0.0000 .. 0.9167, 12 distinct values
    const result = calibrateConcentrationLimit(samples, { percentile: 0.90, governed: samples });
    expect(result.limit).toBeLessThan(Math.max(...samples));
    expect(result.clearedFraction).toBeGreaterThan(1 / samples.length);
  });

  // The original sin: a limit derived without knowing what it will govern
  // cannot be shown to transfer. Requiring the governed distribution makes the
  // transfer check structural rather than a matter of discipline.
  it('refuses to derive a limit without the distribution it governs', () => {
    expect(() => calibrateConcentrationLimit(ramp(50), { percentile: 0.90 }))
      .toThrow(/governed/i);
  });

  // REGRESSION 2026-08-12: calibrated on a synthetic 4-atom chain (n=12), the
  // limit 0.904402 shipped as the cyclotron default and fired on 91% of the
  // real ritual bank. A top-decile gate that fires on nine tenths of what it
  // governs is the "limit everything exceeds" this function exists to refuse.
  it('refuses a limit that does not transfer to the governed distribution', () => {
    const calibration = ramp(50).map((v) => v * 0.2);          // toy: 0.00 .. 0.196
    const production = Array.from({ length: 50 }, (_, i) => 0.85 + i / 500); // 0.85 .. 0.948
    const result = calibrateConcentrationLimit(calibration, {
      percentile: 0.90,
      governed: production,
    });
    expect(result.admissible).toBe(false);
    expect(result.reason).toMatch(/transfer|always fires/i);
    expect(result.governedFraction).toBeGreaterThan(0.5);
  });

  it('refuses a sample too small to resolve the requested percentile', () => {
    const samples = [0.1, 0.4, 0.6, 0.8, 0.95]; // n=5 cannot place a top decile
    const result = calibrateConcentrationLimit(samples, { percentile: 0.90, governed: samples });
    expect(result.admissible).toBe(false);
    expect(result.reason).toMatch(/resolve/i);
  });

  it('refuses a limit nothing can reach', () => {
    const calibration = Array.from({ length: 50 }, (_, i) => 0.5 + i / 200); // 0.50 .. 0.745
    const production = Array.from({ length: 50 }, () => 0.01);
    const result = calibrateConcentrationLimit(calibration, {
      percentile: 0.90,
      governed: production,
    });
    expect(result.admissible).toBe(false);
    expect(result.reason).toMatch(/unreachable/i);
    expect(result.governedFraction).toBe(0);
  });

  it('refuses a limit everything exceeds', () => {
    const samples = Array.from({ length: 50 }, () => 0.99);
    const result = calibrateConcentrationLimit(samples, { percentile: 0.0, governed: samples });
    expect(result.admissible).toBe(false);
    expect(result.reason).toMatch(/always fires/i);
  });

  it('refuses an empty sample rather than inventing a limit', () => {
    expect(() => calibrateConcentrationLimit([], { governed: ramp(50) })).toThrow(/no samples/i);
  });

  it('admits a limit that lands on target in the distribution it governs', () => {
    const calibration = ramp(200);
    const production = ramp(200).map((v) => v + 0.001); // near-identical population
    const result = calibrateConcentrationLimit(calibration, {
      percentile: 0.90,
      governed: production,
    });
    expect(result.admissible).toBe(true);
    expect(result.reason).toBe(null);
    expect(Math.abs(result.governedFraction - 0.10)).toBeLessThanOrEqual(0.10);
  });
});

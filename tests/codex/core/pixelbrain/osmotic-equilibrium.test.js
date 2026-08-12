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

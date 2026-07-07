import { describe, expect, it } from 'vitest';
import { computeResourceBarRatio } from '../../../src/ui/combat/combatResourceBarUtils.js';

describe('computeResourceBarRatio', () => {
  it('returns 0 when max is missing or non-positive', () => {
    expect(computeResourceBarRatio(50, null)).toBe(0);
    expect(computeResourceBarRatio(50, 0)).toBe(0);
    expect(computeResourceBarRatio(50, -3)).toBe(0);
  });

  it('clamps current between 0 and max', () => {
    expect(computeResourceBarRatio(-5, 100)).toBe(0);
    expect(computeResourceBarRatio(50, 100)).toBe(0.5);
    expect(computeResourceBarRatio(150, 100)).toBe(1);
  });

  it('treats non-finite current as zero', () => {
    expect(computeResourceBarRatio(undefined, 100)).toBe(0);
    expect(computeResourceBarRatio(NaN, 100)).toBe(0);
  });
});
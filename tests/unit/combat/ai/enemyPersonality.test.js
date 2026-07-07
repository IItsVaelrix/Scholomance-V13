import { describe, expect, it } from 'vitest';
import { computeEnemyPersonality } from '../../../../src/game/combat/ai/enemyPersonality.js';

describe('computeEnemyPersonality', () => {
  it('zeroes non-aggro brains for a brute', () => {
    const w = computeEnemyPersonality({ role: 'bruiser', intTier: 'brute' });
    expect(w.AGGRO_BRAIN).toBeGreaterThan(0);
    expect(w.SURVIVAL_BRAIN).toBe(0);
    expect(w.POSITION_BRAIN).toBe(0);
  });

  it('applies role and override multipliers on top of the INT tier', () => {
    const w = computeEnemyPersonality({
      role: 'skirmisher', intTier: 'tactical', overrides: { SURVIVAL_BRAIN: 2 },
    });
    // tactical SURVIVAL 0.8 × skirmisher 1.2 × override 2 = 1.92
    expect(w.SURVIVAL_BRAIN).toBeCloseTo(1.92, 3);
  });
});
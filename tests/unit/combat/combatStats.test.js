import { describe, expect, it } from 'vitest';
import { COMBAT_STATS, buildDefaultStatBlock } from '../../../src/game/combat/combatStats.js';

describe('combatStats registry', () => {
  it('defines the slice-1 tactical stats with the documented bases', () => {
    const byKey = Object.fromEntries(COMBAT_STATS.map((s) => [s.key, s]));
    expect(byKey.movementPoints.base).toBe(3);
    expect(byKey.attackPoints.base).toBe(6);
    expect(byKey.attackRange.base).toBe(2);
    expect(byKey.manaPoints.base).toBe(100);
    expect(byKey.intelligence.base).toBe(10);
    expect(byKey.intelligence.label).toBe('INT');
  });

  it('buildDefaultStatBlock seeds defaults with a full movement pool', () => {
    expect(buildDefaultStatBlock()).toEqual({
      movementPoints: 3,
      movementPointsRemaining: 3,
      attackPoints: 6,
      attackPointsRemaining: 6,
      attackRange: 2,
      manaPoints: 100,
      manaPointsRemaining: 100,
      intelligence: 10,
    });
  });

  it('overrides merge, and overriding movementPoints seeds the remaining pool', () => {
    expect(buildDefaultStatBlock({ movementPoints: 5, attackPoints: 20 })).toEqual({
      movementPoints: 5,
      movementPointsRemaining: 5,
      attackPoints: 20,
      attackPointsRemaining: 20,
      attackRange: 2,
      manaPoints: 100,
      manaPointsRemaining: 100,
      intelligence: 10,
    });
  });

  it('respects an explicit movementPointsRemaining override', () => {
    expect(buildDefaultStatBlock({ movementPoints: 5, movementPointsRemaining: 2 }).movementPointsRemaining).toBe(2);
  });
});

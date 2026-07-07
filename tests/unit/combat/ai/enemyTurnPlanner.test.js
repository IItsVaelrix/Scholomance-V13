import { describe, expect, it } from 'vitest';
import { buildBlockedSet } from '../../../../src/game/combat/combatPathfinding.js';
import { planEnemyTurn } from '../../../../src/game/combat/ai/enemyTurnPlanner.js';

function ctx(overrides = {}) {
  return {
    selfId: 'sentinel-test',
    self: { position: { tx: 4, ty: 4 }, hp: 40, maxHp: 40, attackPointsRemaining: 6, attackRange: 2, intelligence: 60 },
    target: { position: { tx: 6, ty: 4 }, hp: 100, maxHp: 100, attackRange: 1, estimateAttackDamage: 8 },
    allies: [],
    blocked: buildBlockedSet([]),
    abilityKit: { isRanged: true, preferredRange: 3, minRange: 1, canActFromRange: (d) => d <= 3, estimateAttackDamage: () => 5 },
    profile: { role: 'caster', weightOverrides: {} },
    rng: () => 0.5,
    ...overrides,
  };
}

describe('planEnemyTurn', () => {
  it('a brute rushes and attacks', () => {
    const plan = planEnemyTurn(ctx({ self: { position: { tx: 4, ty: 4 }, hp: 40, maxHp: 40, attackPointsRemaining: 6, attackRange: 2, intelligence: 5 } }));
    expect(plan.stance).toBe('AGGRESSIVE');
    expect(plan.action.kind).toBe('attack');
  });

  it('a wounded mastermind stops attacking to preserve itself', () => {
    const plan = planEnemyTurn(ctx({
      self: { position: { tx: 5, ty: 4 }, hp: 6, maxHp: 40, attackPointsRemaining: 6, attackRange: 2, intelligence: 90 },
    }));
    expect(plan.stance).toBe('RETREAT');
    expect(plan.action.kind).not.toBe('attack');
  });

  it('is deterministic and emits reason lines', () => {
    const a = planEnemyTurn(ctx());
    const b = planEnemyTurn(ctx());
    expect(a.action.kind).toBe(b.action.kind);
    expect(a.reasons.length).toBeGreaterThan(0);
  });
});
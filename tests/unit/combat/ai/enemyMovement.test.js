import { describe, expect, it } from 'vitest';
import { buildBlockedSet, manhattan } from '../../../../src/game/combat/combatPathfinding.js';
import { planAdvance, planRetreat, planKite, planFlank, planHold } from '../../../../src/game/combat/ai/enemyMovement.js';

function ctx(overrides = {}) {
  return {
    self: { position: { tx: 1, ty: 1 }, movementPointsRemaining: 3, attackRange: 2 },
    target: { position: { tx: 6, ty: 1 } },
    allies: [],
    blocked: buildBlockedSet([]),
    abilityKit: { preferredRange: 3, minRange: 1 },
    ...overrides,
  };
}

describe('enemyMovement', () => {
  it('planHold stays put', () => {
    expect(planHold(ctx()).destination).toEqual({ tx: 1, ty: 1 });
  });

  it('planAdvance closes distance to the target', () => {
    const before = manhattan({ tx: 1, ty: 1 }, { tx: 6, ty: 1 });
    const plan = planAdvance(ctx());
    expect(manhattan(plan.destination, { tx: 6, ty: 1 })).toBeLessThan(before);
  });

  it('planRetreat increases distance from the target', () => {
    const before = manhattan({ tx: 1, ty: 1 }, { tx: 6, ty: 1 });
    const plan = planRetreat(ctx({ target: { position: { tx: 3, ty: 1 } } }));
    expect(manhattan(plan.destination, { tx: 3, ty: 1 })).toBeGreaterThan(manhattan({ tx: 1, ty: 1 }, { tx: 3, ty: 1 }));
    expect(before).toBeGreaterThan(0);
  });

  it('planKite settles near preferred range', () => {
    const plan = planKite(ctx({ target: { position: { tx: 2, ty: 1 } }, self: { position: { tx: 1, ty: 1 }, movementPointsRemaining: 4, attackRange: 2 } }));
    expect(manhattan(plan.destination, { tx: 2, ty: 1 })).toBeGreaterThanOrEqual(2);
  });

  it('planFlank prefers tiles away from allies', () => {
    const plan = planFlank(ctx({
      target: { position: { tx: 4, ty: 1 } },
      allies: [{ tx: 3, ty: 1 }],
      abilityKit: { preferredRange: 2, minRange: 1 },
    }));
    expect(plan).not.toBeNull();
    expect(manhattan(plan.destination, { tx: 3, ty: 1 })).toBeGreaterThan(0);
  });
});
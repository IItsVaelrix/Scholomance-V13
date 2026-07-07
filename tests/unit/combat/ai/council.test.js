import { describe, expect, it } from 'vitest';
import { scoreCandidate, DEFAULT_COUNCIL } from '../../../../src/game/combat/ai/council/index.js';

function ctx(overrides = {}) {
  return {
    self: { hp: 40, maxHp: 40, attackPointsRemaining: 6 },
    target: { position: { tx: 5, ty: 1 }, attackRange: 1, estimateAttackDamage: 8 },
    allies: [],
    abilityKit: { preferredRange: 3, canActFromRange: (d) => d <= 3, estimateAttackDamage: () => 5 },
    ...overrides,
  };
}
const attackAt = (tx, ty) => ({ movement: { kind: 'hold' }, action: { kind: 'attack' }, endTile: { tx, ty } });

describe('council', () => {
  it('AggroBrain rewards an in-range attack', () => {
    const flat = Object.fromEntries(DEFAULT_COUNCIL.map((b) => [b.id, b.id === 'AGGRO_BRAIN' ? 1 : 0]));
    const s = scoreCandidate(attackAt(3, 1), ctx(), flat).score; // dist 2 ≤ range 3
    expect(s).toBe(5);
  });

  it('SurvivalBrain prefers guarding while hurt', () => {
    const w = Object.fromEntries(DEFAULT_COUNCIL.map((b) => [b.id, b.id === 'SURVIVAL_BRAIN' ? 1 : 0]));
    const hurt = ctx({ self: { hp: 8, maxHp: 40, attackPointsRemaining: 6 } });
    const guard = { movement: { kind: 'hold' }, action: { kind: 'guard' }, endTile: { tx: 4, ty: 1 } };
    const stand = attackAt(4, 1);
    expect(scoreCandidate(guard, hurt, w).score).toBeGreaterThan(scoreCandidate(stand, hurt, w).score);
  });

  it('CoordinationBrain penalises clumping adjacent to an ally', () => {
    const w = Object.fromEntries(DEFAULT_COUNCIL.map((b) => [b.id, b.id === 'COORDINATION_BRAIN' ? 1 : 0]));
    const near = scoreCandidate(attackAt(3, 1), ctx({ allies: [{ tx: 3, ty: 2 }] }), w).score;
    const far = scoreCandidate(attackAt(3, 1), ctx({ allies: [{ tx: 8, ty: 8 }] }), w).score;
    expect(near).toBeLessThan(far);
  });
});
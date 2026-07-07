import { describe, expect, it } from 'vitest';
import { evaluateStance } from '../../../../src/game/combat/ai/enemyStance.js';

const base = {
  self: { position: { tx: 0, ty: 0 }, hp: 40, maxHp: 40, attackRange: 2, intelligence: 60 },
  target: { position: { tx: 3, ty: 0 }, hp: 100, maxHp: 100 },
  abilityKit: { isRanged: true, preferredRange: 3 },
};

describe('evaluateStance', () => {
  it('retreats when badly hurt (non-brute)', () => {
    const ctx = { ...base, self: { ...base.self, hp: 8 } };
    expect(evaluateStance(ctx).stance).toBe('RETREAT');
  });

  it('kites when a ranged attacker is inside preferred range', () => {
    const ctx = { ...base, target: { ...base.target, position: { tx: 1, ty: 0 } } };
    expect(evaluateStance(ctx).stance).toBe('KITE');
  });

  it('is always AGGRESSIVE for a brute regardless of HP', () => {
    const ctx = { ...base, self: { ...base.self, hp: 4, intelligence: 5 } };
    expect(evaluateStance(ctx).stance).toBe('AGGRESSIVE');
  });
});
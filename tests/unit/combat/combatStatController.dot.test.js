import { describe, expect, it } from 'vitest';
import { CombatStatController } from '../../../src/game/combat/combatStatController.js';

function withDummy() {
  const c = new CombatStatController();
  c.registerEntity('dummy', { hp: 20, maxHp: 20, tx: 0, ty: 0 });
  return c;
}

describe('CombatStatController — damage over time', () => {
  it('registers entities with an empty statuses array', () => {
    expect(withDummy().getEntity('dummy').statuses).toEqual([]);
  });

  it('applyStatus adds a status and refreshes turns for the same chainId', () => {
    const c = withDummy();
    c.applyStatus('dummy', { chainId: 'burn', damagePerTurn: 3, turns: 3, disposition: 'DEBUFF' });
    expect(c.getEntity('dummy').statuses).toHaveLength(1);
    c.tickStatuses('dummy'); // turns -> 2
    c.applyStatus('dummy', { chainId: 'burn', damagePerTurn: 3, turns: 3, disposition: 'DEBUFF' });
    expect(c.getEntity('dummy').statuses).toHaveLength(1);
    expect(c.getEntity('dummy').statuses[0].turns).toBe(3);
  });

  it('tickStatuses deals damage, decrements, drops at 0, clamps hp, reports defeat', () => {
    const c = withDummy();
    c.applyStatus('dummy', { chainId: 'burn', damagePerTurn: 3, turns: 2, disposition: 'DEBUFF' });
    const t1 = c.tickStatuses('dummy');
    expect(t1).toEqual([{ chainId: 'burn', damage: 3, targetHp: 17, targetDefeated: false }]);
    const t2 = c.tickStatuses('dummy');
    expect(t2[0].targetHp).toBe(14);
    expect(c.getEntity('dummy').statuses).toHaveLength(0); // 2 turns used up
    expect(c.tickStatuses('dummy')).toEqual([]); // nothing left
  });

  it('tickStatuses clamps hp at zero and reports defeat', () => {
    const c = new CombatStatController();
    c.registerEntity('glass', { hp: 2, maxHp: 2, tx: 0, ty: 0 });
    c.applyStatus('glass', { chainId: 'burn', damagePerTurn: 5, turns: 1, disposition: 'DEBUFF' });
    expect(c.tickStatuses('glass')).toEqual([{ chainId: 'burn', damage: 5, targetHp: 0, targetDefeated: true }]);
  });

  it('tolerates entities without statuses/hp', () => {
    const c = new CombatStatController();
    c.registerEntity('ghost', {});
    expect(c.tickStatuses('ghost')).toEqual([]);
    expect(c.tickStatuses('missing')).toEqual([]);
  });
});

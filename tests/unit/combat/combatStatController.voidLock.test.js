import { describe, expect, it } from 'vitest';
import { CombatStatController } from '../../../src/game/combat/combatStatController.js';
import { buildBlockedSet } from '../../../src/game/combat/combatPathfinding.js';

describe('CombatStatController void lock', () => {
  it('blocks movement while void-locked and releases after turns', () => {
    const c = new CombatStatController();
    c.registerEntity('player', { hp: 100, maxHp: 100, tx: 4, ty: 4 });
    c.setVoidLocked('player', 2);
    expect(c.canMove('player')).toBe(false);

    c.endTurn('player');
    expect(c.isVoidLocked('player')).toBe(true);
    expect(c.canMove('player')).toBe(false);

    c.endTurn('player');
    expect(c.isVoidLocked('player')).toBe(false);
    expect(c.canMove('player')).toBe(true);
  });

  it('pullEntityAdjacent moves target next to puller', () => {
    const c = new CombatStatController();
    c.registerEntity('mob', { hp: 50, maxHp: 50, tx: 2, ty: 2 });
    c.registerEntity('player', { hp: 100, maxHp: 100, tx: 5, ty: 2 });
    const pulled = c.pullEntityAdjacent('mob', 'player', buildBlockedSet([]));
    expect(pulled).not.toBeNull();
    const player = c.getEntity('player');
    const mob = c.getEntity('mob');
    const dist = Math.abs(player.position.tx - mob.position.tx) + Math.abs(player.position.ty - mob.position.ty);
    expect(dist).toBe(1);
  });
});
import { describe, expect, it } from 'vitest';
import { CombatStatController } from '../../../src/game/combat/combatStatController.js';

describe('CombatStatController — guard', () => {
  it('registers entities not guarding', () => {
    const c = new CombatStatController();
    c.registerEntity('player', {});
    expect(c.getEntity('player').guarding).toBe(false);
  });

  it('setGuarding toggles the flag and endTurn clears it', () => {
    const c = new CombatStatController();
    c.registerEntity('player', {});
    c.setGuarding('player', true);
    expect(c.getEntity('player').guarding).toBe(true);
    c.endTurn('player');
    expect(c.getEntity('player').guarding).toBe(false);
  });

  it('setGuarding on a missing entity is a no-op', () => {
    const c = new CombatStatController();
    expect(() => c.setGuarding('nobody', true)).not.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { CombatStatController } from '../../../src/game/combat/combatStatController.js';

function makeController() {
  const c = new CombatStatController();
  c.registerEntity('player', { tx: 4, ty: 6 });
  c.registerEntity('dummy', { hp: 100, maxHp: 100, tx: 4, ty: 5 }); // 1 tile away
  return c;
}

describe('CombatStatController — scholomance stats', () => {
  it('registers scholomance attribute block on each entity', () => {
    const c = new CombatStatController();
    c.registerEntity('player', { scholomanceOverrides: { BAPO: 18, DISCOVERY: 14 } });
    expect(c.getEntity('player').scholomance).toEqual({
      KSYN: 10,
      BAPO: 18,
      SONIC: 10,
      VALCH: 10,
      PSYCH: 10,
      CINF: 10,
      MYTH: 10,
      CODEX: 10,
      DISCOVERY: 14,
    });
  });
});

describe('CombatStatController — movement', () => {
  it('spends one movement point per move and refuses at zero', () => {
    const c = makeController();
    expect(c.canMove('player')).toBe(true);
    expect(c.spendMove('player')).toBe(true);
    expect(c.spendMove('player')).toBe(true);
    expect(c.spendMove('player')).toBe(true);
    expect(c.getEntity('player').movementPointsRemaining).toBe(0);
    expect(c.canMove('player')).toBe(false);
    expect(c.spendMove('player')).toBe(false);
    expect(c.getEntity('player').movementPointsRemaining).toBe(0);
  });

  it('endTurn refills the movement and attack pools and re-arms the attack', () => {
    const c = makeController();
    c.spendMove('player');
    c.resolveAttack('player', 'dummy');
    c.endTurn('player');
    expect(c.getEntity('player').movementPointsRemaining).toBe(3);
    expect(c.getEntity('player').attackPointsRemaining).toBe(6);
    expect(c.getEntity('player').attackUsed).toBe(false);
  });

  it('grantMovementPoints adds bonus movement for the current turn', () => {
    const c = makeController();
    c.spendMove('player');
    c.spendMove('player');
    c.spendMove('player');
    expect(c.getEntity('player').movementPointsRemaining).toBe(0);
    c.grantMovementPoints('player', 4);
    expect(c.getEntity('player').movementPointsRemaining).toBe(4);
    expect(c.canMove('player')).toBe(true);
  });

  it('applyEquipmentModifiers stacks gear bonuses onto the base stat block', () => {
    const c = makeController();
    c.applyEquipmentModifiers('player', { movementPoints: 1, attackPoints: 5 });
    expect(c.getEntity('player').movementPoints).toBe(4);
    expect(c.getEntity('player').movementPointsRemaining).toBe(4);
    expect(c.getEntity('player').attackPoints).toBe(11);
  });

  it('basic attack damage uses equipment scholomance bonuses', () => {
    const c = makeController();
    c.applyEquipmentModifiers('player', { scholomance: { BAPO: 2 } });
    const result = c.resolveAttack('player', 'dummy');
    expect(result?.damage).toBe(6);
  });
});

describe('CombatStatController — attack', () => {
  it('respects attackRange for in/out of range targets', () => {
    const c = makeController();
    expect(c.canAttack('player', 'dummy')).toBe(true);       // 1 tile, range 2
    expect(c.isInAttackRange('player', 'dummy')).toBe(true);
    c.setPosition('dummy', 4, 3);                              // now 3 tiles away
    expect(c.canAttack('player', 'dummy')).toBe(false);
    expect(c.isInAttackRange('player', 'dummy')).toBe(false);
    expect(c.inRangeTargetIds('player', ['dummy'])).toEqual([]);
  });

  it('resolveAttack spends 3 AP per hit, dealing BAPO-scaled damage twice per turn', () => {
    const c = makeController();
    // BAPO base 10 → 5 damage; pool 6 ÷ cost 3 = two swings.
    const first = c.resolveAttack('player', 'dummy');
    expect(first).toEqual({ damage: 5, apSpent: 3, attackPointsRemaining: 3, targetHp: 95, targetDefeated: false });
    expect(c.getEntity('player').attackUsed).toBe(false);      // 3 AP left → one more swing
    const second = c.resolveAttack('player', 'dummy');
    expect(second).toEqual({ damage: 5, apSpent: 3, attackPointsRemaining: 0, targetHp: 90, targetDefeated: false });
    expect(c.getEntity('player').attackUsed).toBe(true);       // pool drained
    expect(c.resolveAttack('player', 'dummy')).toBe(null);     // can't afford a third
    expect(c.getEntity('dummy').hp).toBe(90);
  });

  it('damage scales with the attacker BAPO attribute', () => {
    const c = new CombatStatController();
    c.registerEntity('brute', { scholomanceOverrides: { BAPO: 30 }, tx: 4, ty: 6 });
    c.registerEntity('dummy', { hp: 100, maxHp: 100, tx: 4, ty: 5 });
    expect(c.resolveAttack('brute', 'dummy').damage).toBe(15); // 30 ÷ 2
  });

  it('clamps HP at zero and reports defeat', () => {
    const c = makeController();
    c.registerEntity('glass', { hp: 5, maxHp: 5, tx: 4, ty: 5 });
    const res = c.resolveAttack('player', 'glass');
    expect(res).toEqual({ damage: 5, apSpent: 3, attackPointsRemaining: 3, targetHp: 0, targetDefeated: true });
  });

  it('halves basic-attack damage against a guarding target', () => {
    const c = makeController();
    c.setGuarding('dummy', true);
    const res = c.resolveAttack('player', 'dummy');
    expect(res.damage).toBe(3);
    expect(c.getEntity('dummy').hp).toBe(97);
  });
});

describe('CombatStatController — spellweave invoke', () => {
  it('resolveSpellCast spends 3 AP and applies scored spell damage', () => {
    const c = makeController();
    const result = c.resolveSpellCast('player', 'dummy', { damage: 24, scoreData: { school: 'SONIC' } });
    expect(result).toEqual({
      damage: 24,
      apSpent: 3,
      attackPointsRemaining: 3,
      targetHp: 76,
      targetDefeated: false,
    });
    expect(c.getEntity('player').spellweaveUsed).toBe(true);
    expect(c.getEntity('player').lastScoreData).toEqual({ school: 'SONIC' });
  });

  it('refuses spell casts without enough AP', () => {
    const c = makeController();
    const player = c.getEntity('player');
    player.attackPointsRemaining = 2;
    expect(c.resolveSpellCast('player', 'dummy', { damage: 20 })).toBe(null);
  });

  it('allows only one spellweave invoke per turn', () => {
    const c = makeController();
    expect(c.resolveSpellCast('player', 'dummy', { damage: 12 })).not.toBe(null);
    expect(c.resolveSpellCast('player', 'dummy', { damage: 12 })).toBe(null);
    c.endTurn('player');
    expect(c.getEntity('player').spellweaveUsed).toBe(false);
    expect(c.resolveSpellCast('player', 'dummy', { damage: 12 })).not.toBe(null);
  });

  it('endTurn regens mana from the last invoke profile when below cap', () => {
    const c = makeController();
    c.getEntity('player').manaPointsRemaining = 80;
    c.resolveSpellCast('player', 'dummy', {
      damage: 20,
      scoreData: { school: 'SONIC', schoolDensity: { SONIC: 0.8 }, rarity: { ordinal: 2 } },
    });
    c.endTurn('player');
    expect(c.getEntity('player').manaPointsRemaining).toBeGreaterThan(80);
  });
});

import { describe, expect, it } from 'vitest';

import { ITEM_DATABASE } from '../../../src/data/itemDatabase.js';
import { CombatStatController } from '../../../src/game/combat/combatStatController.js';
import { aggregateEquipmentBonuses } from '../../../src/game/combat/equipmentCombatBonuses.js';
import {
  canPlayerCastIcicleSlam,
  computeIcicleSlamDamagePerHit,
  ICICLE_SLAM_AP_COST,
  resolvePlayerIcicleSlam,
} from '../../../src/game/combat/iceSlimeStaffAbilities.js';
import { getEffectiveScholomance } from '../../../src/game/combat/scholomanceStats.js';

describe('ice slime staff equipment bonuses', () => {
  it('aggregates +1 VALCH and +2 BAPO from the equipped staff', () => {
    const staff = ITEM_DATABASE.item_ice_slime_staff;
    const bonuses = aggregateEquipmentBonuses({ weapon: staff });
    expect(bonuses.scholomance).toEqual({ VALCH: 1, BAPO: 2 });
    expect(bonuses.grantedAbilities).toEqual(['icicle_slam']);
  });

  it('applies scholomance bonuses to the player combat entity', () => {
    const c = new CombatStatController();
    c.registerEntity('player', { scholomanceOverrides: { VALCH: 10, BAPO: 10 } });
    c.registerEntity('dummy', { hp: 100, maxHp: 100, tx: 4, ty: 0 });
    c.applyEquipmentModifiers('player', aggregateEquipmentBonuses({
      weapon: ITEM_DATABASE.item_ice_slime_staff,
    }));
    expect(getEffectiveScholomance(c.getEntity('player'))).toMatchObject({ VALCH: 11, BAPO: 12 });
  });
});

describe('icicle slam ability', () => {
  function makeController() {
    const c = new CombatStatController();
    c.registerEntity('player', {
      tx: 4,
      ty: 8,
      scholomanceOverrides: { VALCH: 11, BAPO: 12 },
    });
    c.registerEntity('dummy', { hp: 100, maxHp: 100, tx: 4, ty: 0 });
    c.applyEquipmentModifiers('player', { grantedAbilities: ['icicle_slam'] });
    return c;
  }

  it('scales slam damage with VALCH', () => {
    expect(computeIcicleSlamDamagePerHit({ VALCH: 10 })).toBe(8);
    expect(computeIcicleSlamDamagePerHit({ VALCH: 11 })).toBe(8);
    expect(computeIcicleSlamDamagePerHit({ VALCH: 12 })).toBe(9);
  });

  it('requires distance and AP before casting', () => {
    const c = makeController();
    expect(canPlayerCastIcicleSlam(c, 'player', 'dummy')).toBe(true);
    c.getEntity('dummy').position = { tx: 4, ty: 7 };
    expect(canPlayerCastIcicleSlam(c, 'player', 'dummy')).toBe(false);
  });

  it('stages a three-hit slam and starts cooldown', () => {
    const c = makeController();
    const result = resolvePlayerIcicleSlam(c, 'player', 'dummy');
    expect(result).toMatchObject({
      abilityId: 'icicle_slam',
      staged: true,
      hitCount: 3,
      apSpent: ICICLE_SLAM_AP_COST,
    });
    expect(c.getEntity('player').icicleSlamCooldown).toBe(3);
    expect(c.getEntity('player').attackPointsRemaining).toBe(2);
  });
});
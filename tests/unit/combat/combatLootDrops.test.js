import { describe, expect, it } from 'vitest';

import {
  ICE_SLIME_STAFF_ITEM_ID,
  PORTAL_WARDEN_LOOT_CHANCE,
  rollCombatLoot,
  resolveCombatLootGrant,
} from '../../../src/game/combat/combatLootDrops.js';
import { PORTAL_WARDEN_ID } from '../../../src/game/combat/portalPhase.js';

describe('combatLootDrops', () => {
  it('exposes the ice slime staff id for void acolyte drops', () => {
    expect(ICE_SLIME_STAFF_ITEM_ID).toBe('item_ice_slime_staff');
  });

  it('returns null when the rng roll misses', () => {
    const loot = rollCombatLoot(PORTAL_WARDEN_ID, () => PORTAL_WARDEN_LOOT_CHANCE);
    expect(loot).toBeNull();
  });

  it('rolls ice slime staff from the void acolyte on a winning rng', () => {
    const loot = rollCombatLoot(PORTAL_WARDEN_ID, () => PORTAL_WARDEN_LOOT_CHANCE - 0.001);
    expect(loot).toEqual({
      itemId: ICE_SLIME_STAFF_ITEM_ID,
      itemName: 'Ice Slime Staff',
      itemRarity: 'rare',
      enemyId: PORTAL_WARDEN_ID,
    });
  });

  it('does not roll loot for enemies without a drop table', () => {
    expect(rollCombatLoot('sentinel-west', () => 0)).toBeNull();
  });

  it('marks duplicate grants without calling grantItem', () => {
    const calls = [];
    const result = resolveCombatLootGrant(
      { itemId: ICE_SLIME_STAFF_ITEM_ID, itemName: 'Ice Slime Staff', enemyId: PORTAL_WARDEN_ID },
      {
        hasItem: () => true,
        grantItem: (...args) => { calls.push(args); return null; },
      },
    );
    expect(result.duplicate).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('grants a new item when inventory has space', () => {
    const result = resolveCombatLootGrant(
      { itemId: ICE_SLIME_STAFF_ITEM_ID, itemName: 'Ice Slime Staff', enemyId: PORTAL_WARDEN_ID },
      {
        hasItem: () => false,
        grantItem: () => ({ id: ICE_SLIME_STAFF_ITEM_ID }),
      },
    );
    expect(result.duplicate).toBe(false);
    expect(result.granted).toBe(true);
    expect(result.text).toContain('Ice Slime Staff');
  });

  it('reports inventory full when grantItem returns null', () => {
    const result = resolveCombatLootGrant(
      { itemId: ICE_SLIME_STAFF_ITEM_ID, itemName: 'Ice Slime Staff', enemyId: PORTAL_WARDEN_ID },
      {
        hasItem: () => false,
        grantItem: () => null,
      },
    );
    expect(result.granted).toBe(false);
    expect(result.inventoryFull).toBe(true);
  });
});
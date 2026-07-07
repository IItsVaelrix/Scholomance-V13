import { ITEM_DATABASE } from '../../data/itemDatabase.js';
import { PORTAL_WARDEN_ID } from './portalPhase.js';

export const ICE_SLIME_STAFF_ITEM_ID = 'item_ice_slime_staff';

/** Chance (0–1) that the Void Acolyte drops the ice slime staff on defeat. */
export const PORTAL_WARDEN_LOOT_CHANCE = 0.25;

/** @type {Readonly<Record<string, readonly { itemId: string, chance: number }[]>>} */
const COMBAT_LOOT_TABLES = Object.freeze({
  [PORTAL_WARDEN_ID]: Object.freeze([
    { itemId: ICE_SLIME_STAFF_ITEM_ID, chance: PORTAL_WARDEN_LOOT_CHANCE },
  ]),
  'sentinel-west': Object.freeze([
    { itemId: 'item_chest_sentinel', chance: 0.03 },
  ]),
  'sentinel-east': Object.freeze([
    { itemId: 'item_chest_sentinel', chance: 0.03 },
  ]),
});

/**
 * Roll combat loot for a defeated enemy.
 * @param {string} enemyId
 * @param {() => number} [rng]
 * @returns {{ itemId: string, itemName: string, enemyId: string } | null}
 */
export function rollCombatLoot(enemyId, rng = Math.random) {
  const table = COMBAT_LOOT_TABLES[enemyId];
  if (!table?.length) return null;

  for (const entry of table) {
    if (rng() >= entry.chance) continue;
    const canonical = ITEM_DATABASE[entry.itemId];
    return {
      itemId: entry.itemId,
      itemName: canonical?.name || entry.itemId,
      itemRarity: canonical?.rarity || 'common',
      enemyId,
    };
  }
  return null;
}

/**
 * Apply a loot roll to inventory (pure helper for tests + scene).
 * @param {{ itemId: string, itemName: string, enemyId: string } | null} roll
 * @param {{ hasItem: (id: string) => boolean, grantItem: (id: string) => object | null }} inventory
 */
export function resolveCombatLootGrant(roll, inventory) {
  if (!roll) return null;

  if (inventory.hasItem(roll.itemId)) {
    return {
      ...roll,
      duplicate: true,
      granted: false,
      text: `You already carry the ${roll.itemName}.`,
    };
  }

  const granted = inventory.grantItem(roll.itemId);
  if (!granted) {
    return {
      ...roll,
      duplicate: false,
      granted: false,
      inventoryFull: true,
      text: 'Inventory full — loot lost to the void.',
    };
  }

  return {
    ...roll,
    duplicate: false,
    granted: true,
    text: `${roll.itemName} acquired.`,
  };
}
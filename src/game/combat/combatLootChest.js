import { ITEM_DATABASE } from '../../data/itemDatabase.js';
import {
  LOOT_CHEST_PNG_SCALE,
  LOOT_CHEST_TIERS,
  getLootChestFrameTextureKey,
  getLootChestTextureKey,
  getLootChestTexturePath,
} from '../../../codex/core/pixelbrain/loot-chest-shared.js';
import { rollCombatLoot } from './combatLootDrops.js';

export {
  LOOT_CHEST_PNG_SCALE,
  LOOT_CHEST_TIERS,
  getLootChestFrameTextureKey,
  getLootChestTextureKey,
  getLootChestTexturePath,
};

const RARITY_TO_CHEST_TIER = Object.freeze({
  common: LOOT_CHEST_TIERS.COMMON,
  uncommon: LOOT_CHEST_TIERS.UNCOMMON,
  rare: LOOT_CHEST_TIERS.RARE,
  mythic: LOOT_CHEST_TIERS.MYTHIC,
  legendary: LOOT_CHEST_TIERS.LEGENDARY,
  source: LOOT_CHEST_TIERS.SOURCE,
});

const TIER_LABELS = Object.freeze({
  [LOOT_CHEST_TIERS.COMMON]: 'Common Chest',
  [LOOT_CHEST_TIERS.UNCOMMON]: 'Uncommon Chest',
  [LOOT_CHEST_TIERS.RARE]: 'Rare Chest',
  [LOOT_CHEST_TIERS.MYTHIC]: 'Mythic Chest',
  [LOOT_CHEST_TIERS.LEGENDARY]: 'Legendary Chest',
  [LOOT_CHEST_TIERS.SOURCE]: 'Source Chest',
});

export function chestTierFromItemRarity(rarity) {
  return RARITY_TO_CHEST_TIER[String(rarity || '').toLowerCase()] || LOOT_CHEST_TIERS.COMMON;
}

export function getLootChestLabel(tier) {
  return TIER_LABELS[tier] || TIER_LABELS[LOOT_CHEST_TIERS.COMMON];
}

/**
 * Plan a chest spawn for a defeated enemy.
 * Always returns a chest tier; loot may be null when the roll misses.
 */
export function planCombatChestDrop(enemyId, rng = Math.random) {
  const loot = rollCombatLoot(enemyId, rng);
  const tier = loot
    ? chestTierFromItemRarity(ITEM_DATABASE[loot.itemId]?.rarity)
    : LOOT_CHEST_TIERS.COMMON;

  return {
    tier,
    textureKey: getLootChestFrameTextureKey(tier, 0),
    label: getLootChestLabel(tier),
    loot,
    enemyId,
  };
}
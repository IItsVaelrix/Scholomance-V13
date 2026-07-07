/**
 * Character compendium — aggregates tactical stats, scholomance attributes,
 * equipped gear, and example spell quality for the in-game character sheet.
 */
import { COMBAT_STATS } from '../combat/combatStats.js';
import {
  SCHOLOMANCE_STAT_CATEGORIES,
  SCHOLOMANCE_STATS,
  buildDefaultScholomanceStatBlock,
  getScholomanceStatsByCategory,
} from '../../../codex/core/scholomance-stats.schema.js';
import {
  EXAMPLE_SPELL_INCINERATE_STUDENT,
  buildFullStatBlock,
} from '../combat/scholomanceStats.js';
import { computeSpellQuality } from '../combat/spellQuality.js';
import { getInventorySnapshot } from '../inventory/inventoryService.js';
import { getScholomanceXpSnapshot } from './scholomanceXpService.js';

export const CHARACTER_NAME = 'Scholomancer';

export const CATEGORY_LABELS = Object.freeze({
  [SCHOLOMANCE_STAT_CATEGORIES.TACTICAL]: 'Tactical',
  [SCHOLOMANCE_STAT_CATEGORIES.CREATIVE_COMBAT]: 'Creative Combat',
  [SCHOLOMANCE_STAT_CATEGORIES.MIND_KNOWLEDGE]: 'Mind & Knowledge',
  [SCHOLOMANCE_STAT_CATEGORIES.WORLD_INTERACTION]: 'World Interaction',
  [SCHOLOMANCE_STAT_CATEGORIES.PRESENTATION_IMPACT]: 'Presentation & Impact',
});

const SCHOLOMANCE_CATEGORY_ORDER = [
  SCHOLOMANCE_STAT_CATEGORIES.CREATIVE_COMBAT,
  SCHOLOMANCE_STAT_CATEGORIES.MIND_KNOWLEDGE,
  SCHOLOMANCE_STAT_CATEGORIES.WORLD_INTERACTION,
  SCHOLOMANCE_STAT_CATEGORIES.PRESENTATION_IMPACT,
];

const EQUIPMENT_SLOT_LABELS = Object.freeze({
  head: 'Head',
  amulet: 'Amulet',
  shoulder: 'Shoulder',
  chest: 'Chest',
  weapon: 'Weapon',
  offhand: 'Offhand',
  ring1: 'Ring',
  ring2: 'Ring',
  legs: 'Legs',
  boots: 'Boots',
});

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function statBarPercent(value, min, max) {
  const span = Math.max(1, max - min);
  const clamped = Math.max(min, Math.min(max, Number(value) || min));
  return Math.round(((clamped - min) / span) * 100);
}

/**
 * @param {object} [options]
 * @param {object|null} [options.combatStats]
 * @param {Record<string, number>|null} [options.scholomance]
 * @param {Record<string, object|null>|null} [options.equipped]
 * @param {Array<object>|null} [options.xpReadout]
 */
export function buildCharacterCompendiumSnapshot({
  combatStats = null,
  scholomance = null,
  equipped = null,
  xpReadout = null,
} = {}) {
  const inventory = equipped ? { equipped } : getInventorySnapshot();
  const xpSnapshot = xpReadout ? null : getScholomanceXpSnapshot();
  const resolvedReadout = xpReadout || xpSnapshot?.readout || [];
  const scholomanceBlock = buildDefaultScholomanceStatBlock(
    scholomance || combatStats?.scholomance || xpSnapshot?.scholomance || {},
  );
  const xpByKey = Object.fromEntries(resolvedReadout.map((row) => [row.key, row]));
  const fullBlock = buildFullStatBlock({ scholomance: scholomanceBlock });

  const tacticalRows = COMBAT_STATS.map((def) => {
    const live = combatStats?.[def.key];
    const value = Number.isFinite(Number(live)) ? Number(live) : def.base;
    return {
      key: def.key,
      label: def.label,
      value,
      base: def.base,
      min: def.min,
      max: def.max,
      description: def.description,
      percent: statBarPercent(value, def.min, def.max),
      category: def.category,
    };
  });

  const scholomanceCategories = SCHOLOMANCE_CATEGORY_ORDER.map((categoryId) => ({
    id: categoryId,
    label: CATEGORY_LABELS[categoryId] || categoryId,
    stats: getScholomanceStatsByCategory(categoryId).map((def) => {
      const value = scholomanceBlock[def.key] ?? def.base;
      const xpRow = xpByKey[def.key];
      return {
        key: def.key,
        abbrev: def.abbrev,
        fullName: def.fullName,
        value,
        level: xpRow?.level ?? 1,
        xp: xpRow?.xp ?? 0,
        xpProgress: xpRow?.progress?.progressPercent ?? 0,
        base: def.base,
        min: def.min,
        max: def.max,
        coreFunction: def.coreFunction,
        designRead: def.designRead,
        percent: statBarPercent(value, def.min, def.max),
      };
    }),
  }));

  const gearRows = Object.entries(inventory.equipped || {})
    .map(([slotId, item]) => ({
      slotId,
      slotLabel: EQUIPMENT_SLOT_LABELS[slotId] || slotId,
      item: item
        ? { id: item.id, name: item.name, rarity: item.rarity, type: item.type }
        : null,
    }))
    .filter((row) => row.item);

  const spellQuality = computeSpellQuality({
    spell: EXAMPLE_SPELL_INCINERATE_STUDENT,
    stats: scholomanceBlock,
    novelUsage: true,
  });

  return {
    name: CHARACTER_NAME,
    version: fullBlock.scholomance ? 'scholomance-stat-tree-v1' : 'unknown',
    tactical: {
      movementPointsRemaining: combatStats?.movementPointsRemaining ?? null,
      movementPoints: combatStats?.movementPoints ?? null,
      attackUsed: combatStats?.attackUsed ?? false,
      rows: tacticalRows,
    },
    scholomance: {
      block: scholomanceBlock,
      categories: scholomanceCategories,
      registryCount: SCHOLOMANCE_STATS.length,
    },
    equipment: {
      equippedCount: gearRows.length,
      rows: gearRows,
    },
    spellProfile: {
      ...EXAMPLE_SPELL_INCINERATE_STUDENT,
      quality: spellQuality,
    },
  };
}
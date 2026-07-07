/**
 * Scholomance attribute stat tree — game-layer exports.
 *
 * Tactical combat primitives (MP / ATK / RNG) live in combatStats.js.
 * This module is the attribute layer: KSYN, BAPO, SONIC, VALCH, PSYCH,
 * CINF, MYTH, CODEX, DISCOVERY.
 */
export {
  SCHOLOMANCE_STAT_KEYS,
  SCHOLOMANCE_STAT_CATEGORIES,
  SCHOLOMANCE_CATEGORY_STATS,
  SCHOLOMANCE_STATS,
  buildDefaultScholomanceStatBlock,
  clampScholomanceStatValue,
  getScholomanceStatDefinition,
  getScholomanceStatsByCategory,
} from '../../../codex/core/scholomance-stats.schema.js';

import {
  buildDefaultScholomanceStatBlock,
  SCHOLOMANCE_STAT_KEYS,
  SCHOLOMANCE_STATS,
} from '../../../codex/core/scholomance-stats.schema.js';
import { COMBAT_STATS, buildDefaultStatBlock } from './combatStats.js';

export const STAT_TREE_VERSION = 'scholomance-stat-tree-v1';

/** Ordered registry: tactical slice first, then scholomance attributes. */
export function getFullStatRegistry() {
  return {
    version: STAT_TREE_VERSION,
    tactical: COMBAT_STATS,
    scholomance: SCHOLOMANCE_STATS,
  };
}

/**
 * Unified player stat block for combat entities.
 *
 * @param {object} [options]
 * @param {Partial<Record<string, number>>} [options.tactical]
 * @param {Partial<Record<string, number>>} [options.scholomance]
 */
export function buildFullStatBlock({ tactical = {}, scholomance = {} } = {}) {
  return {
    ...buildDefaultStatBlock(tactical),
    scholomance: buildDefaultScholomanceStatBlock(scholomance),
  };
}

/**
 * @param {Record<string, number>|null|undefined} scholomanceBlock
 * @param {string} key
 * @returns {number}
 */
export function readScholomanceStat(scholomanceBlock, key) {
  const k = String(key || '').toUpperCase();
  const value = scholomanceBlock?.[k];
  return Number.isFinite(Number(value)) ? Number(value) : 10;
}

/**
 * Example spell profile illustrating primary / secondary / flavor scaling.
 * @type {import('./spellQuality.js').SpellStatProfile}
 */
export const EXAMPLE_SPELL_INCINERATE_STUDENT = Object.freeze({
  id: 'incinerate-student',
  name: 'Incinerate Student',
  baseRank: 12,
  primary: 'VALCH',
  secondary: 'BAPO',
  flavorStats: Object.freeze(['CINF', 'MYTH']),
  discoveryEligible: true,
});

export function listScholomanceStatKeys() {
  return [...SCHOLOMANCE_STAT_KEYS];
}

/**
 * Basic-attack damage scales off BAPO (Battle Poetry) — the martial/verbal
 * offense attribute. Single-knob divisor; tune here for balance.
 * Base BAPO 10 ÷ 2 = 5 damage.
 */
export const BASIC_ATTACK_BAPO_DIVISOR = 2;

/**
 * Damage dealt by a basic attack, derived from the attacker's Scholomance block.
 * @param {Record<string, number>|null|undefined} scholomanceBlock
 * @returns {number}
 */
export function computeBasicAttackDamage(scholomanceBlock) {
  const bapo = readScholomanceStat(scholomanceBlock, 'BAPO');
  return Math.max(1, Math.round(bapo / BASIC_ATTACK_BAPO_DIVISOR));
}

/**
 * Base scholomance block plus equipment bonuses on a combat entity.
 * @param {{ scholomance?: Record<string, number>, equipmentScholomanceBonus?: Record<string, number> } | null} entity
 */
export function getEffectiveScholomance(entity) {
  const base = entity?.scholomance || {};
  const bonus = entity?.equipmentScholomanceBonus || {};
  const merged = { ...base };
  for (const [key, value] of Object.entries(bonus)) {
    const statKey = String(key).toUpperCase();
    merged[statKey] = readScholomanceStat(base, statKey) + (Number(value) || 0);
  }
  return merged;
}
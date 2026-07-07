/**
 * Spell quality from Scholomance attribute stats.
 *
 * Spell Quality =
 *   Base Spell Rank
 *   + Relevant Stat Modifier
 *   + Novel Usage Bonus (DISCOVERY)
 *   + Presentation Modifier (CINF)
 *   + Mythic Resonance (MYTH)
 *   + Roll Bonus
 */
import {
  buildDefaultScholomanceStatBlock,
  clampScholomanceStatValue,
} from '../../../codex/core/scholomance-stats.schema.js';
import { readScholomanceStat } from './scholomanceStats.js';

const NEUTRAL_STAT = 10;

/**
 * @typedef {object} SpellStatProfile
 * @property {string} [id]
 * @property {string} [name]
 * @property {number} [baseRank]
 * @property {string} primary
 * @property {string} [secondary]
 * @property {readonly string[]} [flavorStats]
 * @property {boolean} [discoveryEligible]
 */

/**
 * @typedef {object} SpellQualityInput
 * @property {SpellStatProfile} spell
 * @property {Partial<Record<string, number>>|Record<string, number>} [stats]
 * @property {boolean} [novelUsage]
 * @property {number} [rollBonus]
 */

/**
 * @typedef {object} SpellQualityBreakdown
 * @property {number} total
 * @property {number} baseRank
 * @property {number} primaryModifier
 * @property {number} secondaryModifier
 * @property {number} discoveryBonus
 * @property {number} presentationModifier
 * @property {number} mythicResonance
 * @property {number} rollBonus
 * @property {SpellStatProfile} spell
 */

function normalizeStats(stats = {}) {
  if (stats.scholomance && typeof stats.scholomance === 'object') {
    return buildDefaultScholomanceStatBlock(stats.scholomance);
  }
  return buildDefaultScholomanceStatBlock(stats);
}

/** Primary/secondary stats contribute linearly from the neutral baseline. */
export function statModifierForSpell(statValue, weight = 1) {
  const value = Number(statValue);
  if (!Number.isFinite(value)) return 0;
  return Math.round((value - NEUTRAL_STAT) * 0.6 * weight);
}

/** DISCOVERY rewards off-label or experimental casting. */
export function discoveryBonusFromStat(statValue, novelUsage = false) {
  if (!novelUsage) return 0;
  const value = Number(statValue);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round((value - 8) * 0.45));
}

/** CINF turns spectacle into mechanical clarity and pressure. */
export function presentationModifierFromStat(statValue) {
  const value = Number(statValue);
  if (!Number.isFinite(value)) return 0;
  return Math.round((value - NEUTRAL_STAT) * 0.35);
}

/** MYTH scales legendary gravity and archetypal resonance. */
export function mythicResonanceFromStat(statValue) {
  const value = Number(statValue);
  if (!Number.isFinite(value)) return 0;
  return Math.round((value - NEUTRAL_STAT) * 0.4);
}

/**
 * @param {SpellQualityInput} input
 * @returns {SpellQualityBreakdown}
 */
export function computeSpellQuality(input = {}) {
  const spell = input.spell || {};
  const stats = normalizeStats(input.stats || {});
  const rollBonus = Math.round(Number(input.rollBonus) || 0);

  const primaryKey = String(spell.primary || 'VALCH').toUpperCase();
  const secondaryKey = spell.secondary ? String(spell.secondary).toUpperCase() : null;

  const primaryModifier = statModifierForSpell(readScholomanceStat(stats, primaryKey), 1);
  const secondaryModifier = secondaryKey
    ? statModifierForSpell(readScholomanceStat(stats, secondaryKey), 0.5)
    : 0;

  const flavor = Array.isArray(spell.flavorStats) ? spell.flavorStats : [];
  const presentationModifier = flavor.includes('CINF')
    ? presentationModifierFromStat(readScholomanceStat(stats, 'CINF'))
    : 0;
  const mythicResonance = flavor.includes('MYTH')
    ? mythicResonanceFromStat(readScholomanceStat(stats, 'MYTH'))
    : 0;

  const discoveryBonus = spell.discoveryEligible !== false && input.novelUsage
    ? discoveryBonusFromStat(readScholomanceStat(stats, 'DISCOVERY'), true)
    : 0;

  const baseRank = Math.max(0, Math.round(Number(spell.baseRank) || 10));
  const total = Math.max(
    0,
    baseRank
      + primaryModifier
      + secondaryModifier
      + discoveryBonus
      + presentationModifier
      + mythicResonance
      + rollBonus,
  );

  return {
    total,
    baseRank,
    primaryModifier,
    secondaryModifier,
    discoveryBonus,
    presentationModifier,
    mythicResonance,
    rollBonus,
    spell,
  };
}

/**
 * Apply a level-up or equipment bonus to one scholomance stat.
 *
 * @param {Record<string, number>} block
 * @param {string} key
 * @param {number} delta
 * @returns {Record<string, number>}
 */
export function applyScholomanceStatDelta(block, key, delta) {
  const k = String(key || '').toUpperCase();
  const current = readScholomanceStat(block, k);
  return {
    ...block,
    [k]: clampScholomanceStatValue(k, current + (Number(delta) || 0)),
  };
}
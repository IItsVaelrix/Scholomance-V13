/**
 * Scholomance stat gates for compendium tier ceilings.
 */

import {
  clampScholomanceStatValue,
  getScholomanceStatDefinition,
} from '../scholomance-stats.schema.js';

/**
 * @param {Record<string, number>|null|undefined} block
 * @param {string} key
 */
export function readStat(block, key) {
  const k = String(key || '').toUpperCase();
  const value = block?.[k];
  if (Number.isFinite(Number(value))) return clampScholomanceStatValue(k, value);
  return getScholomanceStatDefinition(k)?.base ?? 10;
}

/**
 * @param {number} statValue
 * @param {number} min
 * @param {number} [span=40]
 */
export function statGateFactor(statValue, min, span = 40) {
  const value = Number(statValue) || 0;
  if (value < min) return Math.max(0.35, 0.35 + (value / Math.max(1, min)) * 0.35);
  return clampStatFactor(0.7 + ((value - min) / span) * 0.3);
}

function clampStatFactor(n) {
  return Math.max(0.35, Math.min(1, n));
}

/**
 * @param {Record<string, number>|null|undefined} scholomance
 * @param {string} tierId
 * @param {object} [options]
 */
export function computeStatFactor(scholomance, tierId, options = {}) {
  switch (tierId) {
    case 'CHEMICAL':
      return statGateFactor(readStat(scholomance, 'VALCH'), options.valchMin || 10);
    case 'PSYCHOLOGY':
      return statGateFactor(readStat(scholomance, 'PSYCH'), 8);
    case 'SONIC':
      return statGateFactor(readStat(scholomance, 'SONIC'), 8);
    case 'EMOTION':
      return statGateFactor(readStat(scholomance, 'BAPO'), 8);
    case 'LEXICAL_RARITY':
      return statGateFactor(readStat(scholomance, 'CODEX'), 10, 50);
    case 'MYTH':
      return statGateFactor(readStat(scholomance, 'MYTH'), 12);
    case 'DISCOVERY':
      return statGateFactor(readStat(scholomance, 'DISCOVERY'), 8);
    case 'ELEMENTAL':
      return statGateFactor(readStat(scholomance, 'VALCH'), 8);
    default:
      return 0.85;
  }
}
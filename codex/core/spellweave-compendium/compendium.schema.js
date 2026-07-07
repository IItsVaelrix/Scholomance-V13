/**
 * Spellweave Compendium — tier schema and aggregation constants.
 * CLASSIFICATION: core / pure / schema
 */

export const COMPENDIUM_VERSION = 'spellweave-compendium-v1';

export const TIER_IDS = Object.freeze({
  ELEMENTAL: 'ELEMENTAL',
  EMOTION: 'EMOTION',
  LEXICAL_RARITY: 'LEXICAL_RARITY',
  CHEMICAL: 'CHEMICAL',
  PSYCHOLOGY: 'PSYCHOLOGY',
  SONIC: 'SONIC',
  MYTH: 'MYTH',
  DISCOVERY: 'DISCOVERY',
});

export const TIER_WEIGHTS = Object.freeze([1.0, 0.35, 0.15]);

export const COMPENDIUM_MULTIPLIER_MIN = 0.75;
export const COMPENDIUM_MULTIPLIER_MAX = 2.25;

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/**
 * @param {object} partial
 * @returns {object}
 */
export function createTierReadout(partial = {}) {
  return {
    tierId: partial.tierId || 'UNKNOWN',
    band: partial.band || 'UNKNOWN',
    entryId: partial.entryId || null,
    matchedLexemes: [...(partial.matchedLexemes || [])],
    rawSignal: clamp(partial.rawSignal, 0, 1),
    grammarFactor: clamp(partial.grammarFactor, 0, 1),
    statFactor: clamp(partial.statFactor, 0, 1),
    amplifier: clamp(partial.amplifier, 0, 0.5),
    counsel: partial.counsel || '',
    discovered: !!partial.discovered,
  };
}

/**
 * @param {Array<object>} tierBreakdown
 * @returns {number}
 */
export function aggregateCompendiumMultiplier(tierBreakdown = []) {
  const sorted = [...tierBreakdown]
    .filter((entry) => entry.amplifier > 0)
    .sort((a, b) => b.amplifier - a.amplifier);

  let bonus = 0;
  sorted.slice(0, TIER_WEIGHTS.length).forEach((entry, index) => {
    bonus += entry.amplifier * (TIER_WEIGHTS[index] || 0.1);
  });

  return clamp(1 + bonus, COMPENDIUM_MULTIPLIER_MIN, COMPENDIUM_MULTIPLIER_MAX);
}

/**
 * @param {object} readout
 * @returns {string}
 */
export function formatCompendiumCounselLine(readout) {
  const sign = readout.amplifier >= 0 ? '+' : '';
  const amp = `${sign}${readout.amplifier.toFixed(2)}`;
  const counsel = readout.counsel || `${readout.tierId} ${readout.band}`;
  return `[COMPENDIUM] ${counsel} (${amp})`;
}
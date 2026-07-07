/**
 * Scholomance per-attribute XP — canonical schema.
 *
 * Each of the nine scholomance stats earns its own XP pool and level.
 * Stat values derive from level: base + (level - 1), clamped to registry bounds.
 *
 * CLASSIFICATION: core / pure / schema
 */
import {
  SCHOLOMANCE_STAT_KEYS,
  SCHOLOMANCE_STATS,
  clampScholomanceStatValue,
  getScholomanceStatDefinition,
} from './scholomance-stats.schema.js';

export const STAT_XP_CONFIG = Object.freeze({
  MAX_LEVEL: 91,
  /** Per-stat curve is a softened slice of the account XP curve. */
  XP_DIVISOR: 6,
});

export const SCHOLOMANCE_XP_ACTIONS = Object.freeze({
  BASIC_ATTACK: 'basic_attack',
  WEAVE_CAST_LEGAL: 'weave_cast_legal',
  WEAVE_CAST_FAILURE: 'weave_cast_failure',
  GATHER_SUCCESS: 'gather_success',
  OBELISK_DISCOVERY_SIPHON: 'obelisk_discovery_siphon',
  OBELISK_DISCOVERY_OVERLOAD: 'obelisk_discovery_overload',
  OBELISK_LOOT: 'obelisk_loot',
  COMPENDIUM_DISCOVERY: 'compendium_discovery',
});

/**
 * @typedef {object} StatXpGrant
 * @property {string} stat
 * @property {number} amount
 * @property {string} [uniqueId]
 * @property {string} [source]
 */

/** @type {Readonly<Record<string, readonly StatXpGrant[]>>} */
export const SCHOLOMANCE_XP_GRANT_TABLE = Object.freeze({
  [SCHOLOMANCE_XP_ACTIONS.BASIC_ATTACK]: Object.freeze([
    { stat: 'BAPO', amount: 12, source: 'basic_attack' },
    { stat: 'VALCH', amount: 8, source: 'basic_attack' },
  ]),
  [SCHOLOMANCE_XP_ACTIONS.WEAVE_CAST_LEGAL]: Object.freeze([
    { stat: 'VALCH', amount: 22, source: 'weave_cast_legal' },
    { stat: 'KSYN', amount: 16, source: 'weave_cast_legal' },
    { stat: 'CINF', amount: 10, source: 'weave_cast_legal' },
  ]),
  [SCHOLOMANCE_XP_ACTIONS.WEAVE_CAST_FAILURE]: Object.freeze([
    { stat: 'DISCOVERY', amount: 10, source: 'weave_cast_failure' },
    { stat: 'KSYN', amount: 6, source: 'weave_cast_failure' },
  ]),
  [SCHOLOMANCE_XP_ACTIONS.GATHER_SUCCESS]: Object.freeze([
    { stat: 'DISCOVERY', amount: 18, source: 'gather_success' },
    { stat: 'CODEX', amount: 12, source: 'gather_success' },
  ]),
  [SCHOLOMANCE_XP_ACTIONS.OBELISK_DISCOVERY_SIPHON]: Object.freeze([
    { stat: 'MYTH', amount: 28, source: 'obelisk_discovery_siphon', uniqueId: 'xp:obelisk:siphon' },
    { stat: 'CODEX', amount: 22, source: 'obelisk_discovery_siphon', uniqueId: 'xp:obelisk:siphon' },
    { stat: 'SONIC', amount: 18, source: 'obelisk_discovery_siphon', uniqueId: 'xp:obelisk:siphon' },
  ]),
  [SCHOLOMANCE_XP_ACTIONS.OBELISK_DISCOVERY_OVERLOAD]: Object.freeze([
    { stat: 'MYTH', amount: 36, source: 'obelisk_discovery_overload', uniqueId: 'xp:obelisk:overload' },
    { stat: 'VALCH', amount: 24, source: 'obelisk_discovery_overload', uniqueId: 'xp:obelisk:overload' },
    { stat: 'CINF', amount: 18, source: 'obelisk_discovery_overload', uniqueId: 'xp:obelisk:overload' },
  ]),
  [SCHOLOMANCE_XP_ACTIONS.OBELISK_LOOT]: Object.freeze([
    { stat: 'DISCOVERY', amount: 32, source: 'obelisk_loot', uniqueId: 'xp:stormheart-orb' },
    { stat: 'MYTH', amount: 24, source: 'obelisk_loot', uniqueId: 'xp:stormheart-orb' },
  ]),
  [SCHOLOMANCE_XP_ACTIONS.COMPENDIUM_DISCOVERY]: Object.freeze([
    { stat: 'DISCOVERY', amount: 14, source: 'compendium_discovery' },
    { stat: 'CODEX', amount: 10, source: 'compendium_discovery' },
  ]),
});

const XP_CACHE = new Map([[1, 0]]);
let cachedRawTotal = 0;
let maxCachedLevel = 1;

function seedStatXpCache(maxLevel) {
  if (maxLevel <= maxCachedLevel) return;
  for (let level = maxCachedLevel + 1; level <= maxLevel; level++) {
    const l = level - 1;
    cachedRawTotal += Math.floor(l + 300 * Math.pow(2, l / 7));
    XP_CACHE.set(level, Math.floor(cachedRawTotal / (4 * STAT_XP_CONFIG.XP_DIVISOR)));
  }
  maxCachedLevel = maxLevel;
}

seedStatXpCache(STAT_XP_CONFIG.MAX_LEVEL + 1);

/**
 * @param {number} level
 * @returns {number}
 */
export function getStatXpForLevel(level) {
  if (level <= 1) return 0;
  if (XP_CACHE.has(level)) return XP_CACHE.get(level);
  seedStatXpCache(level);
  return XP_CACHE.get(level) || 0;
}

/**
 * @param {number} xp
 * @returns {number}
 */
export function getStatLevelFromXp(xp) {
  const totalXp = Math.max(0, Math.floor(Number(xp) || 0));
  let low = 1;
  let high = STAT_XP_CONFIG.MAX_LEVEL;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const xpAtMid = getStatXpForLevel(mid);
    const xpAtNext = getStatXpForLevel(mid + 1);

    if (totalXp >= xpAtMid && totalXp < xpAtNext) {
      return mid;
    }
    if (totalXp < xpAtMid) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return STAT_XP_CONFIG.MAX_LEVEL;
}

/**
 * @param {number} currentXp
 * @returns {{ level: number, nextLevel: number, xpForCurrent: number, xpForNext: number, progressPercent: number, remaining: number }}
 */
export function getStatLevelProgress(currentXp) {
  const level = getStatLevelFromXp(currentXp);
  const nextLevel = Math.min(level + 1, STAT_XP_CONFIG.MAX_LEVEL + 1);
  const xpForCurrent = getStatXpForLevel(level);
  const xpForNext = getStatXpForLevel(nextLevel);
  const earnedInLevel = currentXp - xpForCurrent;
  const totalInLevel = xpForNext - xpForCurrent;
  const remaining = Math.max(0, xpForNext - currentXp);
  const percent = totalInLevel > 0
    ? Math.min(100, Math.max(0, (earnedInLevel / totalInLevel) * 100))
    : 100;

  return {
    level,
    nextLevel,
    xpForCurrent,
    xpForNext,
    progressPercent: percent,
    remaining,
  };
}

/**
 * @param {import('./scholomance-stats.schema.js').ScholomanceStatDefinition|string} definitionOrKey
 * @param {number} level
 * @returns {number}
 */
export function statValueFromLevel(definitionOrKey, level) {
  const def = typeof definitionOrKey === 'string'
    ? getScholomanceStatDefinition(definitionOrKey)
    : definitionOrKey;
  if (!def) return 10;
  const lvl = Math.max(1, Math.min(STAT_XP_CONFIG.MAX_LEVEL, Math.round(Number(level) || 1)));
  return clampScholomanceStatValue(def.key, def.base + lvl - 1);
}

/**
 * @returns {Record<string, { xp: number, level: number }>}
 */
export function buildDefaultStatXpState() {
  return Object.fromEntries(
    SCHOLOMANCE_STAT_KEYS.map((key) => [key, { xp: 0, level: 1 }]),
  );
}

/**
 * @param {Record<string, { xp: number, level: number }>} stats
 * @returns {Record<string, number>}
 */
export function buildScholomanceBlockFromXpStats(stats) {
  const block = {};
  for (const def of SCHOLOMANCE_STATS) {
    const entry = stats?.[def.key];
    const level = entry?.level ?? 1;
    block[def.key] = statValueFromLevel(def, level);
  }
  return block;
}

/**
 * @param {string} action
 * @param {object} [context]
 * @returns {readonly StatXpGrant[]}
 */
export function resolveXpGrantsForAction(action, context = {}) {
  const table = SCHOLOMANCE_XP_GRANT_TABLE[action];
  if (!table) return Object.freeze([]);

  if (action === SCHOLOMANCE_XP_ACTIONS.OBELISK_LOOT && context.duplicate) {
    return Object.freeze([]);
  }

  return table;
}
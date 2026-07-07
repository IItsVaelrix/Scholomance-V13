/**
 * Scholomance per-attribute XP engine — game layer.
 */
export {
  STAT_XP_CONFIG,
  SCHOLOMANCE_XP_ACTIONS,
  SCHOLOMANCE_XP_GRANT_TABLE,
  getStatXpForLevel,
  getStatLevelFromXp,
  getStatLevelProgress,
  statValueFromLevel,
  buildDefaultStatXpState,
  buildScholomanceBlockFromXpStats,
  resolveXpGrantsForAction,
} from '../../../codex/core/scholomance-xp.schema.js';

import {
  SCHOLOMANCE_STAT_KEYS,
  getScholomanceStatDefinition,
} from '../../../codex/core/scholomance-stats.schema.js';
import {
  buildDefaultStatXpState,
  buildScholomanceBlockFromXpStats,
  getStatLevelFromXp,
  getStatLevelProgress,
} from '../../../codex/core/scholomance-xp.schema.js';

export const SCHOLOMANCE_XP_VERSION = 'scholomance-xp-v1';

/**
 * @typedef {object} ScholomanceXpState
 * @property {string} version
 * @property {Record<string, { xp: number, level: number }>} stats
 * @property {string[]} discoveryHistory
 */

/**
 * @param {Partial<ScholomanceXpState>|null|undefined} raw
 * @returns {ScholomanceXpState}
 */
export function normalizeScholomanceXpState(raw) {
  const stats = buildDefaultStatXpState();
  if (raw?.stats && typeof raw.stats === 'object') {
    for (const key of SCHOLOMANCE_STAT_KEYS) {
      const entry = raw.stats[key];
      if (!entry || typeof entry !== 'object') continue;
      const xp = Math.max(0, Math.floor(Number(entry.xp) || 0));
      stats[key] = { xp, level: getStatLevelFromXp(xp) };
    }
  }

  const discoveryHistory = Array.isArray(raw?.discoveryHistory)
    ? [...new Set(raw.discoveryHistory.map((id) => String(id)))]
    : [];

  return {
    version: SCHOLOMANCE_XP_VERSION,
    stats,
    discoveryHistory,
  };
}

/**
 * @param {ScholomanceXpState} state
 * @param {readonly import('../../../codex/core/scholomance-xp.schema.js').StatXpGrant[]} grants
 * @returns {{ state: ScholomanceXpState, applied: Array<{ stat: string, amount: number, source?: string }>, levelUps: Array<{ stat: string, level: number, previousLevel: number }> }}
 */
export function applyStatXpGrants(state, grants = []) {
  const next = normalizeScholomanceXpState(state);
  const applied = [];
  const levelUps = [];

  for (const grant of grants) {
    const stat = String(grant?.stat || '').toUpperCase();
    const amount = Math.max(0, Math.floor(Number(grant?.amount) || 0));
    if (!stat || amount === 0 || !next.stats[stat]) continue;

    if (grant.uniqueId) {
      const uniqueId = String(grant.uniqueId);
      if (next.discoveryHistory.includes(uniqueId)) continue;
      next.discoveryHistory.push(uniqueId);
    }

    const entry = next.stats[stat];
    const previousLevel = entry.level;
    entry.xp += amount;
    entry.level = getStatLevelFromXp(entry.xp);

    applied.push({ stat, amount, source: grant.source });

    if (entry.level > previousLevel) {
      levelUps.push({ stat, level: entry.level, previousLevel });
    }
  }

  return { state: next, applied, levelUps };
}

/**
 * @param {ScholomanceXpState} state
 * @returns {Array<{ key: string, abbrev: string, fullName: string, xp: number, level: number, value: number, progress: ReturnType<typeof getStatLevelProgress> }>}
 */
export function buildStatXpReadout(state) {
  const normalized = normalizeScholomanceXpState(state);
  return SCHOLOMANCE_STAT_KEYS.map((key) => {
    const def = getScholomanceStatDefinition(key);
    const entry = normalized.stats[key];
    const progress = getStatLevelProgress(entry.xp);
    return {
      key,
      abbrev: def?.abbrev || key,
      fullName: def?.fullName || key,
      xp: entry.xp,
      level: entry.level,
      value: buildScholomanceBlockFromXpStats(normalized.stats)[key],
      progress,
    };
  });
}

/**
 * Account XP bridge: scholomance gains feed the global progression bar.
 *
 * @param {readonly { amount: number }[]} applied
 * @returns {number}
 */
export function accountXpFromStatGrants(applied = []) {
  const total = applied.reduce((sum, grant) => sum + (grant.amount || 0), 0);
  return Math.max(0, Math.floor(total * 0.25));
}
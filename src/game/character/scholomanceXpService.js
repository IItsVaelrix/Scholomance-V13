/**
 * Scholomance XP persistence and combat sync.
 */
import { Storage } from '../../lib/platform/storage.js';
import {
  accountXpFromStatGrants,
  applyStatXpGrants,
  buildStatXpReadout,
  normalizeScholomanceXpState,
} from '../combat/scholomanceXp.js';
import {
  buildScholomanceBlockFromXpStats,
  resolveXpGrantsForAction,
} from '../../../codex/core/scholomance-xp.schema.js';
import { OBELISK_TUTORIAL_XP_UNIQUE_IDS } from '../../../codex/core/obelisk-puzzle.signals.js';

const STORAGE_KEY = 'scholomance.stat-xp.v1';

/** @type {import('../combat/scholomanceXp.js').ScholomanceXpState | null} */
let cachedState = null;

function ensureLoaded() {
  if (!cachedState) {
    try {
      const raw = Storage.getItem(STORAGE_KEY);
      cachedState = raw
        ? normalizeScholomanceXpState(JSON.parse(raw))
        : normalizeScholomanceXpState();
    } catch {
      cachedState = normalizeScholomanceXpState();
    }
  }
  return cachedState;
}

function persist(state = cachedState) {
  if (!state) return;
  Storage.setItem(STORAGE_KEY, JSON.stringify({
    version: state.version,
    stats: state.stats,
    discoveryHistory: state.discoveryHistory,
  }));
  emitScholomanceXpChanged(state);
}

function emitScholomanceXpChanged(state) {
  if (typeof window === 'undefined') return;
  const scholomance = buildScholomanceBlockFromXpStats(state.stats);
  const readout = buildStatXpReadout(state);
  window.dispatchEvent(new CustomEvent('scholomance-xp-changed', {
    detail: {
      state,
      readout,
      scholomance,
      levelUps: [],
      applied: [],
    },
  }));
  window.dispatchEvent(new CustomEvent('scholomance-stats-updated', {
    detail: { scholomance },
  }));
}

export function getScholomanceXpSnapshot() {
  const state = ensureLoaded();
  return {
    state: normalizeScholomanceXpState(state),
    readout: buildStatXpReadout(state),
    scholomance: getScholomanceCombatBlock(),
  };
}

export function getScholomanceCombatBlock() {
  const state = ensureLoaded();
  return buildScholomanceBlockFromXpStats(state.stats);
}

/**
 * @param {string} action
 * @param {object} [context]
 * @returns {{ applied: Array<{ stat: string, amount: number, source?: string }>, levelUps: Array<{ stat: string, level: number, previousLevel: number }>, accountXp: number, scholomance: Record<string, number> }}
 */
export function grantScholomanceXpForAction(action, context = {}) {
  const grants = resolveXpGrantsForAction(action, context);
  if (!grants.length) {
    return {
      applied: [],
      levelUps: [],
      accountXp: 0,
      scholomance: getScholomanceCombatBlock(),
    };
  }

  const state = ensureLoaded();
  const result = applyStatXpGrants(state, grants);
  cachedState = result.state;
  persist(cachedState);

  const accountXp = accountXpFromStatGrants(result.applied);
  const scholomance = buildScholomanceBlockFromXpStats(cachedState.stats);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('scholomance-xp-changed', {
      detail: {
        state: cachedState,
        readout: buildStatXpReadout(cachedState),
        scholomance,
        levelUps: result.levelUps,
        applied: result.applied,
        action,
        accountXp,
      },
    }));
    window.dispatchEvent(new CustomEvent('scholomance-stats-updated', {
      detail: { scholomance, levelUps: result.levelUps, action },
    }));
  }

  return {
    applied: result.applied,
    levelUps: result.levelUps,
    accountXp,
    scholomance,
  };
}

export function resetScholomanceXpForTests() {
  cachedState = null;
  Storage.removeItem(STORAGE_KEY);
}

const OBELISK_TUTORIAL_DISCOVERY_SET = new Set(OBELISK_TUTORIAL_XP_UNIQUE_IDS);

/** Allows obelisk discovery / loot XP to be earned again (dev session reset). */
export function clearObeliskTutorialXpDiscoveries() {
  const state = ensureLoaded();
  const next = normalizeScholomanceXpState(state);
  next.discoveryHistory = next.discoveryHistory.filter(
    (id) => !OBELISK_TUTORIAL_DISCOVERY_SET.has(id),
  );
  cachedState = next;
  persist(cachedState);
}
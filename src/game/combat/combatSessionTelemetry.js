/**
 * combatSessionTelemetry.js — pure combat session tracker for post-battle reports.
 *
 * Records moves, attacks, sentinel interactions, and XP-granting actions during
 * a combat arena session. No Phaser, no React, no DOM.
 */
import { SCHOLOMANCE_XP_GRANT_TABLE } from '../../../codex/core/scholomance-xp.schema.js';
import {
  SCHOLOMANCE_STAT_KEYS,
  getScholomanceStatDefinition,
} from '../../../codex/core/scholomance-stats.schema.js';
import { SENTINEL_ROBOTS } from './sentinelRobots.js';

export const COMBAT_GRADE_THRESHOLDS = Object.freeze([
  { grade: 'S', minScore: 90, label: 'Scholomancer Ascendant' },
  { grade: 'A', minScore: 75, label: 'Battle Poet' },
  { grade: 'B', minScore: 60, label: 'Lattice Adept' },
  { grade: 'C', minScore: 45, label: 'Apprentice Duelist' },
  { grade: 'D', minScore: 0, label: 'Survivor' },
]);

const COMBAT_HIGHLIGHT_STATS = Object.freeze(['BAPO', 'VALCH', 'SONIC']);

/**
 * @returns {import('./combatSessionTelemetry.js').CombatSessionTelemetry}
 */
export function createCombatSessionTelemetry() {
  const state = {
    tilesMoved: 0,
    turnsEnded: 0,
    playerAttacksLanded: 0,
    elementalAttacks: 0,
    damageDealt: 0,
    damageTaken: 0,
    sentinelsDefeated: 0,
    aggroEvents: 0,
    aggroSentinelCount: 0,
    xpActions: [],
    attackTargets: new Map(),
  };

  function recordMove() {
    state.tilesMoved += 1;
  }

  function recordTurnEnd() {
    state.turnsEnded += 1;
  }

  /**
   * @param {{ damage: number, targetId?: string, elemental?: boolean }} payload
   */
  function recordPlayerAttack({ damage = 0, targetId = null, elemental = false } = {}) {
    const dealt = Math.max(0, Math.round(Number(damage) || 0));
    state.playerAttacksLanded += 1;
    state.damageDealt += dealt;
    if (elemental) state.elementalAttacks += 1;
    if (targetId) {
      state.attackTargets.set(targetId, (state.attackTargets.get(targetId) || 0) + 1);
    }
  }

  /**
   * @param {{ sentinelId?: string, damage?: number }} payload
   */
  function recordSentinelHit({ sentinelId = null, damage = 0 } = {}) {
    state.damageTaken += Math.max(0, Math.round(Number(damage) || 0));
    if (sentinelId) {
      state.attackTargets.set(sentinelId, (state.attackTargets.get(sentinelId) || 0) + 1);
    }
  }

  function recordSentinelDefeated() {
    state.sentinelsDefeated += 1;
  }

  /**
   * @param {{ count?: number }} [payload]
   */
  function recordAggro({ count = 1 } = {}) {
    const n = Math.max(0, Math.round(Number(count) || 0));
    if (n === 0) return;
    state.aggroEvents += 1;
    state.aggroSentinelCount += n;
  }

  /**
   * @param {string} actionKey — key from SCHOLOMANCE_XP_GRANT_TABLE
   */
  function recordXpAction(actionKey) {
    if (!actionKey || !SCHOLOMANCE_XP_GRANT_TABLE[actionKey]) return;
    state.xpActions.push(String(actionKey));
  }

  function reset() {
    state.tilesMoved = 0;
    state.turnsEnded = 0;
    state.playerAttacksLanded = 0;
    state.elementalAttacks = 0;
    state.damageDealt = 0;
    state.damageTaken = 0;
    state.sentinelsDefeated = 0;
    state.aggroEvents = 0;
    state.aggroSentinelCount = 0;
    state.xpActions = [];
    state.attackTargets.clear();
  }

  function computeXpEarned() {
    const byStat = Object.fromEntries(SCHOLOMANCE_STAT_KEYS.map((key) => [key, 0]));
    let total = 0;

    for (const actionKey of state.xpActions) {
      const grants = SCHOLOMANCE_XP_GRANT_TABLE[actionKey] || [];
      for (const grant of grants) {
        const amount = Math.max(0, Math.round(Number(grant.amount) || 0));
        byStat[grant.stat] = (byStat[grant.stat] || 0) + amount;
        total += amount;
      }
    }

    const topStats = Object.entries(byStat)
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([stat, amount]) => ({
        stat,
        amount,
        label: getScholomanceStatDefinition(stat)?.fullName || stat,
      }));

    return { total, byStat, topStats };
  }

  /**
   * @param {object} metrics
   * @param {number} sentinelTotal
   * @returns {number}
   */
  function computeProwessScore(metrics, sentinelTotal) {
    let score = 42;
    score += Math.min(28, metrics.sentinelsDefeated * (28 / Math.max(1, sentinelTotal)));
    if (metrics.hpPercent >= 80) score += 12;
    else if (metrics.hpPercent >= 50) score += 6;
    else if (metrics.hpPercent < 25) score -= 8;

    score += Math.min(14, metrics.playerAttacksLanded * 2);
    score -= Math.floor(metrics.damageTaken / 8);
    score -= Math.max(0, metrics.turnsEnded - 6) * 2;
    if (metrics.elementalAttacks > 0) score += 4;
    if (metrics.aggroEvents > 0) score += 3;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * @param {number} prowessScore
   */
  function resolveGrade(prowessScore) {
    const match = COMBAT_GRADE_THRESHOLDS.find((entry) => prowessScore >= entry.minScore);
    return match || COMBAT_GRADE_THRESHOLDS[COMBAT_GRADE_THRESHOLDS.length - 1];
  }

  function buildScholomanceHighlights(scholomanceBlock = {}) {
    const entries = SCHOLOMANCE_STAT_KEYS.map((key) => ({
      key,
      value: Number(scholomanceBlock[key]) || 10,
      label: getScholomanceStatDefinition(key)?.abbrev || key,
      fullName: getScholomanceStatDefinition(key)?.fullName || key,
      combatRelevant: COMBAT_HIGHLIGHT_STATS.includes(key),
    }));

    const combatStats = entries
      .filter((entry) => entry.combatRelevant)
      .sort((a, b) => b.value - a.value);

    const topOverall = [...entries]
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);

    return { combatStats, topOverall };
  }

  function buildMeritTags(metrics) {
    const tags = [];
    if (metrics.sentinelsDefeated >= SENTINEL_ROBOTS.length) {
      tags.push('Flank Cleared');
    }
    if (metrics.damageTaken === 0 && metrics.playerAttacksLanded > 0) {
      tags.push('Untouched');
    } else if (metrics.hpPercent >= 75) {
      tags.push('Resilient');
    }
    if (metrics.elementalAttacks > 0) {
      tags.push('Enchanted Strikes');
    }
    if (metrics.aggroEvents > 0) {
      tags.push('Tower Threat');
    }
    if (metrics.turnsEnded <= 4 && metrics.sentinelsDefeated >= SENTINEL_ROBOTS.length) {
      tags.push('Swift Lattice');
    }
    if (metrics.playerAttacksLanded >= 4) {
      tags.push('Relentless');
    }
    return tags.slice(0, 4);
  }

  /**
   * @param {object} [options]
   * @param {object|null} [options.playerEntity]
   * @param {number} [options.sentinelTotal]
   * @returns {CombatVictoryReport}
   */
  function buildReport({ playerEntity = null, sentinelTotal = SENTINEL_ROBOTS.length } = {}) {
    const hpRemaining = Math.max(0, Math.round(Number(playerEntity?.hp) || 0));
    const maxHp = Math.max(1, Math.round(Number(playerEntity?.maxHp) || 100));
    const hpPercent = Math.round((hpRemaining / maxHp) * 100);
    const scholomance = playerEntity?.scholomance
      ? { ...playerEntity.scholomance }
      : null;

    const metrics = {
      tilesMoved: state.tilesMoved,
      turnsEnded: state.turnsEnded,
      playerAttacksLanded: state.playerAttacksLanded,
      elementalAttacks: state.elementalAttacks,
      damageDealt: state.damageDealt,
      damageTaken: state.damageTaken,
      sentinelsDefeated: state.sentinelsDefeated,
      sentinelTotal,
      aggroEvents: state.aggroEvents,
      aggroSentinelCount: state.aggroSentinelCount,
      hpRemaining,
      maxHp,
      hpPercent,
    };

    const prowessScore = computeProwessScore(metrics, sentinelTotal);
    const grade = resolveGrade(prowessScore);
    const xpEarned = computeXpEarned();
    const scholomanceHighlights = buildScholomanceHighlights(scholomance || {});
    const meritTags = buildMeritTags(metrics);

    return {
      version: 'combat-victory-report-v1',
      grade: grade.grade,
      gradeLabel: grade.label,
      prowessScore,
      summary: `Defeated ${metrics.sentinelsDefeated}/${sentinelTotal} flank sentinels with ${hpRemaining} HP remaining.`,
      metrics,
      vitals: {
        hpRemaining,
        maxHp,
        hpPercent,
      },
      tactical: {
        movementPoints: playerEntity?.movementPoints ?? null,
        movementPointsRemaining: playerEntity?.movementPointsRemaining ?? null,
        attackPoints: playerEntity?.attackPoints ?? null,
        attackRange: playerEntity?.attackRange ?? null,
      },
      scholomance,
      scholomanceHighlights,
      xpEarned,
      meritTags,
      generatedAt: Date.now(),
    };
  }

  function getSnapshot() {
    return {
      tilesMoved: state.tilesMoved,
      turnsEnded: state.turnsEnded,
      playerAttacksLanded: state.playerAttacksLanded,
      elementalAttacks: state.elementalAttacks,
      damageDealt: state.damageDealt,
      damageTaken: state.damageTaken,
      sentinelsDefeated: state.sentinelsDefeated,
      aggroEvents: state.aggroEvents,
      aggroSentinelCount: state.aggroSentinelCount,
      xpActionCount: state.xpActions.length,
    };
  }

  return {
    recordMove,
    recordTurnEnd,
    recordPlayerAttack,
    recordSentinelHit,
    recordSentinelDefeated,
    recordAggro,
    recordXpAction,
    reset,
    buildReport,
    getSnapshot,
  };
}

/**
 * @typedef {object} CombatVictoryReport
 * @property {string} version
 * @property {string} grade
 * @property {string} gradeLabel
 * @property {number} prowessScore
 * @property {string} summary
 * @property {object} metrics
 * @property {object} vitals
 * @property {object} tactical
 * @property {Record<string, number>|null} scholomance
 * @property {object} scholomanceHighlights
 * @property {object} xpEarned
 * @property {string[]} meritTags
 * @property {number} generatedAt
 */

/**
 * @typedef {ReturnType<typeof createCombatSessionTelemetry>} CombatSessionTelemetry
 */
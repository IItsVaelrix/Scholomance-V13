/**
 * Monster INT — tactical cognition stat governing ability picks, alert rolls,
 * counter selection, and repositioning.
 */

import { findPath } from './combatPathfinding.js';
import { readScholomanceStat } from './scholomanceStats.js';

const SENTINEL_MATRIX_BURN_CHAIN = 'sentinel_matrix_burn';

export const INTELLIGENCE_STAT_KEY = 'intelligence';

export const INTELLIGENCE_TIERS = Object.freeze({
  BRUTE: 'brute',
  TRAINED: 'trained',
  TACTICAL: 'tactical',
  MASTERMIND: 'mastermind',
});

/** Base turns a sentinel must survive after a player cast before ML fires. */
export const BASE_ML_SURVIVAL_TURNS = 2;

const TIER_THRESHOLDS = Object.freeze([
  { min: 75, tier: INTELLIGENCE_TIERS.MASTERMIND },
  { min: 50, tier: INTELLIGENCE_TIERS.TACTICAL },
  { min: 25, tier: INTELLIGENCE_TIERS.TRAINED },
  { min: 0, tier: INTELLIGENCE_TIERS.BRUTE },
]);

/**
 * @param {number|null|undefined} value
 * @param {number} [fallback=10]
 * @returns {number}
 */
export function clampIntelligence(value, fallback = 10) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * @param {object|null|undefined} entity
 * @param {number} [fallback=10]
 * @returns {number}
 */
export function readEntityIntelligence(entity, fallback = 10) {
  return clampIntelligence(entity?.[INTELLIGENCE_STAT_KEY], fallback);
}

/**
 * @param {number} intelligence
 * @returns {string}
 */
export function getIntelligenceTier(intelligence) {
  const int = clampIntelligence(intelligence);
  return TIER_THRESHOLDS.find((entry) => int >= entry.min)?.tier || INTELLIGENCE_TIERS.BRUTE;
}

/**
 * Alert proc chance scales with INT (10 → ~22%, 50 → 50%, 100 → 85%).
 *
 * @param {number} intelligence
 * @returns {number}
 */
export function computeAlertProcChance(intelligence) {
  const int = clampIntelligence(intelligence);
  return Math.min(0.9, Math.max(0.15, 0.15 + int * 0.007));
}

/**
 * Player CODEX / KSYN extend how long sentinels need to study a pattern before ML.
 *
 * @param {Record<string, number>|null|undefined} scholomanceBlock
 * @returns {number}
 */
export function computeMachineLearningSurvivalTurns(scholomanceBlock) {
  const codex = readScholomanceStat(scholomanceBlock, 'CODEX');
  const ksyn = readScholomanceStat(scholomanceBlock, 'KSYN');
  const codexBonus = Math.floor(Math.max(0, codex - 10) / 15);
  const ksynBonus = Math.floor(Math.max(0, ksyn - 10) / 20);
  return BASE_ML_SURVIVAL_TURNS + codexBonus + ksynBonus;
}

/**
 * @param {import('./combatStatController.js').CombatStatController|null|undefined} stats
 * @returns {boolean}
 */
export function playerHasMatrixBurn(stats) {
  const player = stats?.getEntity?.('player');
  if (!player?.statuses?.length) return false;
  return player.statuses.some((entry) => entry.chainId === SENTINEL_MATRIX_BURN_CHAIN);
}

/**
 * Pick the best counter from observed player patterns vs sentinel resist list.
 *
 * @param {string[]} observed
 * @param {string[]} resistList
 * @returns {string|null}
 */
export function pickBestObservedCounter(observed = [], resistList = []) {
  if (!observed.length || !resistList.length) return null;

  const counts = Object.create(null);
  for (const entry of observed) {
    counts[entry] = (counts[entry] || 0) + 1;
  }

  let best = null;
  let bestScore = -1;
  for (const resist of resistList) {
    const score = counts[resist] || 0;
    if (score > bestScore) {
      bestScore = score;
      best = resist;
    }
  }

  if (best) return best;
  return resistList.find((entry) => observed.includes(entry)) || null;
}

/**
 * @param {object} params
 * @param {string[]} params.resistFamilies
 * @param {string[]} params.resistSyntax
 * @param {string[]} params.observedFamilies
 * @param {string[]} params.observedSyntax
 * @param {string} params.tier
 */
export function pickIntelligentCounter({
  resistFamilies = [],
  resistSyntax = [],
  observedFamilies = [],
  observedSyntax = [],
  tier = INTELLIGENCE_TIERS.TRAINED,
} = {}) {
  const useSmartPick = tier === INTELLIGENCE_TIERS.TACTICAL || tier === INTELLIGENCE_TIERS.MASTERMIND;

  const counterFamily = useSmartPick
    ? pickBestObservedCounter(observedFamilies, resistFamilies)
    : resistFamilies.find((family) => observedFamilies.includes(family));

  const counterSyntax = useSmartPick
    ? pickBestObservedCounter(observedSyntax, resistSyntax)
    : resistSyntax.find((shape) => observedSyntax.includes(shape));

  return {
    counterFamily: counterFamily || resistFamilies[0] || 'RESONANCE',
    counterSyntax: counterSyntax || resistSyntax[0] || 'LITANY',
  };
}

/**
 * @param {object} params
 */
function scoreBurnCandidate({ int, tier, playerHasBurn, playerHpRatio }) {
  let burnScore = 48 + int * 0.12;
  let withheldReason = null;

  if (playerHasBurn) {
    burnScore -= 20 + int * 0.35;
    if (tier === INTELLIGENCE_TIERS.TACTICAL || tier === INTELLIGENCE_TIERS.MASTERMIND) {
      withheldReason = 'burn_already_ignited';
    }
  }
  if (tier === INTELLIGENCE_TIERS.MASTERMIND && playerHpRatio < 0.35) {
    burnScore -= 24;
    if (burnScore <= 0 || burnScore < 36) {
      withheldReason = withheldReason || 'finisher_prioritized';
    }
  }

  return { burnScore, withheldReason };
}

/**
 * Explain why a tactical+ sentinel chose one ability over another.
 *
 * @param {object} params
 * @returns {string[]}
 */
export function buildSentinelAbilityReasoning({
  shortLabel = 'Sentinel',
  tier,
  selection,
  abilities = {},
  mlReady = false,
  burnAvailable = false,
  playerHasBurn = false,
  playerHpRatio = 1,
  mlSurvivalRequired = BASE_ML_SURVIVAL_TURNS,
  playerCodex = 10,
  playerKsyn = 10,
} = {}) {
  const lines = [];
  const label = shortLabel;

  if (
    burnAvailable
    && !selection.applyBurn
    && playerHasBurn
    && (tier === INTELLIGENCE_TIERS.TACTICAL || tier === INTELLIGENCE_TIERS.MASTERMIND)
  ) {
    lines.push(`[SENTINEL] ${label} — Burn withheld: target already ignited.`);
  }

  if (
    burnAvailable
    && !selection.applyBurn
    && tier === INTELLIGENCE_TIERS.MASTERMIND
    && playerHpRatio < 0.35
    && selection.abilityId !== 'burn'
  ) {
    lines.push(`[SENTINEL] ${label} — Burn withheld: finisher strike prioritized.`);
  }

  if (
    !mlReady
    && Number.isFinite(abilities.turnsSincePlayerCast)
    && abilities.turnsSincePlayerCast > 0
    && (abilities.observedFamilies?.length || abilities.observedSyntax?.length)
    && mlSurvivalRequired > BASE_ML_SURVIVAL_TURNS
  ) {
    lines.push(
      `[SENTINEL] ${label} — Pattern lock extended: CODEX ${playerCodex} / KSYN ${playerKsyn} `
      + `delayed Machine Learning (${abilities.turnsSincePlayerCast}/${mlSurvivalRequired} turns).`,
    );
  }

  if (mlReady && selection.abilityId === 'machine_learning') {
    lines.push(`[SENTINEL] ${label} — Machine Learning authorized after ${mlSurvivalRequired}-turn pattern study.`);
  }

  if (
    selection.abilityId === 'fireball'
    && tier === INTELLIGENCE_TIERS.MASTERMIND
    && playerHpRatio < 0.4
    && burnAvailable
    && !selection.applyBurn
  ) {
    lines.push(`[SENTINEL] ${label} — Direct strike chosen over setup — target integrity critical.`);
  }

  return lines;
}

/**
 * Score and select the best sentinel ability for the current battlefield read.
 *
 * @param {object} params
 * @param {object} params.abilities
 * @param {boolean} params.mlReady
 * @param {boolean} params.playerHasBurn
 * @param {boolean} params.mentalLinkActive
 * @param {number} params.intelligence
 * @param {number|null|undefined} [params.playerHpRatio]
 * @param {() => number} [params.rng]
 * @returns {{ abilityId: string, applyBurn: boolean, score: number, tier: string, withheldReason?: string|null }}
 */
export function selectSentinelAbilityByIntelligence({
  abilities,
  mlReady,
  playerHasBurn,
  mentalLinkActive,
  intelligence,
  playerHpRatio = 1,
  rng = Math.random,
} = {}) {
  const int = clampIntelligence(intelligence);
  const tier = getIntelligenceTier(int);
  const burnAvailable = abilities.burnCooldown <= 0;

  if (tier === INTELLIGENCE_TIERS.BRUTE) {
    const roll = rng();
    if (mlReady && roll < 0.22) {
      return { abilityId: 'machine_learning', applyBurn: false, score: 22, tier };
    }
    if (burnAvailable && roll < 0.58) {
      return { abilityId: 'burn', applyBurn: true, score: 58, tier };
    }
    return { abilityId: 'fireball', applyBurn: false, score: 40, tier };
  }

  if (tier === INTELLIGENCE_TIERS.TRAINED) {
    if (mlReady) return { abilityId: 'machine_learning', applyBurn: false, score: 90, tier };
    if (burnAvailable) return { abilityId: 'burn', applyBurn: true, score: 70, tier };
    return { abilityId: 'fireball', applyBurn: false, score: 50, tier };
  }

  const candidates = [];
  let withheldReason = null;

  if (mlReady) {
    let mlScore = 72 + int * 0.28;
    if (abilities.observedFamilies?.length) mlScore += 12;
    if (abilities.observedSyntax?.length) mlScore += 8;
    candidates.push({ abilityId: 'machine_learning', applyBurn: false, score: mlScore });
  }

  if (burnAvailable) {
    const { burnScore, withheldReason: burnReason } = scoreBurnCandidate({
      int,
      tier,
      playerHasBurn,
      playerHpRatio,
    });
    if (burnReason) withheldReason = burnReason;
    if (burnScore > 0) {
      candidates.push({ abilityId: 'burn', applyBurn: true, score: burnScore });
    }
  }

  let fireballScore = 36 + (mentalLinkActive ? 14 : 0);
  if (tier === INTELLIGENCE_TIERS.MASTERMIND && playerHpRatio < 0.4) fireballScore += 18;
  candidates.push({ abilityId: 'fireball', applyBurn: false, score: fireballScore });

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] || { abilityId: 'fireball', applyBurn: false, score: 36 };
  return { ...best, tier, withheldReason };
}

/**
 * High-INT sentinels close distance before casting when out of attack range.
 *
 * @param {object} params
 * @param {string} params.sentinelId
 * @param {import('./combatStatController.js').CombatStatController} params.stats
 * @param {Set<string>|import('./combatPathfinding.js').buildBlockedSet} [params.blocked]
 * @param {number} [params.intelligence]
 * @returns {{ tx: number, ty: number }[]}
 */
export function planSentinelReposition({ sentinelId, stats, blocked, intelligence } = {}) {
  const sentinel = stats?.getEntity?.(sentinelId);
  const player = stats?.getEntity?.('player');
  const int = clampIntelligence(intelligence ?? sentinel?.[INTELLIGENCE_STAT_KEY]);
  if (int < 40 || !sentinel || !player) return [];

  if (stats.isInAttackRange(sentinelId, 'player')) return [];

  const start = sentinel.position || { tx: 0, ty: 0 };
  const goal = player.position || { tx: 0, ty: 0 };
  const path = findPath(start, goal, blocked);
  if (!path.length) return [];

  const maxSteps = Math.max(0, Math.floor(sentinel.movementPointsRemaining || 0));
  if (maxSteps === 0) return [];

  const steps = Math.min(path.length, maxSteps, int >= 75 ? maxSteps : 1);
  return path.slice(0, steps);
}
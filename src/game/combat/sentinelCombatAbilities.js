/**
 * Brazier sentinel combat abilities — debuffs, link buffs, alert, and ML counters.
 */

import { SYNTACTIC_ARCHETYPE_PROFILES } from '../../../codex/core/combat.syntax-chess.js';
import {
  buildSentinelAbilityReasoning,
  computeAlertProcChance,
  computeMachineLearningSurvivalTurns,
  getIntelligenceTier,
  INTELLIGENCE_TIERS,
  pickIntelligentCounter,
  playerHasMatrixBurn,
  readEntityIntelligence,
  selectSentinelAbilityByIntelligence,
} from './combatIntelligence.js';
import { computeBasicAttackDamage, readScholomanceStat } from './scholomanceStats.js';
import { GUARD_DAMAGE_MULTIPLIER } from './combatStats.js';

export const SENTINEL_BURN_DEBUFF = Object.freeze({
  chainId: 'sentinel_matrix_burn',
  damagePerTurn: 10,
  turns: 4,
  disposition: 'DEBUFF',
  cooldownTurns: 5,
});

export const SENTINEL_ALERT_DURATION_TURNS = 2;
export const SENTINEL_ML_SURVIVAL_TURNS = 2;
export const SENTINEL_MENTAL_LINK_MULTIPLIER = 1.25;
export const SENTINEL_ALERT_DAMAGE_MULTIPLIER = 2;
/** Baseline alert proc at INT 50 — see computeAlertProcChance for scaling. */
export const SENTINEL_ALERT_PROC_CHANCE = 0.5;

const SENTINEL_PROFILE = SYNTACTIC_ARCHETYPE_PROFILES.SENTINEL_BRAZIER_BASE;

/** @typedef {'burn' | 'fireball' | 'machine_learning' | 'alert_strike'} SentinelAbilityId */

/**
 * @returns {object}
 */
export function createSentinelAbilityState() {
  return {
    burnCooldown: 0,
    alertActive: false,
    alertTurnsRemaining: 0,
    turnsSincePlayerCast: null,
    observedFamilies: [],
    observedSyntax: [],
    lastPlayerWeave: null,
  };
}

/**
 * @param {Array<object>} sentinels
 * @param {string} sentinelId
 */
export function countSentinelWifiLinks(sentinels, sentinelId) {
  return (sentinels || []).filter((entry) => (
    entry.id !== sentinelId
    && !entry.defeated
    && entry.aggroed
  )).length;
}

/**
 * @param {object} castDetail
 */
export function extractPlayerCastSignatures(castDetail = {}) {
  const chess = castDetail?.syntacticalChess || castDetail?.scoreData?.syntacticalChess || null;
  return {
    families: [...(chess?.matchedWeaknessFamilies || chess?.weaknessFamilies || [])],
    syntax: [...(chess?.matchedSyntaxWeaknesses || chess?.syntaxWeaknesses || [])],
    weave: castDetail?.weave || null,
  };
}

/**
 * @param {Array<object>} sentinels
 * @param {object} castDetail
 */
export function notePlayerSpellCastOnSentinels(sentinels, castDetail = {}) {
  const signatures = extractPlayerCastSignatures(castDetail);
  for (const record of sentinels || []) {
    if (!record.abilities || record.defeated || !record.aggroed) continue;
    record.abilities.turnsSincePlayerCast = 0;
    if (signatures.families.length) record.abilities.observedFamilies = signatures.families;
    if (signatures.syntax.length) record.abilities.observedSyntax = signatures.syntax;
    if (signatures.weave) record.abilities.lastPlayerWeave = signatures.weave;
  }
}

/**
 * @param {Array<object>} sentinels
 */
export function tickSentinelAbilityState(sentinels = []) {
  for (const record of sentinels) {
    if (!record.abilities || record.defeated) continue;
    if (record.abilities.burnCooldown > 0) record.abilities.burnCooldown -= 1;
    if (record.abilities.alertTurnsRemaining > 0) {
      record.abilities.alertTurnsRemaining -= 1;
      if (record.abilities.alertTurnsRemaining <= 0) {
        record.abilities.alertActive = false;
      }
    }
    if (Number.isFinite(record.abilities.turnsSincePlayerCast)) {
      record.abilities.turnsSincePlayerCast += 1;
    }
  }
}

/**
 * Pick a counter the sentinel "learned" from the player's successful patterns.
 *
 * @param {object} abilities
 */
export function pickMachineLearningCounter(abilities = {}, { intelligence = 50 } = {}) {
  const tier = getIntelligenceTier(intelligence);
  const { counterFamily, counterSyntax } = pickIntelligentCounter({
    resistFamilies: SENTINEL_PROFILE.resistanceFamilies || [],
    resistSyntax: SENTINEL_PROFILE.syntaxResistances || [],
    observedFamilies: abilities.observedFamilies || [],
    observedSyntax: abilities.observedSyntax || [],
    tier,
  });

  return {
    counterFamily,
    counterSyntax,
    counsel: `Mirror counter deployed — press ${counterFamily} with ${counterSyntax} form.`,
  };
}

/**
 * @param {object} params
 * @param {object} params.record
 * @param {Array<object>} params.sentinels
 * @param {() => number} [params.rng]
 */
export function planSentinelAttack({
  record,
  sentinels,
  stats = null,
  intelligence = null,
  stance = 'AGGRESSIVE',
  rng = Math.random,
} = {}) {
  const abilities = record?.abilities || createSentinelAbilityState();
  const entity = stats?.getEntity?.(record?.id);
  const int = readEntityIntelligence(
    intelligence != null ? { intelligence } : entity,
    10,
  );
  const tier = getIntelligenceTier(int);
  const wifiPeers = countSentinelWifiLinks(sentinels, record.id);
  const mentalLinkActive = wifiPeers > 0;

  const playerEntity = stats?.getEntity?.('player');
  const playerHpRatio = playerEntity?.maxHp > 0
    ? (playerEntity.hp ?? 0) / playerEntity.maxHp
    : 1;
  const playerCodex = readScholomanceStat(playerEntity?.scholomance, 'CODEX');
  const playerKsyn = readScholomanceStat(playerEntity?.scholomance, 'KSYN');
  const mlSurvivalRequired = computeMachineLearningSurvivalTurns(playerEntity?.scholomance);

  const mlReady = Number.isFinite(abilities.turnsSincePlayerCast)
    && abilities.turnsSincePlayerCast >= mlSurvivalRequired
    && (abilities.observedFamilies.length > 0 || abilities.observedSyntax.length > 0);

  const burnAvailable = abilities.burnCooldown <= 0;

  const selection = selectSentinelAbilityByIntelligence({
    abilities,
    mlReady,
    playerHasBurn: playerHasMatrixBurn(stats),
    mentalLinkActive,
    intelligence: int,
    playerHpRatio,
    rng,
  });

  let abilityId = /** @type {SentinelAbilityId} */ (selection.abilityId);
  let applyBurn = selection.applyBurn;
  let machineLearning = null;

  if (abilityId === 'burn' && applyBurn && stance !== 'AGGRESSIVE') {
    abilityId = 'fireball';
    applyBurn = false;
  }

  if (abilityId === 'machine_learning') {
    machineLearning = pickMachineLearningCounter(abilities, { intelligence: int });
    abilities.turnsSincePlayerCast = null;
  } else if (applyBurn) {
    abilities.burnCooldown = SENTINEL_BURN_DEBUFF.cooldownTurns;
  }

  const alertProcChance = computeAlertProcChance(int);
  const alertRollSucceeded = abilities.alertActive || rng() < alertProcChance;
  if (alertRollSucceeded) {
    abilities.alertActive = true;
    abilities.alertTurnsRemaining = SENTINEL_ALERT_DURATION_TURNS;
    if (abilityId === 'fireball') abilityId = 'alert_strike';
  }

  const damageMultiplier = (mentalLinkActive ? SENTINEL_MENTAL_LINK_MULTIPLIER : 1)
    * (abilities.alertActive ? SENTINEL_ALERT_DAMAGE_MULTIPLIER : 1);

  const logLines = buildSentinelAbilityReasoning({
    shortLabel: record.shortLabel || record.id,
    tier,
    selection,
    abilities,
    mlReady,
    burnAvailable,
    playerHasBurn: playerHasMatrixBurn(stats),
    playerHpRatio,
    mlSurvivalRequired,
    playerCodex,
    playerKsyn,
  });

  if (tier !== INTELLIGENCE_TIERS.BRUTE) {
    logLines.unshift(`[SENTINEL] ${record.shortLabel || record.id} INT ${int} (${tier}) — tactical read engaged.`);
  }
  if (mentalLinkActive) {
    logLines.push(`[SENTINEL] ${record.shortLabel || record.id} WiFi-linked (+25% damage).`);
  }
  if (abilities.alertActive && alertRollSucceeded) {
    logLines.push(`[SENTINEL] Sentinel Alert — attacks cannot miss and deal double damage.`);
  }
  if (applyBurn) {
    logLines.push(`[SENTINEL] Matrix Burn applied (+10 damage per turn for 4 turns).`);
  }
  if (machineLearning) {
    logLines.push(`[SENTINEL] Machine Learning: ${machineLearning.counsel}`);
  }

  return {
    abilityId,
    applyBurn,
    machineLearning,
    mentalLinkActive,
    wifiPeers,
    alertActive: abilities.alertActive,
    alertRollSucceeded,
    guaranteedHit: abilities.alertActive,
    damageMultiplier,
    intelligence: int,
    intelligenceTier: tier,
    mlSurvivalRequired,
    playerCodex,
    playerKsyn,
    logLines,
    abilities,
  };
}

/**
 * @param {import('./combatStatController.js').CombatStatController} stats
 * @param {string} sentinelId
 * @param {string} targetId
 * @param {object} plan
 */
export function resolveSentinelAbilityDamage(stats, sentinelId, targetId, plan = {}) {
  const attacker = stats?.getEntity(sentinelId);
  const target = stats?.getEntity(targetId);
  if (!attacker || !target) return null;

  const inRange = stats.isInAttackRange(sentinelId, targetId);
  if (!plan.guaranteedHit && !inRange) return { hit: false, reason: 'out_of_range' };

  const baseDamage = computeBasicAttackDamage(attacker.scholomance);
  const boosted = Math.max(1, Math.round(baseDamage * (plan.damageMultiplier || 1)));
  const damage = target.guarding
    ? Math.max(1, Math.round(boosted * GUARD_DAMAGE_MULTIPLIER))
    : boosted;
  const targetHp = Math.max(0, (target.hp ?? 0) - damage);
  target.hp = targetHp;

  if (attacker.attackPointsRemaining >= 3) {
    attacker.attackPointsRemaining -= 3;
    attacker.attackUsed = attacker.attackPointsRemaining < 3;
  }

  return {
    hit: true,
    damage,
    targetHp,
    targetDefeated: targetHp <= 0,
    abilityId: plan.abilityId,
  };
}

/**
 * @param {import('./combatStatController.js').CombatStatController} stats
 * @param {object} plan
 */
export function applySentinelBurnDebuff(stats, plan = {}) {
  if (!plan.applyBurn || !stats) return null;
  return stats.applyStatus('player', {
    chainId: SENTINEL_BURN_DEBUFF.chainId,
    damagePerTurn: SENTINEL_BURN_DEBUFF.damagePerTurn,
    turns: SENTINEL_BURN_DEBUFF.turns,
    disposition: SENTINEL_BURN_DEBUFF.disposition,
  });
}

/**
 * @param {import('./combatStatController.js').CombatStatController} stats
 */
export function tickPlayerCombatStatuses(stats) {
  if (!stats) return [];
  return stats.tickStatuses('player');
}
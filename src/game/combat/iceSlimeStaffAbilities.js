import { BASIC_ATTACK_AP_COST } from './combatStats.js';
import { getEffectiveScholomance, readScholomanceStat } from './scholomanceStats.js';
import { applyVoidAcolyteHitDamage } from './voidAcolyteCombatAbilities.js';

export const ICICLE_SLAM_ABILITY_ID = 'icicle_slam';

export const ICICLE_SLAM_RANGE = 8;
export const ICICLE_SLAM_MIN_RANGE = 2;
export const ICICLE_SLAM_COOLDOWN_TURNS = 3;
export const ICICLE_SLAM_HIT_COUNT = 3;
export const ICICLE_SLAM_AP_COST = 4;
export const ICICLE_SLAM_BASE_DAMAGE_PER_HIT = 8;

export function computeIcicleSlamDamagePerHit(scholomanceBlock) {
  const valch = readScholomanceStat(scholomanceBlock, 'VALCH');
  const valchBonus = Math.max(0, Math.floor((valch - 10) / 2));
  return ICICLE_SLAM_BASE_DAMAGE_PER_HIT + valchBonus;
}

export function playerHasIcicleSlam(entity) {
  return Array.isArray(entity?.grantedAbilities)
    && entity.grantedAbilities.includes(ICICLE_SLAM_ABILITY_ID);
}

export function canPlayerCastIcicleSlam(stats, attackerId, targetId) {
  const attacker = stats?.getEntity(attackerId);
  const target = stats?.getEntity(targetId);
  if (!attacker || !target) return false;
  if (!playerHasIcicleSlam(attacker)) return false;
  if ((attacker.icicleSlamCooldown ?? 0) > 0) return false;
  if (attacker.attackPointsRemaining < ICICLE_SLAM_AP_COST) return false;
  if (target.hp !== null && target.hp <= 0) return false;
  const dist = stats.manhattan(attackerId, targetId);
  return dist >= ICICLE_SLAM_MIN_RANGE && dist <= ICICLE_SLAM_RANGE;
}

/**
 * @param {import('./combatStatController.js').CombatStatController} stats
 */
export function resolvePlayerIcicleSlam(stats, attackerId, targetId) {
  if (!canPlayerCastIcicleSlam(stats, attackerId, targetId)) return null;

  const attacker = stats.getEntity(attackerId);
  const scholomance = getEffectiveScholomance(attacker);
  const damagePerHit = computeIcicleSlamDamagePerHit(scholomance);

  attacker.attackPointsRemaining -= ICICLE_SLAM_AP_COST;
  attacker.attackUsed = attacker.attackPointsRemaining < BASIC_ATTACK_AP_COST;
  attacker.icicleSlamCooldown = ICICLE_SLAM_COOLDOWN_TURNS;

  return {
    abilityId: ICICLE_SLAM_ABILITY_ID,
    staged: true,
    hitCount: ICICLE_SLAM_HIT_COUNT,
    damagePerHit,
    totalDamage: damagePerHit * ICICLE_SLAM_HIT_COUNT,
    apSpent: ICICLE_SLAM_AP_COST,
    attackPointsRemaining: attacker.attackPointsRemaining,
  };
}

/**
 * @param {import('./combatStatController.js').CombatStatController} stats
 */
export function applyPlayerIcicleSlamHit(stats, targetId, damagePerHit) {
  return applyVoidAcolyteHitDamage(stats, targetId, damagePerHit);
}
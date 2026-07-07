/**
 * Void Acolyte mini-boss abilities — VOID gravity/lash/execution + ice Icicle Blast.
 */

import { manhattan } from './combatPathfinding.js';
import { BASIC_ATTACK_AP_COST, GUARD_DAMAGE_MULTIPLIER } from './combatStats.js';
import { computeBasicAttackDamage } from './scholomanceStats.js';

/** Full arena lane — duel layout is 8 tiles (e.g. player 4,8 vs boss 4,0). */
export const VOID_GRAVITY_RANGE = 8;
export const VOID_GRAVITY_COOLDOWN_TURNS = 4;
export const VOID_GRAVITY_LOCK_TURNS = 3;
export const VOID_LASH_DAMAGE = 12;
export const VOID_EXECUTION_DAMAGE = 40;
export const VOID_EXECUTION_AP_COST = 5;

export const ICICLE_BLAST_RANGE = 8;
export const ICICLE_BLAST_MIN_RANGE = 2;
export const ICICLE_BLAST_COOLDOWN_TURNS = 3;
export const ICICLE_BLAST_HIT_COUNT = 3;
export const ICICLE_BLAST_DAMAGE_PER_HIT = 9;
export const ICICLE_BLAST_AP_COST = 4;

/** @typedef {'void_gravity' | 'void_lash' | 'void_execution' | 'icicle_blast' | 'basic'} VoidAcolyteAbilityId */

export function createVoidAcolyteAbilityState() {
  return { gravityCooldown: 0, icicleCooldown: 0 };
}

export function tickVoidAcolyteAbilityState(record) {
  if (!record?.abilities) return;
  if (record.abilities.gravityCooldown > 0) record.abilities.gravityCooldown -= 1;
  if (record.abilities.icicleCooldown > 0) record.abilities.icicleCooldown -= 1;
}

function spendAp(attacker, cost) {
  if (!attacker || attacker.attackPointsRemaining < cost) return false;
  attacker.attackPointsRemaining -= cost;
  attacker.attackUsed = attacker.attackPointsRemaining < BASIC_ATTACK_AP_COST;
  return true;
}

export function applyVoidAcolyteHitDamage(stats, targetId, rawDamage) {
  const target = stats?.getEntity(targetId);
  if (!target) return null;
  const damage = target.guarding
    ? Math.max(1, Math.round(rawDamage * GUARD_DAMAGE_MULTIPLIER))
    : rawDamage;
  const targetHp = Math.max(0, (target.hp ?? 0) - damage);
  target.hp = targetHp;
  return { damage, targetHp, targetDefeated: targetHp <= 0 };
}

/**
 * @param {object} params
 */
export function planVoidAcolyteAttack({
  record,
  stats = null,
  targetId = 'player',
  stance = 'AGGRESSIVE',
} = {}) {
  const abilities = record?.abilities || createVoidAcolyteAbilityState();
  const attacker = stats?.getEntity(record?.id);
  const target = stats?.getEntity(targetId);
  const logLines = [];

  if (!attacker || !target) {
    return { abilityId: 'basic', logLines, abilities, damage: 0, apCost: BASIC_ATTACK_AP_COST };
  }

  const dist = manhattan(attacker.position, target.position);
  const playerLocked = stats.isVoidLocked?.(targetId) ?? false;
  let abilityId = 'basic';
  let damage = computeBasicAttackDamage(attacker.scholomance);
  let apCost = BASIC_ATTACK_AP_COST;

  if (dist <= 1 && playerLocked && attacker.attackPointsRemaining >= VOID_EXECUTION_AP_COST) {
    abilityId = 'void_execution';
    damage = VOID_EXECUTION_DAMAGE;
    apCost = VOID_EXECUTION_AP_COST;
    logLines.push('[VOID] EXECUTION CHARGED — the hollow closes.');
  } else if (
    abilities.icicleCooldown <= 0
    && dist >= ICICLE_BLAST_MIN_RANGE
    && dist <= ICICLE_BLAST_RANGE
    && attacker.attackPointsRemaining >= ICICLE_BLAST_AP_COST
  ) {
    abilityId = 'icicle_blast';
    damage = ICICLE_BLAST_DAMAGE_PER_HIT * ICICLE_BLAST_HIT_COUNT;
    apCost = ICICLE_BLAST_AP_COST;
    logLines.push('[ICE] Icicle Blast — rime spikes condense overhead.');
  } else if (abilities.gravityCooldown <= 0 && dist <= VOID_GRAVITY_RANGE && !playerLocked) {
    abilityId = 'void_gravity';
    damage = VOID_LASH_DAMAGE;
    apCost = BASIC_ATTACK_AP_COST;
    logLines.push('[VOID] Gravity well — you are anchored in the hollow.');
    if (stance !== 'AGGRESSIVE') {
      logLines.push('[VOID] The acolyte conserves pressure while repositioning.');
    }
  } else if (dist <= 1) {
    abilityId = 'void_lash';
    damage = VOID_LASH_DAMAGE;
    apCost = BASIC_ATTACK_AP_COST;
    logLines.push('[VOID] Void lash tears the lattice.');
  } else if (
    abilities.icicleCooldown <= 0
    && dist <= ICICLE_BLAST_RANGE
    && attacker.attackPointsRemaining >= ICICLE_BLAST_AP_COST
  ) {
    abilityId = 'icicle_blast';
    damage = ICICLE_BLAST_DAMAGE_PER_HIT * ICICLE_BLAST_HIT_COUNT;
    apCost = ICICLE_BLAST_AP_COST;
    logLines.push('[ICE] Icicle Blast — rime spikes condense overhead.');
  } else {
    logLines.push('[VOID] The acolyte reaches through the seal.');
  }

  return {
    abilityId,
    damage,
    apCost,
    logLines,
    abilities,
    dist,
    playerLocked,
    hitCount: abilityId === 'icicle_blast' ? ICICLE_BLAST_HIT_COUNT : 1,
    damagePerHit: abilityId === 'icicle_blast' ? ICICLE_BLAST_DAMAGE_PER_HIT : damage,
  };
}

/**
 * @param {import('./combatStatController.js').CombatStatController} stats
 * @param {string} acolyteId
 * @param {string} targetId
 * @param {object} plan
 * @param {Set<string>} [blocked]
 */
export function resolveVoidAcolyteAbility(stats, acolyteId, targetId, plan = {}, blocked = new Set()) {
  const attacker = stats?.getEntity(acolyteId);
  const target = stats?.getEntity(targetId);
  if (!attacker || !target) return null;

  const dist = manhattan(attacker.position, target.position);

  if (plan.abilityId === 'icicle_blast') {
    if (dist > ICICLE_BLAST_RANGE) return { hit: false, reason: 'out_of_range' };
    if (!spendAp(attacker, plan.apCost ?? ICICLE_BLAST_AP_COST)) {
      return { hit: false, reason: 'no_ap' };
    }
    if (plan.abilities) plan.abilities.icicleCooldown = ICICLE_BLAST_COOLDOWN_TURNS;
    return {
      hit: true,
      abilityId: 'icicle_blast',
      staged: true,
      hitCount: ICICLE_BLAST_HIT_COUNT,
      damagePerHit: plan.damagePerHit ?? ICICLE_BLAST_DAMAGE_PER_HIT,
      totalDamage: (plan.damagePerHit ?? ICICLE_BLAST_DAMAGE_PER_HIT) * ICICLE_BLAST_HIT_COUNT,
    };
  }

  if (plan.abilityId === 'void_gravity') {
    if (dist > VOID_GRAVITY_RANGE) return { hit: false, reason: 'out_of_range' };
    const pulled = stats.pullEntityAdjacent(acolyteId, targetId, blocked);
    if (!pulled) return { hit: false, reason: 'pull_blocked' };
    stats.setVoidLocked(targetId, VOID_GRAVITY_LOCK_TURNS);
    if (plan.abilities) plan.abilities.gravityCooldown = VOID_GRAVITY_COOLDOWN_TURNS;
    if (!spendAp(attacker, plan.apCost ?? BASIC_ATTACK_AP_COST)) {
      return { hit: false, reason: 'no_ap' };
    }
    const result = applyVoidAcolyteHitDamage(stats, targetId, plan.damage ?? VOID_LASH_DAMAGE);
    return {
      hit: true,
      pulled,
      locked: true,
      abilityId: 'void_gravity',
      ...result,
    };
  }

  const inRange = stats.isInAttackRange(acolyteId, targetId);
  if (!inRange) return { hit: false, reason: 'out_of_range' };

  const apCost = plan.apCost ?? BASIC_ATTACK_AP_COST;
  if (!spendAp(attacker, apCost)) return { hit: false, reason: 'no_ap' };

  const raw = plan.damage ?? computeBasicAttackDamage(attacker.scholomance);
  const result = applyVoidAcolyteHitDamage(stats, targetId, raw);
  return {
    hit: true,
    abilityId: plan.abilityId,
    ...result,
  };
}
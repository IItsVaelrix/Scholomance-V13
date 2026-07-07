import { resolveCombatBestiaryEntry } from '../bestiary/combatBestiary.registry.js';
import { buildBlockedSet } from '../combatPathfinding.js';
import { computeBasicAttackDamage } from '../scholomanceStats.js';
import { planEnemyTurn } from './enemyTurnPlanner.js';

function toBlockedSet(blocked) {
  if (blocked instanceof Set) return blocked;
  if (Array.isArray(blocked)) return buildBlockedSet(blocked);
  return buildBlockedSet();
}

/**
 * @param {object} params
 * @returns {object|null} TurnPlan
 */
export function driveEnemyTurn({
  entityId, record = null, stats, allies = [], targetId = 'player', blocked = null, rng = Math.random,
} = {}) {
  const entry = resolveCombatBestiaryEntry({ enemyId: entityId, record });
  const ai = entry?.combatAI;
  const self = stats?.getEntity(entityId);
  const target = stats?.getEntity(targetId);
  if (!ai || !self || !target) return null;

  const buildCtx = { enemyId: entityId, record, entity: self };
  const profile = ai.buildProfile ? ai.buildProfile(buildCtx) : {};
  const abilityKit = ai.buildAbilityKit ? ai.buildAbilityKit(buildCtx) : {};

  const ctx = {
    stats,
    selfId: entityId,
    targetId,
    self: {
      position: { ...self.position },
      hp: self.hp,
      maxHp: self.maxHp,
      attackPointsRemaining: self.attackPointsRemaining,
      attackRange: self.attackRange,
      intelligence: self.intelligence,
      guarding: self.guarding,
      movementPointsRemaining: self.movementPointsRemaining,
    },
    target: {
      position: { ...target.position },
      hp: target.hp,
      maxHp: target.maxHp,
      attackRange: target.attackRange,
      estimateAttackDamage: computeBasicAttackDamage(target.scholomance),
    },
    allies: allies
      .map((id) => stats.getEntity(id))
      .filter(Boolean)
      .map((e) => ({ id: e.id, tx: e.position.tx, ty: e.position.ty })),
    blocked: (() => {
      const bSet = toBlockedSet(blocked);
      if (target?.position) {
        bSet.add(`${target.position.tx},${target.position.ty}`);
      }
      allies.forEach((id) => {
        const ally = stats?.getEntity(id);
        if (ally?.position) {
          bSet.add(`${ally.position.tx},${ally.position.ty}`);
        }
      });
      return bSet;
    })(),
    abilityKit,
    profile,
    rng,
  };

  return planEnemyTurn(ctx);
}
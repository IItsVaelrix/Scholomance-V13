import { getIntelligenceTier } from '../combatIntelligence.js';
import { manhattan } from '../combatPathfinding.js';

const LOW_HP_RATIO = 0.3;

/**
 * @param {object} ctx
 * @returns {{ stance: string, hpRatio: number, targetHpRatio: number, tier: string, dist: number }}
 */
export function evaluateStance(ctx) {
  const hpRatio = ctx.self.maxHp > 0 ? ctx.self.hp / ctx.self.maxHp : 1;
  const targetHpRatio = ctx.target.maxHp > 0 ? ctx.target.hp / ctx.target.maxHp : 1;
  const tier = getIntelligenceTier(ctx.self.intelligence);
  const dist = manhattan(ctx.self.position, ctx.target.position);
  const preferred = ctx.abilityKit?.preferredRange ?? ctx.self.attackRange ?? 1;

  let stance = 'AGGRESSIVE';
  if (tier !== 'brute') {
    if (hpRatio <= LOW_HP_RATIO) stance = 'RETREAT';
    else if (ctx.abilityKit?.isRanged && dist < preferred) stance = 'KITE';
    else if (dist > preferred) stance = 'AGGRESSIVE';
    else stance = 'HOLD';
  }
  return { stance, hpRatio, targetHpRatio, tier, dist };
}
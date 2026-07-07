import { manhattan } from '../../combatPathfinding.js';
import { GUARD_DAMAGE_MULTIPLIER } from '../../combatStats.js';

export const SurvivalBrain = {
  id: 'SURVIVAL_BRAIN',
  domain: ['defense'],
  activationSignals: ['low-hp'],
  consumes: ['self.hp', 'self.maxHp', 'target.estimateAttackDamage'],
  weight: 1,
  score(candidate, ctx) {
    const hpRatio = ctx.self.maxHp > 0 ? ctx.self.hp / ctx.self.maxHp : 1;
    const incoming = ctx.target.estimateAttackDamage ?? 0;
    const dist = manhattan(candidate.endTile, ctx.target.position);
    const targetReach = ctx.target.attackRange ?? 1;
    const exposure = dist <= targetReach ? 1 : 0.25;
    let expectedHit = incoming * exposure;
    if (candidate.action.kind === 'guard') expectedHit *= GUARD_DAMAGE_MULTIPLIER;
    const damageAvoided = Math.max(0, incoming - expectedHit);
    const score = (1 - hpRatio) * damageAvoided;
    return {
      brainId: 'SURVIVAL_BRAIN',
      score,
      findings: score > 0 ? [`avoids ~${Math.round(damageAvoided)} while hurt`] : [],
      tieredSignals: [],
    };
  },
};
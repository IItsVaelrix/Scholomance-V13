import { manhattan } from '../../combatPathfinding.js';
import { BASIC_ATTACK_AP_COST } from '../../combatStats.js';

export const AggroBrain = {
  id: 'AGGRO_BRAIN',
  domain: ['offense'],
  activationSignals: ['target-reachable'],
  consumes: ['self.attackPointsRemaining', 'target.position', 'abilityKit'],
  weight: 1,
  score(candidate, ctx) {
    let score = 0;
    const findings = [];
    if (candidate.action.kind === 'attack') {
      const dist = manhattan(candidate.endTile, ctx.target.position);
      if (ctx.abilityKit.canActFromRange(dist) && ctx.self.attackPointsRemaining >= BASIC_ATTACK_AP_COST) {
        score = ctx.abilityKit.estimateAttackDamage();
        findings.push(`strike for ~${score}`);
      }
    }
    return { brainId: 'AGGRO_BRAIN', score, findings, tieredSignals: [] };
  },
};
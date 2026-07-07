import { manhattan } from '../../combatPathfinding.js';

export const CoordinationBrain = {
  id: 'COORDINATION_BRAIN',
  domain: ['coordination'],
  activationSignals: ['has-allies'],
  consumes: ['allies'],
  weight: 1,
  score(candidate, ctx) {
    const allies = ctx.allies || [];
    if (!allies.length) return { brainId: 'COORDINATION_BRAIN', score: 0, findings: [], tieredSignals: [] };
    const minAlly = Math.min(...allies.map((a) => manhattan(candidate.endTile, a)));
    const score = minAlly >= 2 ? 2 : (minAlly === 1 ? -3 : -6);
    return { brainId: 'COORDINATION_BRAIN', score, findings: [], tieredSignals: [] };
  },
};
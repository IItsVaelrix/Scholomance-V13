import { manhattan } from '../../combatPathfinding.js';

export const PositionBrain = {
  id: 'POSITION_BRAIN',
  domain: ['positioning'],
  activationSignals: [],
  consumes: ['abilityKit', 'target.position'],
  weight: 1,
  score(candidate, ctx) {
    const preferred = ctx.abilityKit?.preferredRange ?? 1;
    const dist = manhattan(candidate.endTile, ctx.target.position);
    const score = 5 - Math.abs(dist - preferred);
    return { brainId: 'POSITION_BRAIN', score, findings: [], tieredSignals: [] };
  },
};
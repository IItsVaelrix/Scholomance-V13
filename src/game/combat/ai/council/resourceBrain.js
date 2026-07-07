import { BASIC_ATTACK_AP_COST } from '../../combatStats.js';

export const ResourceBrain = {
  id: 'RESOURCE_BRAIN',
  domain: ['economy'],
  activationSignals: [],
  consumes: [],
  weight: 1,
  score(candidate) {
    const cost = candidate.action.kind === 'attack' ? BASIC_ATTACK_AP_COST : 0;
    return { brainId: 'RESOURCE_BRAIN', score: -cost, findings: [], tieredSignals: [] };
  },
};
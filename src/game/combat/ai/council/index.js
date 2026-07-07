import { AggroBrain } from './aggroBrain.js';
import { SurvivalBrain } from './survivalBrain.js';
import { PositionBrain } from './positionBrain.js';
import { ResourceBrain } from './resourceBrain.js';
import { CoordinationBrain } from './coordinationBrain.js';
import { ArbitrationBrain } from './arbitrationBrain.js';

export const DEFAULT_COUNCIL = Object.freeze([
  AggroBrain, SurvivalBrain, PositionBrain, ResourceBrain, CoordinationBrain, ArbitrationBrain
]);

/**
 * @returns {{ score: number, terms: Record<string, number>, votes: object[] }}
 */
export function scoreCandidate(candidate, ctx, weights, council = DEFAULT_COUNCIL) {
  let total = 0;
  const terms = {};
  const votes = [];
  for (const brain of council) {
    const vote = brain.score(candidate, ctx);
    const weighted = (weights[brain.id] ?? 0) * vote.score;
    total += weighted;
    terms[brain.id] = weighted;
    votes.push(vote);
  }
  return { score: total, terms, votes };
}
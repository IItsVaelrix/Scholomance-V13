import { evaluateStance } from './enemyStance.js';
import { computeEnemyPersonality } from './enemyPersonality.js';
import { planHold, planAdvance, planKite, planRetreat, planFlank } from './enemyMovement.js';
import { scoreCandidate } from './council/index.js';
import { manhattan } from '../combatPathfinding.js';
import { BASIC_ATTACK_AP_COST } from '../combatStats.js';
import { getTacticalTileMoveGoal } from '../tacticalBoardAiBridge.js';

function actionsFor(movement, ctx, stance) {
  const dist = manhattan(movement.destination, ctx.target.position);
  const canAttack = ctx.abilityKit.canActFromRange(dist)
    && (ctx.self.attackPointsRemaining >= BASIC_ATTACK_AP_COST);
  const out = [];
  if (canAttack) out.push({ kind: 'attack' });
  if (stance.tier !== 'brute') {
    out.push({ kind: 'guard' });
    out.push({ kind: 'wait' });
  } else if (!canAttack) {
    out.push({ kind: 'wait' });
  }
  return out;
}

function planContestTile(ctx) {
  const goal = getTacticalTileMoveGoal({ ...ctx, stats: ctx.stats });
  if (!goal?.steps?.length) return null;
  return {
    kind: 'contest_tile',
    steps: goal.steps,
    destination: goal.destination,
    reason: goal.reason,
  };
}

function enumerateCandidates(ctx, stance) {
  const contest = planContestTile(ctx);
  const goals = stance.tier === 'brute'
    ? [contest, planHold(ctx), planAdvance(ctx)]
    : [contest, planHold(ctx), planAdvance(ctx), planKite(ctx), planRetreat(ctx), planFlank(ctx)];
  const candidates = [];
  for (const movement of goals.filter(Boolean)) {
    for (const action of actionsFor(movement, ctx, stance)) {
      candidates.push({ movement, action, endTile: movement.destination });
    }
  }
  return candidates;
}

/**
 * @param {object} ctx
 * @returns {{ stance:string, movement:object, action:object, score:number, terms:object, reasons:string[] }}
 */
export function planEnemyTurn(ctx) {
  const stance = evaluateStance(ctx);
  const weights = computeEnemyPersonality({
    role: ctx.profile?.role,
    intTier: stance.tier,
    overrides: ctx.profile?.weightOverrides,
  });

  const candidates = enumerateCandidates(ctx, stance);
  const scored = candidates.map((candidate, index) => ({ candidate, index, ...scoreCandidate(candidate, ctx, weights) }));
  scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));

  const chosen = scored[0];
  if (!chosen) {
    return {
      stance: stance.stance,
      movement: { kind: 'hold', steps: [], destination: { ...ctx.self.position } },
      action: { kind: 'wait' },
      score: 0, terms: {}, reasons: [],
    };
  }

  const runnerUp = scored[1];
  const reasons = [
    `[BRAIN] ${ctx.selfId} ${stance.stance} (INT ${ctx.self.intelligence}/${stance.tier}) → `
    + `${chosen.candidate.movement.kind}+${chosen.candidate.action.kind} (score ${chosen.score.toFixed(1)}).`,
  ];
  if (runnerUp) {
    reasons.push(
      `[BRAIN] ${ctx.selfId} chose over ${runnerUp.candidate.movement.kind}+${runnerUp.candidate.action.kind} `
      + `(Δ ${(chosen.score - runnerUp.score).toFixed(1)}).`,
    );
  }

  return {
    stance: stance.stance,
    movement: chosen.candidate.movement,
    action: chosen.candidate.action,
    score: chosen.score,
    terms: chosen.terms,
    reasons,
  };
}
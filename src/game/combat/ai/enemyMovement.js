import { findPath, getReachableTiles, manhattan } from '../combatPathfinding.js';

function parseKey(key) {
  const [tx, ty] = key.split(',').map(Number);
  return { tx, ty };
}

function movementBudget(ctx) {
  return Math.max(0, Math.floor(ctx.self.movementPointsRemaining || 0));
}

function stepsTo(ctx, dest) {
  const path = findPath(ctx.self.position, dest, ctx.blocked);
  return path.slice(0, movementBudget(ctx));
}

function reachableTiles(ctx) {
  return [...getReachableTiles(ctx.self.position, movementBudget(ctx), ctx.blocked)].map(parseKey);
}

/** Pick the reachable tile maximising scoreFn; excludes the current tile. */
function bestReachable(ctx, scoreFn) {
  let best = null;
  let bestScore = -Infinity;
  for (const tile of reachableTiles(ctx)) {
    if (tile.tx === ctx.self.position.tx && tile.ty === ctx.self.position.ty) continue;
    const s = scoreFn(tile);
    if (s > bestScore) {
      bestScore = s;
      best = tile;
    }
  }
  return best;
}

export function planHold(ctx) {
  return { kind: 'hold', steps: [], destination: { ...ctx.self.position } };
}

export function planAdvance(ctx) {
  if (movementBudget(ctx) === 0) return null;
  let path = findPath(ctx.self.position, ctx.target.position, ctx.blocked);

  // If pathfinding directly to the target fails (e.g., target is blocked),
  // fallback to the reachable tile closest to the target via Manhattan ballistics.
  if (!path.length) {
    const best = bestReachable(ctx, (t) => -manhattan(t, ctx.target.position));
    if (!best) return null;
    path = stepsTo(ctx, best);
    if (!path.length) return null;
  }

  const range = ctx.abilityKit?.preferredRange ?? ctx.self.attackRange ?? 1;
  const cap = Math.min(path.length, movementBudget(ctx));
  let k = cap;
  for (let i = 0; i < cap; i += 1) {
    if (manhattan(path[i], ctx.target.position) <= range) { k = i + 1; break; }
  }
  const steps = path.slice(0, k);
  if (!steps.length) return null;
  return { kind: 'advance', steps, destination: steps[steps.length - 1] };
}

export function planRetreat(ctx) {
  const best = bestReachable(ctx, (t) => manhattan(t, ctx.target.position));
  if (!best) return null;
  const steps = stepsTo(ctx, best);
  if (!steps.length) return null;
  return { kind: 'retreat', steps, destination: steps[steps.length - 1] };
}

export function planKite(ctx) {
  const preferred = ctx.abilityKit?.preferredRange ?? ctx.self.attackRange ?? 1;
  const min = ctx.abilityKit?.minRange ?? 0;
  const best = bestReachable(ctx, (t) => {
    const d = manhattan(t, ctx.target.position);
    if (d < min) return -Infinity;
    return -Math.abs(d - preferred);
  });
  if (!best) return null;
  const steps = stepsTo(ctx, best);
  if (!steps.length) return null;
  return { kind: 'kite', steps, destination: steps[steps.length - 1] };
}

export function planFlank(ctx) {
  const range = ctx.abilityKit?.preferredRange ?? ctx.self.attackRange ?? 1;
  const allies = ctx.allies || [];
  const best = bestReachable(ctx, (t) => {
    if (manhattan(t, ctx.target.position) > range) return -Infinity;
    return allies.length ? Math.min(...allies.map((a) => manhattan(t, a))) : 0;
  });
  if (!best) return null;
  const steps = stepsTo(ctx, best);
  return { kind: 'flank', steps, destination: steps.length ? steps[steps.length - 1] : { ...ctx.self.position } };
}
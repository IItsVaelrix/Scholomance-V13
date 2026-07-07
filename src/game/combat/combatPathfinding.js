export const COMBAT_GRID_SIZE = 9;

export const DEFAULT_BLOCKED_TILES = Object.freeze([
  { tx: 8, ty: 0 },
  { tx: 4, ty: 4 },
]);

const DIRS = Object.freeze([
  { tx: -1, ty: 0 },
  { tx: 1, ty: 0 },
  { tx: 0, ty: -1 },
  { tx: 0, ty: 1 },
]);

export function tileKey(tx, ty) {
  return `${tx},${ty}`;
}

export function isInBounds(tx, ty, gridSize = COMBAT_GRID_SIZE) {
  return tx >= 0 && ty >= 0 && tx < gridSize && ty < gridSize;
}

export function buildBlockedSet(blockedTiles = DEFAULT_BLOCKED_TILES) {
  return new Set(blockedTiles.map(({ tx, ty }) => tileKey(tx, ty)));
}

export function isWalkable(tx, ty, blocked, validTiles = null) {
  const key = tileKey(tx, ty);
  if (validTiles) return validTiles.has(key) && !blocked.has(key);
  return isInBounds(tx, ty) && !blocked.has(key);
}

export function manhattan(a, b) {
  return Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty);
}

/** 4-connected A*. Returns steps from the first tile after start through goal. */
export function findPath(start, goal, blocked = buildBlockedSet(), validTiles = null) {
  if (!isWalkable(goal.tx, goal.ty, blocked, validTiles)) return [];
  if (start.tx === goal.tx && start.ty === goal.ty) return [];

  const open = [{ tx: start.tx, ty: start.ty, g: 0, f: manhattan(start, goal) }];
  const cameFrom = new Map();
  const gScore = new Map([[tileKey(start.tx, start.ty), 0]]);

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift();

    if (cur.tx === goal.tx && cur.ty === goal.ty) {
      const path = [];
      let k = tileKey(cur.tx, cur.ty);
      while (cameFrom.has(k)) {
        const [px, py] = k.split(',').map(Number);
        path.unshift({ tx: px, ty: py });
        k = cameFrom.get(k);
      }
      return path;
    }

    for (const d of DIRS) {
      const nx = cur.tx + d.tx;
      const ny = cur.ty + d.ty;
      if (!isWalkable(nx, ny, blocked, validTiles)) continue;

      const nk = tileKey(nx, ny);
      const tentative = cur.g + 1;
      if (tentative >= (gScore.get(nk) ?? Infinity)) continue;

      cameFrom.set(nk, tileKey(cur.tx, cur.ty));
      gScore.set(nk, tentative);
      open.push({
        tx: nx,
        ty: ny,
        g: tentative,
        f: tentative + manhattan({ tx: nx, ty: ny }, goal),
      });
    }
  }

  return [];
}

/** BFS flood-fill of tiles reachable within `maxSteps` movement points. */
export function getReachableTiles(start, maxSteps, blocked = buildBlockedSet(), validTiles = null) {
  const steps = Math.max(0, Math.floor(Number(maxSteps) || 0));
  const reachable = new Set([tileKey(start.tx, start.ty)]);
  if (steps === 0) return reachable;

  const queue = [{ tx: start.tx, ty: start.ty, cost: 0 }];
  const visited = new Set(reachable);

  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.cost >= steps) continue;

    for (const d of DIRS) {
      const nx = cur.tx + d.tx;
      const ny = cur.ty + d.ty;
      const nk = tileKey(nx, ny);
      if (!isWalkable(nx, ny, blocked, validTiles) || visited.has(nk)) continue;
      visited.add(nk);
      reachable.add(nk);
      queue.push({ tx: nx, ty: ny, cost: cur.cost + 1 });
    }
  }

  return reachable;
}

export function canReachWithinSteps(start, goal, maxSteps, blocked = buildBlockedSet(), validTiles = null) {
  const path = findPath(start, goal, blocked, validTiles);
  return path.length > 0 && path.length <= maxSteps;
}
/**
 * Discrete contour extraction — PB-STROKE-v1.
 *
 * Replaces continuous per-cell sub-pixel coverage estimation (the source of
 * the tearing bug in vri-renderer.js's Pass 1: two neighboring cells can each
 * independently compute low coverage at their shared sub-pixel boundary on a
 * curve, leaving an uncovered gap) with discrete integer-grid adjacency. Two
 * lookups into the same key cannot disagree with each other the way two
 * independent floating-point extrapolations can.
 *
 * Zero style knowledge lives here — no color, no pixel-weight constant beyond
 * a neutral geometric baseWeight (run length in cells). See stroke-stylizer.js
 * for the "how should this look" half.
 */
import { STROKE_CONTRACT } from './vri-schema.js';

const NEIGHBORS_8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

export function extractContours(coords) {
  const byKey = new Map();
  for (const c of coords) byKey.set(`${c.x},${c.y}`, c);

  const roleByKey = new Map();
  for (const c of coords) {
    const key = `${c.x},${c.y}`;
    let role = null;
    for (const [dx, dy] of NEIGHBORS_8) {
      const n = byKey.get(`${c.x + dx},${c.y + dy}`);
      if (!n) { role = 'silhouette'; break; }
      if (n.material !== c.material) role = 'material-boundary';
    }
    if (role) roleByKey.set(key, role);
  }

  const sorted = [...coords].sort((a, b) => a.y - b.y || a.x - b.x);
  const visited = new Set();
  const strokes = [];
  for (const start of sorted) {
    const startKey = `${start.x},${start.y}`;
    const role = roleByKey.get(startKey);
    if (!role || visited.has(startKey)) continue;

    const cells = [];
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop();
      const curKey = `${cur.x},${cur.y}`;
      if (visited.has(curKey) || roleByKey.get(curKey) !== role) continue;
      visited.add(curKey);
      cells.push({ x: cur.x, y: cur.y, partId: cur.partId ?? null, sourceOpId: cur.sourceOpId ?? null });
      for (const [dx, dy] of NEIGHBORS_8) {
        const n = byKey.get(`${cur.x + dx},${cur.y + dy}`);
        if (n && !visited.has(`${n.x},${n.y}`)) stack.push(n);
      }
    }

    strokes.push({
      path: { cells: cells.sort((a, b) => a.y - b.y || a.x - b.x) },
      role,
      baseWeight: cells.length,
      schemaVersion: STROKE_CONTRACT,
    });
  }
  return strokes;
}

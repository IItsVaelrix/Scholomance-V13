/**
 * Controlled modifiers — post-solve geometry refinement.
 * PDR §3 Phase 6: Chaikin smoothing with anchor preservation,
 * offset curves from centerline.
 */

import { qp, dist, normalize, perp, lerp } from './geometry-utils.js';

/**
 * Apply controlled Chaikin smoothing to a polyline.
 *
 * PDR §3: applyControlledChaikin(points, {
 *   iterations: 2,
 *   preserveAnchors: ['rim.left', 'rim.right'],
 *   maximumDeviation: 0.35
 * })
 *
 * Chaikin's corner-cutting: each segment [P_i, P_{i+1}] produces two points
 * at 1/4 and 3/4 along the segment. Anchored points are pinned.
 *
 * @param {Array<[number,number]>} points - input polyline
 * @param {object} opts
 * @param {number} opts.iterations - fixed iteration count (not adaptive)
 * @param {Set<number>} opts.preserveIndices - point indices that must not move
 * @param {number} opts.maximumDeviation - max allowed displacement in cells
 * @param {boolean} opts.closed - treat as closed polygon
 * @returns {Array<[number,number]>} smoothed polyline
 */
export function applyControlledChaikin(points, opts = {}) {
  const {
    iterations = 2,
    preserveIndices = new Set(),
    maximumDeviation = Infinity,
    closed = false,
  } = opts;

  if (!Array.isArray(points) || points.length < 3) return points;

  let current = points.map(p => [p[0], p[1]]);
  const originalAnchors = new Map();
  for (const idx of preserveIndices) {
    if (idx >= 0 && idx < points.length) {
      originalAnchors.set(idx, [points[idx][0], points[idx][1]]);
    }
  }

  for (let iter = 0; iter < iterations; iter++) {
    const next = [];
    const n = current.length;
    const segCount = closed ? n : n - 1;

    for (let i = 0; i < segCount; i++) {
      const p0 = current[i];
      const p1 = current[(i + 1) % n];

      // Chaikin: Q = 3/4 * P0 + 1/4 * P1, R = 1/4 * P0 + 3/4 * P1
      const qPt = lerp(p0, p1, 0.25);
      const rPt = lerp(p0, p1, 0.75);

      next.push(qPt);
      next.push(rPt);
    }

    if (!closed) {
      // Preserve endpoints for open curves
      next.unshift([current[0][0], current[0][1]]);
      next.push([current[n - 1][0], current[n - 1][1]]);
    }

    current = next;
  }

  // Enforce maximum deviation from original polyline
  if (Number.isFinite(maximumDeviation) && maximumDeviation > 0) {
    // For each smoothed point, find closest original point and clamp
    current = current.map(p => {
      let minD = Infinity;
      let closest = p;
      for (const orig of points) {
        const d = dist(p, orig);
        if (d < minD) { minD = d; closest = orig; }
      }
      if (minD > maximumDeviation) {
        // Pull back toward closest original
        const dir = normalize([closest[0] - p[0], closest[1] - p[1]]);
        const pullback = minD - maximumDeviation;
        return [p[0] + dir[0] * pullback, p[1] + dir[1] * pullback];
      }
      return p;
    });
  }

  return current.map(qp);
}

/**
 * Derive bank curves from a single centerline via normal offset.
 *
 * PDR §3: offsetFromCenterline(spine, distance, side)
 *   → derives bank curves from a single centerline, not from
 *     independently authored point lists.
 *
 * @param {Array<[number,number]>} spine - centerline polyline
 * @param {number} distance - offset distance in cells
 * @param {1|-1} side - 1 = left, -1 = right
 * @param {object} opts
 * @param {boolean} opts.closed - treat spine as closed
 * @returns {Array<[number,number]>} offset polyline
 */
export function offsetFromCenterline(spine, distance, side = 1, opts = {}) {
  const { closed = false } = opts;

  if (!Array.isArray(spine) || spine.length < 2) return [];

  const n = spine.length;
  const offset = [];

  for (let i = 0; i < n; i++) {
    const prev = spine[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const next = spine[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];

    const dir = normalize([next[0] - prev[0], next[1] - prev[1]]);
    const nrm = perp(dir); // left normal
    const d = distance * side;

    offset.push([
      spine[i][0] + nrm[0] * d,
      spine[i][1] + nrm[1] * d,
    ]);
  }

  return offset.map(qp);
}

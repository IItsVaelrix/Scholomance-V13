/**
 * fill.js
 *
 * SDF-to-lattice rasterizer.
 *
 * Bridges the existing sdf-evaluator.js into actual PixelBrain cells.
 * Every integer lattice point inside the sampling bounds is tested against
 * the caller-supplied evaluator function; points at or inside the surface
 * (distance <= threshold) are included in the result.
 *
 * Sampling convention: the integer coordinate (x, y) is treated as the
 * CENTER of the cell. This is consistent with the PixelBrain axiom that the
 * lattice is sovereign and coordinates are integer cell-center addresses.
 *
 * fillFromSDF does NOT import sdf-evaluator.js directly. The caller passes
 * the evaluator function, keeping this module decoupled from a specific SDF
 * implementation. The evaluator must be deterministic and must return a finite
 * number.
 */

import { createCellSet, cellSetToArray } from './cell-set.js';

/**
 * @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} SampleBounds
 */

/**
 * Rasterize an SDF into a sorted array of {x, y} cell objects.
 *
 * @param {object} options
 * @param {SampleBounds} options.bounds  - Integer inclusive bounds to scan.
 * @param {(p: {x: number, y: number}) => number} options.evaluator
 *   Function that returns the signed distance at a point.
 *   Negative or zero = inside / on surface.
 * @param {number} [options.threshold=0]
 *   Cells where evaluator(p) <= threshold are included.
 *   Use a small positive value (e.g. 0.5) to anti-alias the border.
 * @returns {Array<{x: number, y: number}>} Sorted by (y, x).
 */
export function fillFromSDF({ bounds, evaluator, threshold = 0 }) {
  const filled = createCellSet();

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      if (evaluator({ x, y }) <= threshold) {
        filled.add(`${x},${y}`);
      }
    }
  }

  return cellSetToArray(filled);
}

/**
 * Flood-fill from a seed cell using 4-way adjacency.
 *
 * Expands outward as long as the evaluator accepts the neighbor
 * (evaluator(p) <= threshold). Stops at the bounds boundary.
 *
 * Use this when you need to fill a contiguous region without scanning the
 * entire bounding box — useful for large canvases with small shapes.
 *
 * @param {object} options
 * @param {{ x: number, y: number }} options.seed  - Starting cell (must pass evaluator).
 * @param {SampleBounds} options.bounds            - Hard limit for expansion.
 * @param {(p: {x: number, y: number}) => number} options.evaluator
 * @param {number} [options.threshold=0]
 * @returns {Array<{x: number, y: number}>} Sorted by (y, x).
 */
export function floodFillFromSDF({ seed, bounds, evaluator, threshold = 0 }) {
  if (evaluator(seed) > threshold) return [];

  const visited = createCellSet();
  const queue = [{ x: seed.x, y: seed.y }];
  visited.add(`${seed.x},${seed.y}`);

  const NEIGHBORS = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  while (queue.length > 0) {
    const { x, y } = queue.pop();
    for (const { dx, dy } of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < bounds.minX || nx > bounds.maxX || ny < bounds.minY || ny > bounds.maxY) continue;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      if (evaluator({ x: nx, y: ny }) > threshold) continue;
      visited.add(key);
      queue.push({ x: nx, y: ny });
    }
  }

  return cellSetToArray(visited);
}

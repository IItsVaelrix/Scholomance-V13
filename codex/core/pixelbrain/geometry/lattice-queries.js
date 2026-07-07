/**
 * lattice-queries.js
 *
 * Spatial query operations on CellSets.
 *
 * These are utility queries that callers need frequently but that don't belong
 * in cell-set.js (which is pure container primitives) or spatial-hash.js
 * (which is the indexed lookup layer). Lattice-queries.js is the middle layer:
 * it accepts CellSets and answers geometric questions about them.
 *
 * All functions are deterministic and non-mutating.
 *
 * Adjacency convention:
 *   Default is 4-way (cardinal). Pass { eightWay: true } to include diagonals.
 *   PixelBrain defaults to 4-way per the kernel design doc.
 */

import { cellKey, parseCellKey } from './cell-key.js';

// ---------------------------------------------------------------------------
// Adjacency helpers
// ---------------------------------------------------------------------------

const NEIGHBORS_4 = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

const NEIGHBORS_8 = [
  ...NEIGHBORS_4,
  { dx: 1, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: -1 },
];

function neighbors(eightWay) {
  return eightWay ? NEIGHBORS_8 : NEIGHBORS_4;
}

// ---------------------------------------------------------------------------
// Border cells
// ---------------------------------------------------------------------------

/**
 * Return the subset of cells that have at least one missing neighbor.
 * These are the cells on the outer edge of the shape.
 *
 * @param {Set<string>} cellSet
 * @param {{ eightWay?: boolean }} [options]
 * @returns {Array<{x: number, y: number}>} Sorted by (y, x).
 */
export function getBorderCells(cellSet, { eightWay = false } = {}) {
  const dirs = neighbors(eightWay);
  const result = [];

  for (const key of cellSet) {
    const { x, y } = parseCellKey(key);
    const isBorder = dirs.some(({ dx, dy }) => !cellSet.has(cellKey(x + dx, y + dy)));
    if (isBorder) result.push({ x, y });
  }

  return result.sort((a, b) => a.y - b.y || a.x - b.x);
}

// ---------------------------------------------------------------------------
// Interior cells
// ---------------------------------------------------------------------------

/**
 * Return the subset of cells whose every neighbor is also in the set.
 * These are cells fully surrounded by the shape (not on the border).
 *
 * @param {Set<string>} cellSet
 * @param {{ eightWay?: boolean }} [options]
 * @returns {Array<{x: number, y: number}>} Sorted by (y, x).
 */
export function getInteriorCells(cellSet, { eightWay = false } = {}) {
  const dirs = neighbors(eightWay);
  const result = [];

  for (const key of cellSet) {
    const { x, y } = parseCellKey(key);
    const isInterior = dirs.every(({ dx, dy }) => cellSet.has(cellKey(x + dx, y + dy)));
    if (isInterior) result.push({ x, y });
  }

  return result.sort((a, b) => a.y - b.y || a.x - b.x);
}

// ---------------------------------------------------------------------------
// Connected components
// ---------------------------------------------------------------------------

/**
 * Partition a CellSet into connected components using flood fill.
 *
 * @param {Set<string>} cellSet
 * @param {{ eightWay?: boolean }} [options]
 * @returns {Array<Set<string>>} Each element is one connected component CellSet.
 *   Sorted by descending component size (largest first).
 */
export function getConnectedComponents(cellSet, { eightWay = false } = {}) {
  const dirs = neighbors(eightWay);
  const visited = new Set();
  const components = [];

  for (const startKey of cellSet) {
    if (visited.has(startKey)) continue;

    const component = new Set();
    const queue = [startKey];
    visited.add(startKey);

    while (queue.length > 0) {
      const key = queue.pop();
      component.add(key);
      const { x, y } = parseCellKey(key);

      for (const { dx, dy } of dirs) {
        const nk = cellKey(x + dx, y + dy);
        if (!cellSet.has(nk) || visited.has(nk)) continue;
        visited.add(nk);
        queue.push(nk);
      }
    }

    components.push(component);
  }

  return components.sort((a, b) => b.size - a.size);
}

// ---------------------------------------------------------------------------
// Dilation and erosion
// ---------------------------------------------------------------------------

/**
 * Dilate a CellSet by one cell in all neighbor directions.
 * Each cell in the set expands outward by one step.
 *
 * @param {Set<string>} cellSet
 * @param {{ eightWay?: boolean, steps?: number }} [options]
 *   steps: number of successive dilation passes (default 1).
 * @returns {Set<string>}
 */
export function dilateCellSet(cellSet, { eightWay = false, steps = 1 } = {}) {
  const dirs = neighbors(eightWay);
  let current = cellSet;

  for (let s = 0; s < steps; s++) {
    const next = new Set(current);
    for (const key of current) {
      const { x, y } = parseCellKey(key);
      for (const { dx, dy } of dirs) {
        next.add(cellKey(x + dx, y + dy));
      }
    }
    current = next;
  }

  return current;
}

/**
 * Erode a CellSet by one cell: remove any cell that lacks a full set of neighbors.
 *
 * @param {Set<string>} cellSet
 * @param {{ eightWay?: boolean, steps?: number }} [options]
 * @returns {Set<string>}
 */
export function erodeCellSet(cellSet, { eightWay = false, steps = 1 } = {}) {
  const dirs = neighbors(eightWay);
  let current = cellSet;

  for (let s = 0; s < steps; s++) {
    const next = new Set();
    for (const key of current) {
      const { x, y } = parseCellKey(key);
      const fullyEnclosed = dirs.every(({ dx, dy }) => current.has(cellKey(x + dx, y + dy)));
      if (fullyEnclosed) next.add(key);
    }
    current = next;
  }

  return current;
}

// ---------------------------------------------------------------------------
// Cell counts and coverage
// ---------------------------------------------------------------------------

/**
 * Return the number of cells in a CellSet that have at least one empty neighbor.
 * Equivalent to getBorderCells().length but O(n) without allocating the array.
 *
 * @param {Set<string>} cellSet
 * @param {{ eightWay?: boolean }} [options]
 * @returns {number}
 */
export function countBorderCells(cellSet, { eightWay = false } = {}) {
  const dirs = neighbors(eightWay);
  let count = 0;
  for (const key of cellSet) {
    const { x, y } = parseCellKey(key);
    if (dirs.some(({ dx, dy }) => !cellSet.has(cellKey(x + dx, y + dy)))) count++;
  }
  return count;
}

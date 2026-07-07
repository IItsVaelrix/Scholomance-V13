/**
 * bounds.js
 *
 * Axis-aligned bounding box (AABB) helpers for lattice cell collections.
 *
 * getBounds() accepts either:
 *   - An array of {x, y} objects  (cellSetToArray output)
 *   - A Set<string> of cell keys  (raw CellSet)
 *
 * All returned bounds objects are plain, unfrozen POJOs. Callers that need
 * immutability should Object.freeze() the result themselves.
 */

import { parseCellKey } from './cell-key.js';

/**
 * @typedef {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number, centerX: number, centerY: number }} Bounds
 */

/**
 * Compute the AABB that encloses all cells.
 *
 * @param {Array<{x: number, y: number}> | Set<string>} cells
 * @returns {Bounds | null} null when the collection is empty.
 */
export function getCellBounds(cells) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;

  if (cells instanceof Set) {
    for (const key of cells) {
      const { x, y } = parseCellKey(key);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      count++;
    }
  } else {
    for (const cell of cells) {
      const x = cell.x;
      const y = cell.y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      count++;
    }
  }

  if (count === 0) return null;

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: minX + (width - 1) / 2,
    centerY: minY + (height - 1) / 2,
  };
}

/**
 * Test whether a point (x, y) lies inside or on the boundary of an AABB.
 *
 * @param {Bounds | null} bounds
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function containsPoint(bounds, x, y) {
  if (!bounds) return false;
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

/**
 * Test whether two AABBs overlap (touching counts as overlap).
 *
 * @param {Bounds | null} a
 * @param {Bounds | null} b
 * @returns {boolean}
 */
export function intersectsBounds(a, b) {
  if (!a || !b) return false;
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

/**
 * Expand an AABB by `margin` cells on all sides.
 *
 * @param {Bounds} bounds
 * @param {number} margin - Non-negative integer.
 * @returns {Bounds}
 */
export function expandBounds(bounds, margin) {
  const m = Math.max(0, Math.round(margin));
  const minX = bounds.minX - m;
  const minY = bounds.minY - m;
  const maxX = bounds.maxX + m;
  const maxY = bounds.maxY + m;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: minX + (width - 1) / 2,
    centerY: minY + (height - 1) / 2,
  };
}

/**
 * Clamp an AABB to a canvas boundary.
 *
 * @param {Bounds} bounds
 * @param {{ width: number, height: number }} canvas
 * @returns {Bounds | null} null if the clamped region is empty.
 */
export function clampBoundsToCanvas(bounds, canvas) {
  const minX = Math.max(0, bounds.minX);
  const minY = Math.max(0, bounds.minY);
  const maxX = Math.min(canvas.width - 1, bounds.maxX);
  const maxY = Math.min(canvas.height - 1, bounds.maxY);
  if (minX > maxX || minY > maxY) return null;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: minX + (width - 1) / 2,
    centerY: minY + (height - 1) / 2,
  };
}

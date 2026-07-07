/**
 * raster-fill.js
 *
 * Filled shape rasterizers for the PixelBrain geometry kernel.
 *
 * This module is the fill counterpart to raster-math.js (which provides
 * stroke/outline emitters only). Nothing in this module touches raster-math.js
 * — the two are independent utilities.
 *
 * All functions return Array<{x, y}> sorted by (y, x). No duplicates.
 * No Math.random. No Date.now. Fully deterministic.
 *
 * Scanline fill edge rule (polygon fill):
 *   A scanline at integer y intersects an edge when:
 *     (a.y <= y < b.y)  OR  (b.y <= y < a.y)
 *   i.e. top-inclusive, bottom-exclusive. This prevents double-counting
 *   shared vertices and is consistent with standard rasterisation convention.
 */

import { fillFromSDF } from './fill.js';
import { createCellSet, cellSetToArray } from './cell-set.js';

// ---------------------------------------------------------------------------
// Polygon fill — scanline algorithm
// ---------------------------------------------------------------------------

/**
 * Fill the interior of a polygon defined by an ordered list of {x, y} vertices.
 *
 * Uses the standard scanline / even-odd crossing algorithm.
 * Edge rule: top-inclusive, bottom-exclusive (prevents double-counted vertices).
 *
 * @param {Array<{x: number, y: number}>} points  - At least 3 vertices.
 * @returns {Array<{x: number, y: number}>} Sorted by (y, x), no duplicates.
 */
export function fillPolygon(points) {
  if (!Array.isArray(points) || points.length < 3) return [];

  const n = points.length;
  const minY = Math.floor(Math.min(...points.map((p) => p.y)));
  const maxY = Math.ceil(Math.max(...points.map((p) => p.y)));

  const filled = createCellSet();

  for (let y = minY; y <= maxY; y++) {
    const intersections = [];

    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];

      const isMaxY = (y === maxY);
      const crosses =
        (a.y <= y && b.y > y) ||
        (b.y <= y && a.y > y) ||
        (isMaxY && ((a.y <= y && b.y >= y) || (b.y <= y && a.y >= y)) && a.y !== b.y);

      if (!crosses) continue;

      const t = (y - a.y) / (b.y - a.y);
      intersections.push(a.x + t * (b.x - a.x));
    }

    intersections.sort((a, b) => a - b);

    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const startX = Math.ceil(intersections[i]);
      const endX = Math.floor(intersections[i + 1]);
      for (let x = startX; x <= endX; x++) {
        filled.add(`${x},${y}`);
      }
    }
  }

  return cellSetToArray(filled);
}

// ---------------------------------------------------------------------------
// Ellipse fill
// ---------------------------------------------------------------------------

/**
 * Fill an axis-aligned ellipse.
 *
 * Tests each candidate cell at its integer coordinate (cell center) using the
 * standard ellipse equation: (x-cx)²/rx² + (y-cy)²/ry² <= 1.
 *
 * @param {{ cx: number, cy: number, rx: number, ry: number }} options
 * @returns {Array<{x: number, y: number}>} Sorted by (y, x), no duplicates.
 */
export function fillEllipse({ cx, cy, rx, ry }) {
  if (rx <= 0 || ry <= 0) return [];

  const minX = Math.floor(cx - rx);
  const maxX = Math.ceil(cx + rx);
  const minY = Math.floor(cy - ry);
  const maxY = Math.ceil(cy + ry);

  const filled = createCellSet();

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) {
        filled.add(`${x},${y}`);
      }
    }
  }

  return cellSetToArray(filled);
}

// ---------------------------------------------------------------------------
// Filled circle (special case of fillEllipse)
// ---------------------------------------------------------------------------

/**
 * Fill a circle. Delegates to fillEllipse with rx === ry === radius.
 *
 * @param {{ cx: number, cy: number, radius: number }} options
 * @returns {Array<{x: number, y: number}>}
 */
export function fillCircle({ cx, cy, radius }) {
  return fillEllipse({ cx, cy, rx: radius, ry: radius });
}

// ---------------------------------------------------------------------------
// Thick line — capsule SDF fill
// ---------------------------------------------------------------------------

/**
 * Compute the distance from point (px, py) to the line segment (x1,y1)→(x2,y2).
 * @private
 */
function _distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return Math.hypot(px - x1, py - y1);

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Rasterize a thick line as a filled capsule shape (line segment expanded by radius).
 *
 * @param {{ x1: number, y1: number, x2: number, y2: number, radius: number }} options
 * @returns {Array<{x: number, y: number}>} Sorted by (y, x), no duplicates.
 */
export function fillThickLine({ x1, y1, x2, y2, radius }) {
  if (radius <= 0) return [];

  const bounds = {
    minX: Math.floor(Math.min(x1, x2) - radius),
    maxX: Math.ceil(Math.max(x1, x2) + radius),
    minY: Math.floor(Math.min(y1, y2) - radius),
    maxY: Math.ceil(Math.max(y1, y2) + radius),
  };

  return fillFromSDF({
    bounds,
    evaluator: ({ x, y }) => _distanceToSegment(x, y, x1, y1, x2, y2) - radius,
  });
}

// ---------------------------------------------------------------------------
// Filled rectangle
// ---------------------------------------------------------------------------

/**
 * Fill an axis-aligned rectangle (inclusive on all sides).
 *
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} options
 * @returns {Array<{x: number, y: number}>} Sorted by (y, x), no duplicates.
 */
export function fillRect({ minX, minY, maxX, maxY }) {
  const filled = createCellSet();
  const x0 = Math.ceil(minX);
  const x1 = Math.floor(maxX);
  const y0 = Math.ceil(minY);
  const y1 = Math.floor(maxY);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      filled.add(`${x},${y}`);
    }
  }
  return cellSetToArray(filled);
}

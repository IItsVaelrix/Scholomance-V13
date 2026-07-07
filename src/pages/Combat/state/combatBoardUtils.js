/**
 * combatBoardUtils.js
 *
 * Pure coordinate utilities for the 5×5 combat board.
 * Zero DOM, React, or Phaser imports. Safe to unit-test in isolation.
 *
 * Grid convention:
 *   x = column  (0 = left  / A, 4 = right / E)
 *   y = row     (0 = top   / 1, 4 = bottom / 5)
 */

const GRID_SIZE = 9;

// ---------------------------------------------------------------------------
// Key conversion
// ---------------------------------------------------------------------------

/**
 * Convert a {x, y} coord to a string key usable in maps/records.
 * @param {{ x: number, y: number }} coord
 * @returns {string}
 */
export function coordToKey({ x, y }) {
  return `${x},${y}`;
}

/**
 * Convert a string key back to a {x, y} coord.
 * @param {string} key
 * @returns {{ x: number, y: number }}
 */
export function keyToCoord(key) {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

/**
 * Returns true if the coord falls within the board.
 * @param {{ x: number, y: number }} coord
 * @param {number} [size=5]
 * @returns {boolean}
 */
export function isWithinBounds({ x, y }, size = GRID_SIZE) {
  return x >= 0 && x < size && y >= 0 && y < size;
}

// ---------------------------------------------------------------------------
// Distance
// ---------------------------------------------------------------------------

/**
 * Manhattan (taxi-cab) distance between two coords.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @returns {number}
 */
export function getManhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Euclidean distance between two coords (rounded to 1 decimal).
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @returns {number}
 */
export function getEuclideanDistance(a, b) {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

// ---------------------------------------------------------------------------
// Adjacency
// ---------------------------------------------------------------------------

/**
 * Return the four orthogonal neighbors that are within bounds.
 * @param {{ x: number, y: number }} coord
 * @returns {{ x: number, y: number }[]}
 */
export function getNeighbors({ x, y }) {
  return [
    { x: x - 1, y },
    { x: x + 1, y },
    { x, y: y - 1 },
    { x, y: y + 1 },
  ].filter(isWithinBounds);
}

/**
 * Return all eight neighbors (orthogonal + diagonal) within bounds.
 * @param {{ x: number, y: number }} coord
 * @returns {{ x: number, y: number }[]}
 */
export function getAllNeighbors({ x, y }) {
  const candidates = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      candidates.push({ x: x + dx, y: y + dy });
    }
  }
  return candidates.filter(isWithinBounds);
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/**
 * All tiles along a straight line from origin to target (exclusive of origin).
 * Uses Bresenham-style rounding.
 * @param {{ x: number, y: number }} origin
 * @param {{ x: number, y: number }} target
 * @returns {{ x: number, y: number }[]}
 */
export function getLineTiles(origin, target) {
  const tiles = [];
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) return [];
  for (let i = 1; i <= steps; i++) {
    const x = Math.round(origin.x + (dx * i) / steps);
    const y = Math.round(origin.y + (dy * i) / steps);
    const coord = { x, y };
    if (isWithinBounds(coord)) tiles.push(coord);
  }
  return tiles;
}

/**
 * Cross (plus) pattern radiating from center at given radius.
 * @param {{ x: number, y: number }} center
 * @param {number} radius
 * @returns {{ x: number, y: number }[]}
 */
export function getCrossPattern(center, radius) {
  const tiles = [];
  for (let i = 1; i <= radius; i++) {
    [
      { x: center.x + i, y: center.y },
      { x: center.x - i, y: center.y },
      { x: center.x, y: center.y + i },
      { x: center.x, y: center.y - i },
    ]
      .filter(isWithinBounds)
      .forEach(c => tiles.push(c));
  }
  return tiles;
}

/**
 * Square (all tiles within Chebyshev radius) excluding center.
 * @param {{ x: number, y: number }} center
 * @param {number} radius
 * @returns {{ x: number, y: number }[]}
 */
export function getSquarePattern(center, radius) {
  const tiles = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const coord = { x: center.x + dx, y: center.y + dy };
      if (isWithinBounds(coord)) tiles.push(coord);
    }
  }
  return tiles;
}

/**
 * Diamond (all tiles within Manhattan radius) excluding center.
 * @param {{ x: number, y: number }} center
 * @param {number} radius
 * @returns {{ x: number, y: number }[]}
 */
export function getDiamondPattern(center, radius) {
  const tiles = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (Math.abs(dx) + Math.abs(dy) <= radius) {
        const coord = { x: center.x + dx, y: center.y + dy };
        if (isWithinBounds(coord)) tiles.push(coord);
      }
    }
  }
  return tiles;
}

/**
 * Cone pattern emanating from origin in a cardinal direction.
 * @param {{ x: number, y: number }} origin
 * @param {'north'|'south'|'east'|'west'} facing
 * @param {number} radius
 * @returns {{ x: number, y: number }[]}
 */
export function getConePattern(origin, facing, radius) {
  const dirs = {
    north: { fdx: 0, fdy: -1 },
    south: { fdx: 0, fdy: 1 },
    east:  { fdx: 1, fdy: 0 },
    west:  { fdx: -1, fdy: 0 },
  };
  const { fdx, fdy } = dirs[facing] || dirs.north;
  const tiles = [];
  for (let step = 1; step <= radius; step++) {
    const spread = step - 1;
    for (let s = -spread; s <= spread; s++) {
      const coord = {
        x: origin.x + fdx * step + (fdy !== 0 ? s : 0),
        y: origin.y + fdy * step + (fdx !== 0 ? s : 0),
      };
      if (isWithinBounds(coord)) tiles.push(coord);
    }
  }
  return tiles;
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

/**
 * Convert a {x, y} coord to a human-readable label (e.g. "B3").
 * @param {{ x: number, y: number }} coord
 * @returns {string}
 */
export function coordToLabel({ x, y }) {
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

/**
 * Convert a label string (e.g. "B3") to a {x, y} coord.
 * @param {string} label
 * @returns {{ x: number, y: number }|null}
 */
export function labelToCoord(label) {
  if (!label || label.length < 2) return null;
  const x = label.charCodeAt(0) - 65;
  const y = parseInt(label.slice(1), 10) - 1;
  return isWithinBounds({ x, y }) ? { x, y } : null;
}

/**
 * cell-set.js
 *
 * Canonical lattice-region container.
 *
 * A CellSet is a plain ES6 Set whose members are cell keys (strings produced
 * by cellKey()). It is the canonical format for any collection of lattice
 * cells in the geometry kernel:
 *
 *   - No duplicate cells.
 *   - No unstable ordering from object-key iteration.
 *   - O(1) membership test.
 *   - Serialises to a deterministic sorted array via cellSetToArray().
 *
 * The Set is not frozen or wrapped — callers use addCell() / hasCell() helpers
 * so the encoding detail stays in this module.
 */

import { cellKey, parseCellKey } from './cell-key.js';

/**
 * Build a CellSet from an array of {x, y} objects.
 *
 * @param {Array<{x: number, y: number}>} cells
 * @returns {Set<string>}
 */
export function createCellSet(cells = []) {
  const set = new Set();
  for (const cell of cells) {
    set.add(cellKey(cell.x, cell.y));
  }
  return set;
}

/**
 * Serialise a CellSet to a sorted array of {x, y} objects.
 * Sort order: ascending y, then ascending x (row-major, left-to-right).
 * This order is stable and deterministic regardless of insertion order.
 *
 * @param {Set<string>} set
 * @returns {Array<{x: number, y: number}>}
 */
export function cellSetToArray(set) {
  return [...set]
    .map(parseCellKey)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Test whether a CellSet contains the cell at (x, y).
 *
 * @param {Set<string>} set
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function hasCell(set, x, y) {
  return set.has(cellKey(x, y));
}

/**
 * Add the cell at (x, y) to a CellSet. Mutates and returns the set.
 *
 * @param {Set<string>} set
 * @param {number} x
 * @param {number} y
 * @returns {Set<string>}
 */
export function addCell(set, x, y) {
  set.add(cellKey(x, y));
  return set;
}

/**
 * Remove the cell at (x, y) from a CellSet. Mutates and returns the set.
 *
 * @param {Set<string>} set
 * @param {number} x
 * @param {number} y
 * @returns {Set<string>}
 */
export function removeCell(set, x, y) {
  set.delete(cellKey(x, y));
  return set;
}

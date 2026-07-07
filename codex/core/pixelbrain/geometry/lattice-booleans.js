/**
 * lattice-booleans.js
 *
 * Set-theoretic boolean operations on CellSets.
 *
 * Every function accepts and returns plain Set<string> instances (CellSets).
 * All operations are non-destructive: they return new Sets and never mutate
 * their inputs.
 *
 * Usage examples:
 *
 *   robe    = subtractCellSets(body, hoodOpening)
 *   sword   = unionCellSets(blade, hilt, gem)
 *   aura    = subtractCellSets(outerGlow, body)
 *   overlap = intersectCellSets(regionA, regionB)
 *   frame   = differenceCellSets(outerRect, innerRect)  // hollow rect
 */

/**
 * Return a new CellSet containing every cell present in any of the input sets.
 *
 * @param {...Set<string>} sets
 * @returns {Set<string>}
 */
export function unionCellSets(...sets) {
  const result = new Set();
  for (const set of sets) {
    for (const key of set) {
      result.add(key);
    }
  }
  return result;
}

/**
 * Return a new CellSet containing every cell in `base` that is NOT in `subtract`.
 *
 * @param {Set<string>} base
 * @param {Set<string>} subtract
 * @returns {Set<string>}
 */
export function subtractCellSets(base, subtract) {
  const result = new Set();
  for (const key of base) {
    if (!subtract.has(key)) result.add(key);
  }
  return result;
}

/**
 * Return a new CellSet containing only cells present in ALL input sets.
 * Returns an empty set when no sets are provided.
 *
 * @param {...Set<string>} sets
 * @returns {Set<string>}
 */
export function intersectCellSets(...sets) {
  if (sets.length === 0) return new Set();
  if (sets.length === 1) return new Set(sets[0]);

  // Start from the smallest set for early short-circuit.
  const sorted = [...sets].sort((a, b) => a.size - b.size);
  const result = new Set();
  for (const key of sorted[0]) {
    if (sorted.every((s) => s.has(key))) result.add(key);
  }
  return result;
}

/**
 * Symmetric difference: cells in exactly one of `a` or `b` (not both).
 * Useful for detecting seam changes between two versions of a shape.
 *
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {Set<string>}
 */
export function differenceCellSets(a, b) {
  const result = new Set();
  for (const key of a) {
    if (!b.has(key)) result.add(key);
  }
  for (const key of b) {
    if (!a.has(key)) result.add(key);
  }
  return result;
}

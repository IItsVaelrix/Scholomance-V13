/**
 * cell-key.js
 *
 * Canonical encoding/decoding for integer lattice coordinates.
 *
 * A cell key is the single source-of-truth string identity for a lattice cell.
 * Format: `"${x},${y}"` — hyphen-free, comma-separated, no spaces.
 *
 * All geometry kernel code that produces or consumes Sets of cells must pass
 * coordinates through cellKey() before storing them. This prevents the "why
 * did export order change?" phantom caused by ad-hoc `${x},${y}` strings
 * scattered through callers.
 */

/**
 * Encode integer lattice coordinates as a canonical cell key.
 *
 * @param {number} x - Integer x coordinate.
 * @param {number} y - Integer y coordinate.
 * @returns {string} Canonical key, e.g. "3,7".
 */
export function cellKey(x, y) {
  return `${x},${y}`;
}

/**
 * Decode a canonical cell key back to integer coordinates.
 *
 * @param {string} key - A key produced by cellKey().
 * @returns {{ x: number, y: number }}
 */
export function parseCellKey(key) {
  const comma = key.indexOf(',');
  return {
    x: Number(key.slice(0, comma)),
    y: Number(key.slice(comma + 1)),
  };
}

/**
 * combatPreviewUtils.js
 *
 * Pure functions for calculating spatial patterns (AOE, Range, Paths).
 * Used by selectors to derive the Preview State.
 */

/**
 * Returns tiles in a Cross pattern of a given radius.
 * @param {{x:number, y:number}} center
 * @param {number} radius
 * @returns {{x:number, y:number}[]}
 */
export function getCrossPattern(center, radius = 1) {
  const tiles = [{ ...center }];
  for (let i = 1; i <= radius; i++) {
    tiles.push({ x: center.x + i, y: center.y });
    tiles.push({ x: center.x - i, y: center.y });
    tiles.push({ x: center.x, y: center.y + i });
    tiles.push({ x: center.x, y: center.y - i });
  }
  return tiles.filter(t => t.x >= 0 && t.x < 5 && t.y >= 0 && t.y < 5);
}

/**
 * Returns tiles in a Square pattern (3x3, 5x5 etc).
 * @param {{x:number, y:number}} center
 * @param {number} radius
 * @returns {{x:number, y:number}[]}
 */
export function getSquarePattern(center, radius = 1) {
  const tiles = [];
  for (let y = center.y - radius; y <= center.y + radius; y++) {
    for (let x = center.x - radius; x <= center.x + radius; x++) {
      if (x >= 0 && x < 5 && y >= 0 && y < 5) {
        tiles.push({ x, y });
      }
    }
  }
  return tiles;
}

/**
 * Returns tiles in a straight line from origin to target.
 * @param {{x:number, y:number}} origin
 * @param {{x:number, y:number}} target
 * @param {number} length
 * @returns {{x:number, y:number}[]}
 */
export function getLinePattern(origin, target, length = 3) {
  const dx = Math.sign(target.x - origin.x);
  const dy = Math.sign(target.y - origin.y);
  const tiles = [];
  for (let i = 1; i <= length; i++) {
    const tx = origin.x + dx * i;
    const ty = origin.y + dy * i;
    if (tx >= 0 && tx < 5 && ty >= 0 && ty < 5) {
      tiles.push({ x: tx, y: ty });
    }
  }
  return tiles;
}

/** Canonical row-major cell index. ALL perception masks use this ordering. */
export function cellIndex(row, col, cols) {
  return (row * cols) + col;
}

/** Total cells in a rows x cols lattice. */
export function cellCount(rows, cols) {
  return rows * cols;
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function colorToInt(color) {
  const raw = String(color || '').trim().replace('#', '');
  const hex = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return 0;
  return parseInt(hex, 16); // 0 .. 16777215
}

/**
 * Deterministic scalar fingerprint of a cell's value.
 * 0 is reserved for empty / unoccupied cells so a freshly cleared cell
 * is distinguishable from a painted one.
 */
export function cellSignature(cell) {
  if (!cell || cell.occupied === false) return 0;
  const emphasisByte = Math.round(clamp01(cell.emphasis === undefined ? 1 : cell.emphasis) * 255);
  // colorInt in [0, 2^24); *256 + emphasis + 1 stays well within Number.MAX_SAFE_INTEGER.
  return (colorToInt(cell.color) * 256) + emphasisByte + 1;
}

/** Map a row-major dense array of cell descriptors (or null) to signatures. */
export function buildCellSignatures(denseCells) {
  const list = Array.isArray(denseCells) ? denseCells : [];
  const out = new Float64Array(list.length);
  for (let i = 0; i < list.length; i += 1) out[i] = cellSignature(list[i]);
  return out;
}

/** changedMask: 1 where curr differs from prev. null prev => first-tick full change. */
export function diffCellSignatures(prev, curr) {
  const current = curr || new Float64Array(0);
  const mask = new Uint8Array(current.length);
  if (!prev) { mask.fill(1); return mask; }
  for (let i = 0; i < current.length; i += 1) {
    mask[i] = prev[i] === current[i] ? 0 : 1;
  }
  return mask;
}

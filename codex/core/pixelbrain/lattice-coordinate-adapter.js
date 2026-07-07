/**
 * LATTICE ↔ COORDINATE ADAPTER
 *
 * Impedance matcher between the two lattice representations in the engine:
 *
 *   coordinate-array form  : [{ x, y, z?, color, partId, emphasis, ... }]   (pixelBrainBridge / asset packet)
 *   lattice-map form       : { cols, rows, cells: Map<"col,row", { col, row, color, emphasis, ... }> }  (symmetry-amp)
 *
 * `applySymmetryToLattice` (symmetry-amp.js) resolves contested mirror targets with
 * `if (!newCells.has(mirrorKey))`, so its output depends on the Map's *insertion order*.
 * To keep `compile()` Axiom-5 deterministic, both directions here impose a total order:
 *   - coordsToLattice inserts cells in sorted (row, col, partId, color) order.
 *   - latticeToCoords emits coordinates in sorted (y, x, partId, color) order.
 *
 * Geometry stays on the integer grid (Axiom 2), so the round-trip is lossless for any
 * coordinate already snapped to a cell, and the canonical form carries no floats that a
 * JS/Python checksum could disagree on.
 */

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function cellKey(col, row) {
  return `${col},${row}`;
}

/**
 * Stable comparator over (primary, secondary, partId, color). Pure, total order.
 */
function compareCells(a, b) {
  if (a.row !== b.row) return a.row - b.row;
  if (a.col !== b.col) return a.col - b.col;
  const pa = String(a.partId || '');
  const pb = String(b.partId || '');
  if (pa !== pb) return pa < pb ? -1 : 1;
  const ca = String(a.color || '');
  const cb = String(b.color || '');
  if (ca !== cb) return ca < cb ? -1 : 1;
  return 0;
}

/**
 * Build the lattice-map form from a coordinate array.
 *
 * @param {Array<Object>} coordinates - coordinate-array form
 * @param {{ width?: number, height?: number, gridSize?: number }} [canvas]
 * @returns {{ cols: number, rows: number, gridSize: number, cells: Map }}
 */
export function coordsToLattice(coordinates, canvas = {}) {
  const list = Array.isArray(coordinates) ? coordinates : [];

  // Integer column/row: prefer the already-snapped grid position, fall back to rounding.
  const normalized = list.map((coordinate) => {
    const col = toInt(coordinate?.snappedX ?? coordinate?.col ?? coordinate?.x);
    const row = toInt(coordinate?.snappedY ?? coordinate?.row ?? coordinate?.y);
    return {
      ...coordinate,
      col,
      row,
      color: coordinate?.color ?? null,
      partId: coordinate?.partId ?? coordinate?.paletteKey ?? '',
      emphasis: Number(coordinate?.emphasis) || 0,
    };
  });

  const inferredCols = normalized.reduce((max, c) => Math.max(max, c.col), -1) + 1;
  const inferredRows = normalized.reduce((max, c) => Math.max(max, c.row), -1) + 1;
  const cols = Math.max(1, toInt(canvas?.width, 0) || inferredCols);
  const rows = Math.max(1, toInt(canvas?.height, 0) || inferredRows);
  const gridSize = toInt(canvas?.gridSize, 1) || 1;

  // Insert in a total order so a later symmetry pass is reproducible. On a cell
  // collision in the source, the higher-emphasis cell wins; ties break by the
  // stable comparator — never by array happenstance.
  const sorted = [...normalized].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    if (a.col !== b.col) return a.col - b.col;
    if (b.emphasis !== a.emphasis) return b.emphasis - a.emphasis;
    return compareCells(a, b);
  });

  const cells = new Map();
  for (const cell of sorted) {
    if (cell.col < 0 || cell.col >= cols || cell.row < 0 || cell.row >= rows) continue;
    const key = cellKey(cell.col, cell.row);
    if (!cells.has(key)) cells.set(key, cell);
  }

  return { cols, rows, gridSize, cells };
}

/**
 * Flatten the lattice-map form back to a sorted coordinate array.
 *
 * @param {{ cols?: number, rows?: number, cells?: Map }} lattice
 * @returns {Array<Object>} coordinate-array form, sorted (y, x, partId, color)
 */
export function latticeToCoords(lattice) {
  const cells = lattice?.cells instanceof Map ? [...lattice.cells.values()] : [];
  return cells
    .slice()
    .sort(compareCells)
    .map((cell) => {
      const { col, row, ...rest } = cell;
      return {
        ...rest,
        x: col,
        y: row,
        snappedX: col,
        snappedY: row,
      };
    });
}

//
// Dense per-cell shadow scalar field for the photonic-retina perception eye.
// Reuses shadow-amp's edge/pocket/core classification but emits a row-major
// Float64Array (one scalar per lattice cell) instead of recolored coordinates.
// This is the NON-LOCAL light source: a neighbour's edge-flow change shifts a
// cell's scalar even though the cell's own colour did not change. Deterministic.

export const SHADOW_PERCEPTION_AMP_ID = 'pixelbrain.shadow-perception-amp';

export const SHADOW_SCALARS = Object.freeze({ NONE: 0, POCKET: 0.15, EDGE: 0.25 });

function cellCol(coord) {
  return Number.isFinite(Number(coord?.col)) ? Number(coord.col)
    : Number(coord?.snappedX ?? coord?.x ?? 0);
}

function cellRow(coord) {
  return Number.isFinite(Number(coord?.row)) ? Number(coord.row)
    : Number(coord?.snappedY ?? coord?.y ?? 0);
}

export function runShadowPerceptionAmp({ coordinates = [], vectorField = [], cols = 0, rows = 0 } = {}) {
  const field = new Float64Array(Math.max(0, cols * rows));

  const vectorMap = new Map();
  for (const v of vectorField) vectorMap.set(`${v.x},${v.y}`, v);

  for (const coord of coordinates) {
    const col = cellCol(coord);
    const row = cellRow(coord);
    if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
    const index = (row * cols) + col;

    const role = coord?.colorIntensity?.role || 'neutral';
    if (role === 'white_core' || role === 'hot_chroma') {
      field[index] = SHADOW_SCALARS.NONE;
      continue;
    }

    const vectorData = vectorMap.get(`${col},${row}`);
    if (vectorData && vectorData.role === 'edge-flow') {
      field[index] = SHADOW_SCALARS.EDGE;
    } else if (role === 'black_anchor' || role === 'cold_chroma') {
      field[index] = SHADOW_SCALARS.POCKET;
    } else {
      field[index] = SHADOW_SCALARS.NONE;
    }
  }

  return { ampId: SHADOW_PERCEPTION_AMP_ID, shadowField: field };
}

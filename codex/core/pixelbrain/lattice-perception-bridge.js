//
// Joins the live lattice generation to the photonic-retina perception eye.
// Maps lattice.cells -> dense row-major grid, derives the three channels, and
// returns a PerceptionFrame plus a snapshot to thread into the next generation.
// Deterministic; no Date.now / Math.random.

import {
  buildCellSignatures,
  diffCellSignatures,
  diffShadowField,
  assemblePerceptionFrame,
} from '../../../src/lib/photonic-retina/index.js';
import { buildCommittedMask } from './qbit-placement-memory.js';

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function buildLatticePerceptionFrame({ lattice, shadowField, cols, rows, previous = null, generation = 0 }) {
  const total = cols * rows;
  const denseCells = new Array(total).fill(null);
  const evidence = new Array(total).fill(null);

  const cellMap = lattice && lattice.cells instanceof Map ? lattice.cells : new Map();
  for (const cell of cellMap.values()) {
    const col = Number(cell?.col);
    const row = Number(cell?.row);
    if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= cols || row >= rows) continue;
    const index = (row * cols) + col;
    denseCells[index] = { color: cell.color, emphasis: cell.emphasis, occupied: true };
    evidence[index] = {
      snapStable: true,
      symmetryAgreement: cell.symmetrySource === 'original' ? 1 : 0.5,
      energy: clamp01(cell.emphasis),
    };
  }

  const currCells = buildCellSignatures(denseCells);
  const changedMask = diffCellSignatures(previous ? previous.cells : null, currCells);
  const committedMask = buildCommittedMask(evidence, { generation });
  const currShadow = shadowField instanceof Float64Array ? shadowField : Float64Array.from(shadowField || []);
  // Only compute shadow changes if we have a previous snapshot; first generation has no prior shadow
  const shadowMask = previous ? diffShadowField(previous.shadow, currShadow) : new Uint8Array(cols * rows);

  const frame = assemblePerceptionFrame({ changedMask, committedMask, shadowMask, rows, cols, generation });

  return { frame, snapshot: { cells: currCells, shadow: currShadow } };
}

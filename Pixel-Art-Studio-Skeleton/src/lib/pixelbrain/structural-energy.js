/**
 * STRUCTURAL ENERGY — the shared contract module (the one law)
 *
 * PDR SCHOL-ENC-PDR-STRUCT-ENERGY-LIFT-v1.0, §5:
 *   Structural energy is pre-normalized [0,1] = "fraction of spine depth".
 *   structuralEnergy(cell) = clamp( dist(cell) / R_part, 0, 1 )
 *
 * This is the single source of truth for the producer side: SketchAMP emits
 * its chamfer field through here as STRUCTURAL energy, and VolumeLiftAMP
 * consumes it. Normalized-at-the-source is the law — if raw pixel distance ever
 * leaks out, the consumer cannot recover R_part and the contract breaks.
 *
 * Pure + deterministic. No RNG.
 */

import { ENERGY_TYPES } from './voxel-volume.js';
import { clamp01 } from './shared.js';

export { ENERGY_TYPES };
export const STRUCTURAL_ENERGY_VERSION = '1.0.0';

const DIAG = Math.SQRT2;

/**
 * Two-pass chamfer distance transform: for each occupied cell, distance to the
 * nearest empty cell (ortho = 1, diagonal = √2).
 *
 * @param {Array<{x:number,y:number}>} cells - occupied cells
 * @param {{ width:number, height:number }} dims
 * @returns {Map<string, number>} "x,y" → distance (occupied cells only)
 */
export function chamferDistanceField(cells, dims) {
  const width = Math.max(1, Math.round(dims?.width || 1));
  const height = Math.max(1, Math.round(dims?.height || 1));
  const INF = 1e9;

  // Pad with a 1-cell empty border so distance-to-background is defined even
  // when the silhouette touches the canvas edge (the border ring is background).
  const gw = width + 2;
  const gh = height + 2;
  const grid = new Uint8Array(gw * gh);
  for (const cell of cells) {
    const x = Math.round(cell.x);
    const y = Math.round(cell.y);
    if (x >= 0 && x < width && y >= 0 && y < height) grid[(y + 1) * gw + (x + 1)] = 1;
  }

  const dist = new Float64Array(gw * gh);
  for (let i = 0; i < grid.length; i += 1) dist[i] = grid[i] ? INF : 0;

  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      const i = y * gw + x;
      if (!grid[i]) continue;
      let d = dist[i];
      if (x > 0) d = Math.min(d, dist[i - 1] + 1);
      if (y > 0) d = Math.min(d, dist[i - gw] + 1);
      if (x > 0 && y > 0) d = Math.min(d, dist[i - gw - 1] + DIAG);
      if (x < gw - 1 && y > 0) d = Math.min(d, dist[i - gw + 1] + DIAG);
      dist[i] = d;
    }
  }
  for (let y = gh - 1; y >= 0; y -= 1) {
    for (let x = gw - 1; x >= 0; x -= 1) {
      const i = y * gw + x;
      if (!grid[i]) continue;
      let d = dist[i];
      if (x < gw - 1) d = Math.min(d, dist[i + 1] + 1);
      if (y < gh - 1) d = Math.min(d, dist[i + gw] + 1);
      if (x < gw - 1 && y < gh - 1) d = Math.min(d, dist[i + gw + 1] + DIAG);
      if (x > 0 && y < gh - 1) d = Math.min(d, dist[i + gw - 1] + DIAG);
      dist[i] = d;
    }
  }

  const field = new Map();
  for (const cell of cells) {
    const x = Math.round(cell.x);
    const y = Math.round(cell.y);
    if (x >= 0 && x < width && y >= 0 && y < height) {
      field.set(`${x},${y}`, dist[(y + 1) * gw + (x + 1)]);
    }
  }
  return field;
}

/** Merge a STRUCTURAL energy value into a cell's energies list (preserving glow). */
function withStructuralEnergy(cell, value) {
  const others = (cell.energies || []).filter((e) => e.type !== ENERGY_TYPES.STRUCTURAL);
  return {
    ...cell,
    energies: [...others, { type: ENERGY_TYPES.STRUCTURAL, value }],
  };
}

/**
 * The one law. Annotate each cell with normalized STRUCTURAL energy, normalized
 * per part: e = clamp(dist / R_part, 0, 1), where R_part = max distance within
 * that part. Per-part normalization emits pure bulge shape, decoupled from
 * absolute thickness.
 *
 * @param {Array<{x:number,y:number,partId?:string}>} cells
 * @param {{ width:number, height:number }} dims
 * @returns {Array} new cells, each with STRUCTURAL energy in `energies`
 */
export function computeStructuralEnergy(cells = [], dims = {}) {
  const field = chamferDistanceField(cells, dims);

  // R_part = max distance within each part.
  const rPart = new Map();
  for (const cell of cells) {
    const partId = cell.partId ?? 'default';
    const d = field.get(`${Math.round(cell.x)},${Math.round(cell.y)}`) || 0;
    if (!rPart.has(partId) || d > rPart.get(partId)) rPart.set(partId, d);
  }

  return cells.map((cell) => {
    const partId = cell.partId ?? 'default';
    const d = field.get(`${Math.round(cell.x)},${Math.round(cell.y)}`) || 0;
    const R = rPart.get(partId) || 0;
    const e = R > 0 ? clamp01(d / R) : 0;
    return withStructuralEnergy(cell, e);
  });
}

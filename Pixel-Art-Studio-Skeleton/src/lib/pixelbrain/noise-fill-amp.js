/**
 * NOISE-FILL-AMP.js
 * Modulates material intensity or adds optional variation using PB-NOISE-v1 on existing lattice cells.
 * Does NOT add/remove required cells (per PDR). Only affects metadata/intensity for fills.
 */
import { hashString } from './shared.js';
import { createDeterministicNoise } from './deterministic-noise.js';

export const NOISE_FILL_AMP_ID = 'noise-fill';
export const NOISE_FILL_AMP_VERSION = '1.0.0';

function err(msg, ctx) { const e = new Error(`noise-fill-amp: ${msg}`); e.cause = ctx; return e; }

export function NoiseFillAMP(cellsOrFills = [], noiseDesc = {}, options = {}) {
  if (!noiseDesc || noiseDesc.contract !== 'PB-NOISE-v1') {
    return { fills: cellsOrFills, modulated: 0 };
  }
  const impl = createDeterministicNoise(noiseDesc);
  const seedBase = (noiseDesc.seed || 0) >>> 0;
  let modulated = 0;
  const out = (Array.isArray(cellsOrFills) ? cellsOrFills : (cellsOrFills.coordinates || [])).map((cell, idx) => {
    const x = cell.x || cell.snappedX || 0;
    const y = cell.y || cell.snappedY || 0;
    const n = impl.noise(x * (noiseDesc.frequency || 0.1), y * (noiseDesc.frequency || 0.1));
    const intensity = Math.max(0, Math.min(1, (n + 1) * 0.5 )); // assume [-1,1] -> [0,1] typical
    modulated++;
    return {
      ...cell,
      intensity: intensity, // for material ramps
      noiseValue: n,
      noiseId: noiseDesc.id,
    };
  });
  return { fills: out, modulated };
}

export const NOISE_FILL_AMP_SEAM = Object.freeze({
  id: 'noise-fill-v1',
  processor: NOISE_FILL_AMP_ID,
  version: NOISE_FILL_AMP_VERSION,
  consumes: ['fills.coordinates', 'silhouette.partOf', 'spec.parts'],
  emits: ['fills.coordinates'],
  mutates: ['fills.coordinates'],
  mergeContract: 'noise-intensity-after-region-fill-v1',
});

export default { NoiseFillAMP, id: NOISE_FILL_AMP_ID, seam: NOISE_FILL_AMP_SEAM };

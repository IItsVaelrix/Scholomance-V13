import { isCellOccupied, cellIndex } from './voxel-volume.js';
import { VoxelAuthority, VoxelOp, applyVoxelDeltas } from './voxel-delta.js';

export const HOLLOW_THRESHOLD = 0.4;
export const HOLLOW_ENERGY_MIN = 0.25;
export const PHI = 1.6180339887;

/**
 * Pure function. Computes a quasi-periodic hollowness value based on position
 * and iteration count. Uses golden ratio modulation for deterministic cavity patterns.
 * This is a spatial texture only — it must be gated by the energy field before
 * authorizing removal. Fibonacci spacing is influence, not authority.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} iterations
 * @returns {number} Float in [0, 1)
 */
export function computeHollownessAMP(x, y, z, iterations) {
  const dist = Math.sqrt(x * x + y * y + z * z);
  const value = (dist * PHI * iterations) % 1.0;
  return value;
}

/**
 * Builds a Set of "x,y,z" cell keys that must not be hollowed.
 * Locks the top `depthFromSurface` occupied Y layers of every (x,z) column,
 * protecting the visible surface crust from cavity punching.
 *
 * @param {Object} vol - VoxelVolume
 * @param {number} depthFromSurface - Number of Y layers from the surface to lock
 * @returns {Set<string>}
 */
export function buildSurfaceLockSet(vol, depthFromSurface = 2) {
  const locked = new Set();
  for (let z = 0; z < vol.depth; z++) {
    for (let x = 0; x < vol.width; x++) {
      let surfaceY = -1;
      for (let y = vol.height - 1; y >= 0; y--) {
        if (isCellOccupied(vol, x, y, z)) {
          surfaceY = y;
          break;
        }
      }
      if (surfaceY < 0) continue;
      for (let d = 0; d < depthFromSurface; d++) {
        const ly = surfaceY - d;
        if (ly >= 0) locked.add(`${x},${ly},${z}`);
      }
    }
  }
  return locked;
}

/**
 * Proposes hollowness removals as VoxelDeltas — does NOT mutate vol.
 *
 * Three gates must all pass for a cell to be proposed for removal:
 *   1. Energy gate: vol.energyField[cell] >= energyMin (low-energy cells are solid background)
 *   2. Surface lock: cell is not in the top `surfaceLockDepth` layers of its column
 *   3. PHI modulation: computeHollownessAMP value > HOLLOW_THRESHOLD
 *
 * @param {Object} vol - VoxelVolume with energyField already populated
 * @param {Object} options
 * @param {number} [options.iterations=3]
 * @param {number} [options.surfaceLockDepth=2]
 * @param {number} [options.energyMin=HOLLOW_ENERGY_MIN]
 * @returns {{ deltas: Array, surfaceLocked: Set<string> }}
 */
export function collectHollowDeltas(vol, options = {}) {
  const {
    iterations      = 3,
    surfaceLockDepth = 2,
    energyMin       = HOLLOW_ENERGY_MIN,
  } = options;

  const surfaceLocked = buildSurfaceLockSet(vol, surfaceLockDepth);
  const deltas = [];

  for (let y = 0; y < vol.height; y++) {
    for (let z = 0; z < vol.depth; z++) {
      for (let x = 0; x < vol.width; x++) {
        if (!isCellOccupied(vol, x, y, z)) continue;

        if (surfaceLocked.has(`${x},${y},${z}`)) continue;

        const energy = vol.energyField[cellIndex(vol, x, y, z)];
        if (energy < energyMin) continue;

        const hollownessValue = computeHollownessAMP(x, y, z, iterations);
        if (hollownessValue > HOLLOW_THRESHOLD) {
          deltas.push({
            x, y, z,
            op: VoxelOp.REMOVE_SOLID,
            source: VoxelAuthority.HOLLOW_AMP,
            reason: `phi:${hollownessValue.toFixed(3)},e:${energy.toFixed(3)}`,
          });
        }
      }
    }
  }

  return { deltas, surfaceLocked };
}

/**
 * Applies hollowness cavity punching to an occupied voxel volume via the
 * delta resolver. Mutates vol in place; returns vol.
 *
 * Accepts a numeric `iterations` argument for backward compatibility, or an
 * options object for full control.
 *
 * @param {Object} vol - VoxelVolume with energyField populated
 * @param {number|Object} optionsOrIterations
 * @returns {Object} vol
 */
export function applyHollownessAMP(vol, optionsOrIterations = {}) {
  const options = typeof optionsOrIterations === 'number'
    ? { iterations: optionsOrIterations }
    : optionsOrIterations;
  const { deltas, surfaceLocked } = collectHollowDeltas(vol, options);
  applyVoxelDeltas(vol, deltas, surfaceLocked);
  return vol;
}

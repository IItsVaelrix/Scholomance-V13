import { cellIndex, getCellMaterialId, setCellMaterial, isCellOccupied } from './voxel-volume.js';

export const NEGOTIATION_THRESHOLD = 0.05;
export const MAX_NEGOTIATION_PASSES = 100;

export function getNeighbors6(cell, volume) {
  const { x, y, z } = cell;
  return [
    [x + 1, y, z], [x - 1, y, z],
    [x, y + 1, z], [x, y - 1, z],
    [x, y, z + 1], [x, y, z - 1],
  ]
    .filter(([nx, ny, nz]) => isCellOccupied(volume, nx, ny, nz))
    .map(([nx, ny, nz]) => ({ x: nx, y: ny, z: nz, materialId: getCellMaterialId(volume, nx, ny, nz) }));
}

function majorityMaterial(cell, neighbors) {
  const counts = new Map();
  for (const n of neighbors) {
    counts.set(n.materialId, (counts.get(n.materialId) ?? 0) + 1);
  }
  let best = cell.materialId, bestCount = 0;
  counts.forEach((count, matId) => {
    if (count > bestCount || (count === bestCount && matId === cell.materialId)) {
      bestCount = count;
      best = matId;
    }
  });
  return best;
}

export function runBiomeCoherenceAMP(volume, field) {
  let unstable = true;
  let passes = 0;
  while (unstable && passes < MAX_NEGOTIATION_PASSES) {
    unstable = false;
    passes++;
    for (let y = 0; y < volume.height; y++) {
      for (let z = 0; z < volume.depth; z++) {
        for (let x = 0; x < volume.width; x++) {
          if (!isCellOccupied(volume, x, y, z)) continue;
          const cell = { x, y, z, materialId: getCellMaterialId(volume, x, y, z) };
          const neighbors = getNeighbors6(cell, volume);
          const qualified = neighbors.filter(
            n => Math.abs(field.energyAt(cell) - field.energyAt(n)) < NEGOTIATION_THRESHOLD
          );
          if (qualified.length === 0) continue;
          const majority = majorityMaterial(cell, qualified);
          if (majority !== cell.materialId) {
            setCellMaterial(volume, x, y, z, majority);
            cell.materialId = majority;
            unstable = true;
          }
        }
      }
    }
  }
}

// =====================================================================
// QBIT-Voxel Level 3 — chunk-aware biome coherence for ChunkedWorldVolume
// =====================================================================

/**
 * 6-neighbor offsets in chunk-local coordinates.
 * Used by runBiomeCoherenceAMPWorld to enumerate face-adjacent cells.
 */
const NEIGHBOR_OFFSETS_6 = Object.freeze([
  [ 1,  0,  0], [-1,  0,  0],
  [ 0,  1,  0], [ 0, -1,  0],
  [ 0,  0,  1], [ 0,  0, -1],
]);

/**
 * Encode chunk coordinates as the canonical Map key string. Duplicated from
 * chunked-world-volume.js to avoid a circular import (chunked-world-volume.js
 * is imported by chunks-seam-amp.js which is imported by the world pipeline
 * that calls runBiomeCoherenceAMPWorld).
 */
function chunkKeyFor(cx, cy, cz) {
  return `${cx},${cy},${cz}`;
}

/**
 * Parse a chunk key back into coordinates. Counterpart to chunkKeyFor.
 */
function parseChunkKeyFromString(key) {
  const parts = String(key).split(',');
  if (parts.length !== 3) {
    throw new TypeError(`Invalid chunk key: ${JSON.stringify(key)}`);
  }
  const [cx, cy, cz] = parts.map(Number);
  if (![cx, cy, cz].every(Number.isInteger)) {
    throw new TypeError(`Invalid chunk key (non-integer coordinate): ${JSON.stringify(key)}`);
  }
  return { cx, cy, cz };
}

/**
 * Chunk-aware biome coherence AMP for a ChunkedWorldVolume. Additive export;
 * the per-volume `runBiomeCoherenceAMP` is preserved unchanged.
 *
 * Strategy: same algorithm as `runBiomeCoherenceAMP`, extended to read
 * cross-chunk neighbor material from the live volume of already-generated
 * chunks. Already-generated chunks are stable across this call (only the
 * currently-processed chunk's volume is mutated within a pass), so reading
 * from them is safe. Within a single chunk, neighbor material is read from
 * the same chunk's live volume, allowing the same ripple effect that makes
 * the per-volume version converge in O(log n) passes.
 *
 * Convergence: identical to `runBiomeCoherenceAMP`. Each cell flip reduces
 * the "number of mismatched qualified-neighbor pairs" by at least 1. The
 * measure is bounded below by 0. The cap (`MAX_NEGOTIATION_PASSES`) is a
 * safety valve; well-formed seeds converge in 2-3 passes.
 *
 * @param {Object} world  ChunkedWorldVolume (must have at least one chunk)
 * @param {Function} getField  (cx, cy, cz, x, y, z) => number  Energy at a
 *   world-local chunk-coordinate cell. The function takes the chunk's
 *   coordinates plus the in-chunk coords so it can route to the right
 *   chunk's energyField.
 * @returns {{passes: number, stable: boolean}}
 */
export function runBiomeCoherenceAMPWorld(world, getField) {
  if (!world || typeof world !== 'object') {
    throw new TypeError('runBiomeCoherenceAMPWorld requires a ChunkedWorldVolume');
  }
  if (!(world.chunks instanceof Map) || world.chunks.size === 0) {
    throw new RangeError('runBiomeCoherenceAMPWorld requires at least one loaded chunk');
  }
  if (typeof getField !== 'function') {
    throw new TypeError('getField must be a function (cx, cy, cz, x, y, z) => number');
  }

  const { chunkSize } = world.spec;
  const W = chunkSize.w, H = chunkSize.h, D = chunkSize.d;

  /**
   * Read the material at a cell. For same-chunk cells, read from the live
   * volume (allows the ripple effect). For cross-chunk cells, read from the
   * neighbor's live volume (the neighbor is stable across this call). The
   * `x`, `y`, `z` coordinates can be out of the chunk's local bounds when
   * the cell is on a chunk boundary; we wrap via modular addressing to land
   * on the matching cell in the neighbor chunk.
   */
  function readMaterial(cx, cy, cz, x, y, z) {
    const key = chunkKeyFor(cx, cy, cz);
    const vol = world.chunks.get(key);
    if (!vol) return 0;
    const cxL = ((x % W) + W) % W;
    const cyL = ((y % H) + H) % H;
    const czL = ((z % D) + D) % D;
    return vol.cells[cyL * W * D + czL * W + cxL] >> 4;
  }

  let unstable = true;
  let passes = 0;
  while (unstable && passes < MAX_NEGOTIATION_PASSES) {
    unstable = false;
    passes++;
    // Deterministic chunk order: lexicographic on chunkKey.
    const sortedKeys = Array.from(world.chunks.keys()).sort();
    for (const key of sortedKeys) {
      const { cx, cy, cz } = parseChunkKeyFromString(key);
      const vol = world.chunks.get(key);
      for (let y = 0; y < H; y++) {
        for (let z = 0; z < D; z++) {
          for (let x = 0; x < W; x++) {
            if (!isCellOccupied(vol, x, y, z)) continue;
            const cellMat = readMaterial(cx, cy, cz, x, y, z);
            const cellEnergy = getField(cx, cy, cz, x, y, z);
            const qualified = [];
            for (const [dx, dy, dz] of NEIGHBOR_OFFSETS_6) {
              const nx = x + dx, ny = y + dy, nz = z + dz;
              let ncx = cx, ncy = cy, ncz = cz;
              if (nx < 0) ncx--;
              else if (nx >= W) ncx++;
              if (ny < 0) ncy--;
              else if (ny >= H) ncy++;
              if (nz < 0) ncz--;
              else if (nz >= D) ncz++;
              // Skip neighbors in chunks that aren't loaded.
              if (!world.chunks.has(chunkKeyFor(ncx, ncy, ncz))) continue;
              const nMat = readMaterial(ncx, ncy, ncz, nx, ny, nz);
              if (nMat === 0) continue;
              const nEnergy = getField(ncx, ncy, ncz, nx, ny, nz);
              if (Math.abs(cellEnergy - nEnergy) < NEGOTIATION_THRESHOLD) {
                qualified.push({ materialId: nMat });
              }
            }
            if (qualified.length === 0) continue;
            const majority = majorityMaterial({ materialId: cellMat }, qualified);
            if (majority !== cellMat) {
              setCellMaterial(vol, x, y, z, majority);
              unstable = true;
            }
          }
        }
      }
    }
  }
  return { passes, stable: !unstable };
}

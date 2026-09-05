/**
 * chunks-seam-amp.js — cross-chunk energy injection for ChunkedWorldVolume.
 *
 * Implements the seam AMP from QBIT-Voxel Level 3 PDR §3.1 F-4 and §3.3.
 * When a chunk is generated adjacent to an already-generated neighbor, the
 * neighbor's border cells are read and their energy values are injected into
 * the new chunk's seed list as ghost sources. After the new chunk's own
 * propagation, the energy field is continuous across the boundary.
 *
 * The seed-layer seam is solved by the formula type (PDR §3.4 continuity
 * principle): every Wand formula is a pure function of world coordinates,
 * so adjacent chunks evaluating the same formula in overlapping windows
 * produce identical seeds in the overlap zone. This module solves the
 * *energy-field* seam — the gap that remains because each chunk sums its
 * local seeds within its own volume.
 *
 * Default overlap radius: ⌊16φ⌋ = 26 cells (φ-scaled, per PDR §3.3).
 */

// PHI is defined locally to avoid a circular import with chunked-world-volume.js
// (which imports from this file). Both modules export the same value — see
// chunked-world-volume.js for the canonical definition.
const PHI = (1 + Math.sqrt(5)) / 2;

export const DEFAULT_OVERLAP_RADIUS = Math.floor(16 * PHI);  // 25

/**
 * Inject the energy from `neighbor`'s border cells into the new chunk's
 * seed list. Each cell in the overlap zone becomes a ghost seed with the
 * neighbor's energy value and energy type. The chunk's own propagation will
 * sum its own seeds with these ghost sources, producing a smooth gradient
 * across the boundary.
 *
 * The overlap zone is the rectangular region within `overlapRadius` cells
 * of the shared boundary, on the neighbor's side. We sample the neighbor's
 * energy field at the cell positions corresponding to the new chunk's
 * overlap region.
 *
 * Pure function: same input → same output, no mutation of either volume.
 *
 * @param {Object} newChunk  the chunk being generated; its energyField
 *   may be populated already (this function reads it for context) but the
 *   ghost seeds it returns will be summed in by the caller's propagation.
 * @param {Object} neighbor  an already-generated neighbor chunk
 * @param {Object} options
 * @param {number} options.overlapRadius  default 26 (φ-scaled)
 * @param {{dx: number, dy: number, dz: number}} options.direction  which
 *   side of the new chunk the neighbor is on. dx ∈ {-1, 0, 1} encodes
 *   -1 = neighbor is to the west, 0 = same column, 1 = east; same for
 *   dz in the Z axis. dy encodes vertical adjacency.
 * @param {number} [options.energyFloor=0.0]  skip cells below this energy
 * @returns {Array<{x, y, z, energy, energyType}>}  ghost seeds to add to
 *   the new chunk's seed list before its own propagation
 */
export function injectBorderEnergy(newChunk, neighbor, options = {}) {
  if (!newChunk || typeof newChunk !== 'object') {
    throw new TypeError('newChunk must be a VoxelVolume');
  }
  if (!neighbor || typeof neighbor !== 'object') {
    throw new TypeError('neighbor must be a VoxelVolume');
  }
  if (!options.direction
      || typeof options.direction.dx !== 'number'
      || typeof options.direction.dy !== 'number'
      || typeof options.direction.dz !== 'number') {
    throw new TypeError('options.direction must be {dx, dy, dz} in {-1, 0, 1}');
  }
  if (newChunk.width !== neighbor.width
      || newChunk.height !== neighbor.height
      || newChunk.depth !== neighbor.depth) {
    throw new RangeError('newChunk and neighbor must have identical dimensions');
  }
  const { dx, dy, dz } = options.direction;
  if (![-1, 0, 1].includes(dx) || ![-1, 0, 1].includes(dy) || ![-1, 0, 1].includes(dz)) {
    throw new RangeError('options.direction components must be in {-1, 0, 1}');
  }
  if (dx === 0 && dy === 0 && dz === 0) {
    throw new RangeError('options.direction cannot be {0, 0, 0} — no neighbor side specified');
  }

  const overlapRadius = options.overlapRadius ?? DEFAULT_OVERLAP_RADIUS;
  const energyFloor = options.energyFloor ?? 0.0;

  // Compute the overlap region in the new chunk's coordinate system.
  // The new chunk's "shared boundary" with the neighbor is one of its 6 faces.
  // The overlap region is a slab of `overlapRadius` cells adjacent to that
  // face, on the new chunk's side. The neighbor's contribution is the
  // corresponding cells on the neighbor's opposite face (i.e., mirrored).
  const overlapCells = computeOverlapCells(newChunk, neighbor, { dx, dy, dz, overlapRadius });

  // Convert the neighbor's energyField at those positions into ghost seeds
  // for the new chunk.
  const ghostSeeds = [];
  for (const { x, y, z, nx, ny, nz } of overlapCells) {
    const nIdx = ny * neighbor.width * neighbor.depth + nz * neighbor.width + nx;
    const neighborEnergy = neighbor.energyField[nIdx];
    if (neighborEnergy <= energyFloor) continue;
    const neighborType = neighbor.energyTypes[nIdx];
    ghostSeeds.push({
      x, y, z,
      energy: neighborEnergy,
      energyType: neighborType,
    });
  }

  return ghostSeeds;
}

/**
 * Compute the (x, y, z) → (nx, ny, nz) cell pairs that span the overlap
 * region between two adjacent chunks. Pure function.
 *
 * The new chunk's overlap region is **only the boundary row** of the face
 * that touches the neighbor — NOT a `overlapRadius`-cell-deep slab. This
 * is the saturation guard: a 25-cell-deep slab of ghost seeds would
 * dominate the chunk's own seeds and saturate the energy field. The single
 * boundary row carries the neighbor's energy at the seam; the chunk's own
 * propagation then smooths the gradient inward from there. The PDR's
 * "φ-scaled overlap" parameter is retained for future tuning (e.g., for
 * non-inverse-square attenuation models where deeper overlap helps), but
 * in Phase 2 the implementation injects only the boundary row.
 *
 * The neighbor's corresponding cells are on its opposite face (mirrored
 * across the shared boundary).
 *
 * @returns {Array<{x, y, z, nx, ny, nz}>}
 */
function computeOverlapCells(newChunk, neighbor, { dx, dy, dz, overlapRadius }) {
  const cells = [];
  const W = newChunk.width;
  const H = newChunk.height;
  const D = newChunk.depth;
  // overlapRadius is preserved in the signature for forward compatibility
  // (future tuning), but only the boundary row is emitted in Phase 2.
  void overlapRadius;

  // Helper: does the given (x, y, z) fall on the boundary row adjacent to
  // the neighbor? Exactly one cell deep along the neighbor's axis.
  function inBoundaryRow(x, y, z) {
    if (dx === -1 && x === 0) return true;
    if (dx === 1 && x === W - 1) return true;
    if (dy === -1 && y === 0) return true;
    if (dy === 1 && y === H - 1) return true;
    if (dz === -1 && z === 0) return true;
    if (dz === 1 && z === D - 1) return true;
    return false;
  }

  // Mirror the (x, y, z) position into the neighbor's coordinate system.
  function mirrorToNeighbor(x, y, z) {
    let nx = x;
    let ny = y;
    let nz = z;
    if (dx === -1) nx = W - 1 - x;
    else if (dx === 1) nx = W - 1 - x;
    if (dy === -1) ny = H - 1 - y;
    else if (dy === 1) ny = H - 1 - y;
    if (dz === -1) nz = D - 1 - z;
    if (dz === 1) nz = D - 1 - z;
    return { nx, ny, nz };
  }

  for (let y = 0; y < H; y++) {
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        if (!inBoundaryRow(x, y, z)) continue;
        const { nx, ny, nz } = mirrorToNeighbor(x, y, z);
        cells.push({ x, y, z, nx, ny, nz });
      }
    }
  }
  return cells;
}

/**
 * Convenience: inject border energy from all 6 face-adjacent already-
 * generated neighbors. Returns a flat list of ghost seeds from all
 * neighbors combined.
 *
 * @param {Object} newChunk
 * @param {Object} newChunk.energyField  the new chunk's energy field (read-only here)
 * @param {Function} getNeighbor  (dx, dy, dz) => VoxelVolume | null
 * @param {Object} [options]
 * @param {number} [options.overlapRadius=26]
 * @param {number} [options.energyFloor=0.0]
 * @returns {Array}
 */
export function injectAllBorderEnergies(newChunk, getNeighbor, options = {}) {
  if (typeof getNeighbor !== 'function') {
    throw new TypeError('getNeighbor must be a function');
  }
  const ghostSeeds = [];
  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) {
      for (const dz of [-1, 0, 1]) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const neighbor = getNeighbor(dx, dy, dz);
        if (!neighbor) continue;
        const seeds = injectBorderEnergy(newChunk, neighbor, {
          ...options,
          direction: { dx, dy, dz },
        });
        ghostSeeds.push(...seeds);
      }
    }
  }
  return ghostSeeds;
}

/**
 * ChunkedWorldVolume — multi-chunk world address on top of VoxelVolume.
 *
 * Implements QBIT-Voxel Level 3 (The World). The world is a Map<"cx,cy,cz",
 * VoxelVolume> of lazily-generated chunks. Generation is deterministic from
 * `(spec, chunkCoords)`; cross-chunk energy propagation uses the φ-scaled
 * overlap radius to dissolve the energy-field seam.
 *
 * Seed-layer continuity is a property of the formula type (see PDR §3.4):
 * every Wand formula is a pure function of world coordinates, so adjacent
 * chunks evaluating the same formula in overlapping windows produce identical
 * seeds in the overlap zone. The energy-field continuity is what this module
 * addresses — see `chunks-seam-amp.js`.
 *
 * PB-WORLD-v1 packet contract. Backward-compatible with PB-VOLUME-v1: any
 * single chunk is a valid VoxelVolume consumable by Level 1 / Level 2 paths.
 */

import { fnv1a32Hex } from './shared.js';
import { createVoxelVolume, cellIndex, setCellMaterial, ENERGY_TYPES } from './voxel-volume.js';
import { generateCompositeSeeds, generateFibonacciSeeds } from './wand-seed-lift.js';
import { propagate, assignMaterial } from './qbit-field.js';
import { injectAllBorderEnergies } from './chunks-seam-amp.js';
import { collectHollowDeltas } from './hollowness-amp.js';
import { applyVoxelDeltas } from './voxel-delta.js';

export const PHI = (1 + Math.sqrt(5)) / 2;

/** Default overlap radius: φ-scaled, ⌊16φ⌋ = 25 cells. */
export const DEFAULT_OVERLAP_RADIUS = Math.floor(16 * PHI);  // 25

/** Default attenuation model for Level 3. */
export const DEFAULT_ATTENUATION_MODEL = 'inverse_square';

/** Valid attenuation models. */
export const ATTENUATION_MODELS = Object.freeze(['gaussian', 'inverse_square', 'phi_attenuation']);

/** Valid region shapes for the composite formula grammar. */
export const REGION_SHAPES = Object.freeze(['rect', 'voronoi']);

/** Chunk-size constraints (mirrored by assertChunkedWorldVolume). */
export const CHUNK_SIZE_MIN = 8;
export const CHUNK_SIZE_MAX = 128;
export const CHUNK_COUNT_MIN = 1;

/** FNV-1a 32-bit hex (matches the language white paper §4.1) — shared canonical implementation. */
const fnv1a8Hex = fnv1a32Hex;

/** Canonicalize a JSON-serializable value: sort object keys, recurse. */
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

/**
 * Check whether `n` is a power of two (positive integer).
 * Powers of two in [CHUNK_SIZE_MIN, CHUNK_SIZE_MAX]: 8, 16, 32, 64, 128.
 */
function isPowerOfTwo(n) {
  if (!Number.isInteger(n) || n <= 0) return false;
  return (n & (n - 1)) === 0;
}

/**
 * Validate a formula's `region` field shape and overlap invariant.
 * Pure function; throws on invalid input.
 */
export function assertFormulaRegions(formula) {
  if (!formula || typeof formula !== 'object') {
    throw new TypeError('Formula must be an object');
  }
  if (formula.type === 'composite') {
    if (!Array.isArray(formula.children) || formula.children.length === 0) {
      throw new RangeError('Composite formula must declare at least one child region');
    }
    // Check region overlap: rect/rect overlap test.
    const rects = [];
    for (let i = 0; i < formula.children.length; i++) {
      const child = formula.children[i];
      if (!child.region) {
        throw new RangeError(`Composite child ${i} is missing required "region" field`);
      }
      const r = child.region;
      if (r && typeof r === 'object' && 'x' in r && 'z' in r && 'width' in r && 'depth' in r) {
        rects.push({ i, x: r.x, z: r.z, w: r.width, d: r.depth });
      }
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const overlap = (
          a.x < b.x + b.w &&
          a.x + a.w > b.x &&
          a.z < b.z + b.d &&
          a.z + a.d > b.z
        );
        if (overlap) {
          throw new RangeError(
            `Composite formula regions ${i} and ${j} overlap; PB-ERR-v1-FORMULA-CR-COMPOSITE-OVERLAP-0001`
          );
        }
      }
    }
  }
}

/**
 * Runtime type guard for a ChunkedWorldVolume. Loud failure on invalid input.
 * Returns `true` on success, throws on failure.
 *
 * Rejects (with explicit messages):
 *   - non-object input
 *   - missing contract field
 *   - chunkSize dimensions outside [8, 128] or not power of two
 *   - chunkCount < 1 in any axis
 *   - overlapRadius < 0 or non-integer
 *   - attenuationModel not in the registered set
 *   - formula passing the overlap check
 */
export function assertChunkedWorldVolume(world) {
  if (!world || typeof world !== 'object') {
    throw new TypeError('ChunkedWorldVolume must be a non-null object');
  }
  if (world.contract !== 'PB-WORLD-v1') {
    throw new TypeError(`ChunkedWorldVolume contract must be "PB-WORLD-v1", got ${JSON.stringify(world.contract)}`);
  }
  if (!world.spec || typeof world.spec !== 'object') {
    throw new TypeError('ChunkedWorldVolume.spec must be an object');
  }
  const { spec } = world;
  const { chunkSize, chunkCount, formula, seed, overlapRadius, attenuationModel } = spec;

  if (!chunkSize || typeof chunkSize !== 'object') {
    throw new TypeError('spec.chunkSize must be an object');
  }
  for (const axis of ['w', 'h', 'd']) {
    const v = chunkSize[axis];
    if (!Number.isInteger(v) || v < CHUNK_SIZE_MIN || v > CHUNK_SIZE_MAX || !isPowerOfTwo(v)) {
      throw new RangeError(
        `spec.chunkSize.${axis} must be a power of two in [${CHUNK_SIZE_MIN}, ${CHUNK_SIZE_MAX}], got ${v}`
      );
    }
  }

  if (!chunkCount || typeof chunkCount !== 'object') {
    throw new TypeError('spec.chunkCount must be an object');
  }
  for (const axis of ['x', 'y', 'z']) {
    const v = chunkCount[axis];
    if (!Number.isInteger(v) || v < CHUNK_COUNT_MIN) {
      throw new RangeError(`spec.chunkCount.${axis} must be an integer ≥ ${CHUNK_COUNT_MIN}, got ${v}`);
    }
  }

  if (!Number.isInteger(seed)) {
    throw new TypeError(`spec.seed must be an integer, got ${seed}`);
  }

  if (overlapRadius !== undefined) {
    if (!Number.isInteger(overlapRadius) || overlapRadius < 0) {
      throw new RangeError(`spec.overlapRadius must be a non-negative integer, got ${overlapRadius}`);
    }
  }

  if (attenuationModel !== undefined && !ATTENUATION_MODELS.includes(attenuationModel)) {
    throw new RangeError(
      `spec.attenuationModel must be one of ${ATTENUATION_MODELS.join(', ')}, got ${JSON.stringify(attenuationModel)}`
    );
  }

  if (formula !== undefined && formula !== null) {
    assertFormulaRegions(formula);
  }

  if (!(world.chunks instanceof Map)) {
    throw new TypeError('ChunkedWorldVolume.chunks must be a Map');
  }

  return true;
}

/**
 * Create a new empty ChunkedWorldVolume from a spec.
 * No chunks are generated at creation time. Use `getOrLoadChunk` to lazy-load.
 *
 * @param {Object} spec
 * @param {{w: number, h: number, d: number}} spec.chunkSize  power of two, 8..128
 * @param {{x: number, y: number, z: number}} spec.chunkCount  each ≥ 1
 * @param {Object} spec.formula  Wand formula (validated by assertFormulaRegions)
 * @param {number} spec.seed  integer seed
 * @param {number} [spec.overlapRadius=26]  φ-scaled default ⌊16φ⌋
 * @param {string} [spec.attenuationModel='inverse_square']
 * @param {Object} [spec.energyTypeMix]  optional, reserved for Level 5
 * @returns {ChunkedWorldVolume}
 */
export function createChunkedWorldVolume(spec) {
  // Validate the parts we can check without a `world` object yet.
  if (!spec || typeof spec !== 'object') {
    throw new TypeError('spec must be an object');
  }
  const { chunkSize, chunkCount, formula, seed } = spec;
  if (!chunkSize || !chunkCount) {
    throw new TypeError('spec.chunkSize and spec.chunkCount are required');
  }
  for (const axis of ['w', 'h', 'd']) {
    const v = chunkSize[axis];
    if (!Number.isInteger(v) || v < CHUNK_SIZE_MIN || v > CHUNK_SIZE_MAX || !isPowerOfTwo(v)) {
      throw new RangeError(
        `spec.chunkSize.${axis} must be a power of two in [${CHUNK_SIZE_MIN}, ${CHUNK_SIZE_MAX}], got ${v}`
      );
    }
  }
  for (const axis of ['x', 'y', 'z']) {
    const v = chunkCount[axis];
    if (!Number.isInteger(v) || v < CHUNK_COUNT_MIN) {
      throw new RangeError(`spec.chunkCount.${axis} must be an integer ≥ ${CHUNK_COUNT_MIN}, got ${v}`);
    }
  }
  if (!Number.isInteger(seed)) {
    throw new TypeError(`spec.seed must be an integer, got ${seed}`);
  }
  if (formula !== undefined) {
    assertFormulaRegions(formula);
  }

  const overlapRadius = spec.overlapRadius ?? DEFAULT_OVERLAP_RADIUS;
  const attenuationModel = spec.attenuationModel ?? DEFAULT_ATTENUATION_MODEL;

  // Canonicalize spec for fingerprinting.
  const normalizedSpec = Object.freeze({
    contract: 'PB-WORLD-v1',
    schemaVersion: '1.0.0',
    chunkSize: { ...chunkSize },
    chunkCount: { ...chunkCount },
    formula: formula === undefined ? null : JSON.parse(canonicalize(formula)),
    seed,
    overlapRadius,
    attenuationModel,
    energyTypeMix: spec.energyTypeMix ? { ...spec.energyTypeMix } : null,
  });

  const fingerprint = fnv1a8Hex(canonicalize(normalizedSpec));
  const checksum = fnv1a8Hex(fingerprint);

  const world = {
    contract: 'PB-WORLD-v1',
    schemaVersion: '1.0.0',
    spec: normalizedSpec,
    chunks: new Map(),
    worldEnergyField: null,  // sparse, lazily assembled
    fingerprint,
    checksum,
  };

  assertChunkedWorldVolume(world);
  return world;
}

/**
 * Encode chunk coordinates as the canonical Map key string.
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 * @returns {string}
 */
export function chunkKey(cx, cy, cz) {
  return `${cx},${cy},${cz}`;
}

/**
 * Decode a chunk key string back into coordinates.
 * @param {string} key
 * @returns {{cx: number, cy: number, cz: number}}
 */
export function parseChunkKey(key) {
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
 * Step 1.3 (PDR): getOrLoadChunk without cross-chunk propagation.
 *
 * Returns the existing chunk if it has been generated; otherwise generates a
 * new VoxelVolume for the chunk and caches it. Generation is deterministic
 * from `(spec, chunkCoords)`; this is the F-2 / F-3 acceptance test target.
 *
 * Cross-chunk energy propagation (`injectBorderEnergy`) is added by
 * `chunks-seam-amp.js` and called from the world pipeline, not from here.
 * Step 1.3 establishes the lazy-load and idempotence contract first; the
 * seam AMP is layered on top in Step 1.5.
 *
 * @param {ChunkedWorldVolume} world
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 * @param {Function} generateChunkFn  (world, cx, cy, cz) => VoxelVolume
 * @returns {VoxelVolume}
 */
export function getOrLoadChunk(world, cx, cy, cz, generateChunkFn) {
  assertChunkedWorldVolume(world);
  if (!Number.isInteger(cx) || !Number.isInteger(cy) || !Number.isInteger(cz)) {
    throw new TypeError('Chunk coordinates must be integers');
  }
  if (typeof generateChunkFn !== 'function') {
    throw new TypeError('generateChunkFn must be a function');
  }

  const key = chunkKey(cx, cy, cz);
  if (world.chunks.has(key)) {
    return world.chunks.get(key);
  }

  const volume = generateChunkFn(world, cx, cy, cz);
  if (!volume || typeof volume !== 'object') {
    throw new TypeError(`generateChunkFn must return a VoxelVolume, got ${typeof volume}`);
  }
  if (volume.width !== world.spec.chunkSize.w
      || volume.height !== world.spec.chunkSize.h
      || volume.depth !== world.spec.chunkSize.d) {
    throw new RangeError(
      `generateChunkFn returned volume with dimensions `
      + `(${volume.width}x${volume.height}x${volume.depth}) `
      + `but spec.chunkSize is `
      + `(${world.spec.chunkSize.w}x${world.spec.chunkSize.h}x${world.spec.chunkSize.d})`
    );
  }

  world.chunks.set(key, volume);
  return volume;
}

/**
 * Generate an empty VoxelVolume of the spec's chunk size. Used as a no-op
 * chunk generator for tests, and as a building block by the full pipeline.
 * @param {ChunkedWorldVolume} world
 * @returns {VoxelVolume}
 */
export function generateEmptyChunk(world) {
  const { w, h, d } = world.spec.chunkSize;
  return createVoxelVolume(w, h, d);
}

// =====================================================================
// QBIT-Voxel Level 3 Phase 4 — Material-aware boundary alignment
// =====================================================================

/**
 * Material-aware boundary alignment. The energy-field seam (Phase 1's
 * `injectAllBorderEnergies`) closes the energy gradient across chunk
 * boundaries, but material assignment uses discrete thresholds — a small
 * energy difference at the boundary can flip the material, so two adjacent
 * chunks can disagree on the material at their shared face.
 *
 * The fix: post-process pass that forces the material at the boundary row
 * of both adjacent chunks to be the lex-min chunk's material. The boundary
 * is now guaranteed to be identical on both sides by construction.
 *
 * For each pair of adjacent chunks sharing a face:
 *   1. Read the material at the boundary row of each chunk
 *   2. Pick the canonical material (lex-min chunk's material, or the
 *      non-empty material if one side is hollow)
 *   3. Write the canonical material to BOTH sides' boundary cells
 *
 * Mutates the world in place. The biome-coherence AMP that follows this
 * pass sees the aligned boundary, so the snapshot-free convergence
 * guarantee from Phase 2 is preserved.
 *
 * @param {ChunkedWorldVolume} world
 */
export function applyMaterialBoundaryAlignment(world) {
  assertChunkedWorldVolume(world);
  const { chunkSize, chunkCount } = world.spec;
  const W = chunkSize.w, H = chunkSize.h, D = chunkSize.d;

  // 6 face directions. The boundary row is at index 0 (or W-1, H-1, D-1).
  // For each face, the neighbor chunk is at offset (dx, dy, dz) from this chunk.
  const FACES = [
    { dx: 1,  dy: 0,  dz: 0,  axis: 'x', boundary: W - 1 },
    { dx: -1, dy: 0,  dz: 0,  axis: 'x', boundary: 0 },
    { dx: 0,  dy: 1,  dz: 0,  axis: 'y', boundary: H - 1 },
    { dx: 0,  dy: -1, dz: 0,  axis: 'y', boundary: 0 },
    { dx: 0,  dy: 0,  dz: 1,  axis: 'z', boundary: D - 1 },
    { dx: 0,  dy: 0,  dz: -1, axis: 'z', boundary: 0 },
  ];

  for (const [key, vol] of world.chunks) {
    const { cx, cy, cz } = parseChunkKey(key);
    for (const face of FACES) {
      const ncx = cx + face.dx, ncy = cy + face.dy, ncz = cz + face.dz;
      if (ncx < 0 || ncx >= chunkCount.x) continue;
      if (ncy < 0 || ncy >= chunkCount.y) continue;
      if (ncz < 0 || ncz >= chunkCount.z) continue;
      const neighborKey = chunkKey(ncx, ncy, ncz);
      const neighbor = world.chunks.get(neighborKey);
      if (!neighbor) continue;

      // Lex-min: the chunk with the smaller (cx, cy, cz) is the owner.
      // The owner decides the boundary material. If the owner is empty at
      // a given cell, fall back to the non-owner's material.
      const ownerIsThis = isLexMin(cx, cy, cz, ncx, ncy, ncz);
      const ownerVol = ownerIsThis ? vol : neighbor;
      const otherVol = ownerIsThis ? neighbor : vol;

      for (let y = 0; y < H; y++) {
        for (let z = 0; z < D; z++) {
          for (let x = 0; x < W; x++) {
            // Only touch cells on the boundary row of THIS chunk
            if (face.axis === 'x' && x !== face.boundary) continue;
            if (face.axis === 'y' && y !== face.boundary) continue;
            if (face.axis === 'z' && z !== face.boundary) continue;

            const thisIdx = y * W * D + z * W + x;
            // Compute the neighbor's local coords for the matching cell
            const nx = face.axis === 'x' ? (face.dx === 1 ? 0 : W - 1) : x;
            const ny = face.axis === 'y' ? (face.dy === 1 ? 0 : H - 1) : y;
            const nz = face.axis === 'z' ? (face.dz === 1 ? 0 : D - 1) : z;
            const neighborIdx = ny * W * D + nz * W + nx;

            const ownerMat = ownerVol.cells[ownerIsThis ? thisIdx : neighborIdx] >> 4;
            const otherMat = otherVol.cells[ownerIsThis ? neighborIdx : thisIdx] >> 4;
            const canonical = ownerMat > 0 ? ownerMat : otherMat;
            if (canonical === 0) continue;

            vol.cells[thisIdx] = (canonical << 4) | (vol.cells[thisIdx] & 0xF);
            neighbor.cells[neighborIdx] = (canonical << 4) | (neighbor.cells[neighborIdx] & 0xF);
          }
        }
      }
    }
  }
}

/**
 * Lex-min comparison for chunk coordinates. Returns true if (cx, cy, cz)
 * is lexicographically ≤ (ncx, ncy, ncz).
 */
function isLexMin(cx, cy, cz, ncx, ncy, ncz) {
  if (cx !== ncx) return cx < ncx;
  if (cy !== ncy) return cy < ncy;
  return cz < ncz;
}

// =====================================================================
// QBIT-Voxel Level 3 — full chunk pipeline (Step 2.2)
// =====================================================================

/**
 * Build the chunk's seed list in world coordinates. If the spec has a
 * composite formula, distribute seeds across the formula's regions. If the
 * spec has a single (non-composite) formula, use generateFibonacciSeeds at
 * the chunk's window.
 *
 * Returns a flat array of `{x, y, z, energy, energyType}` ready for `propagate`.
 *
 * @param {Object} world
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 * @returns {Array<{x, y, z, energy, energyType}>}
 */
function buildChunkSeeds(world, cx, cy, cz) {
  const { w, h, d } = world.spec.chunkSize;
  const volume = createVoxelVolume(w, h, d);
  const { formula } = world.spec;
  const x0 = cx * w, z0 = cz * d;
  const x1 = x0 + w, z1 = z0 + d;
  const chunkWindow = { x0, z0, x1, z1 };

  if (formula && formula.type === 'composite') {
    const vxSeeds = generateCompositeSeeds(formula, chunkWindow, volume, { initialEnergy: 1.0 });
    return vxSeeds.map(s => ({
      x: s.vx, y: s.vy, z: s.vz,
      energy: s.energy,
      energyType: s.energyType,
    }));
  }

  // Single (non-composite) formula path: Fibonacci only for Level 3 MVP.
  // Other formula types (fractal_iter, parametric_curve, etc.) are out of
  // scope for Step 2.2 and follow-up work.
  if (formula && formula.type !== 'fibonacci') {
    throw new RangeError(
      `Non-composite, non-fibonacci formula type "${formula.type}" is not yet supported in generateWorldChunk. ` +
      `Use a "composite" formula with a "fibonacci" child, or a top-level "fibonacci" formula.`
    );
  }
  const fibFormula = formula ?? { iterations: 6, scale: 0.75 };
  const vxSeeds = generateFibonacciSeeds(fibFormula, volume, { initialEnergy: 1.0 });
  return vxSeeds.map(s => ({
    x: s.vx, y: s.vy, z: s.vz,
    energy: s.energy,
    energyType: ENERGY_TYPES.STRUCTURAL,
  }));
}

/**
 * Look up an already-generated neighbor chunk by (dx, dy, dz) relative to
 * (cx, cy, cz). Returns null if the neighbor is out of the world's chunk
 * range or hasn't been generated yet.
 */
function getGeneratedNeighbor(world, cx, cy, cz, dx, dy, dz) {
  const ncx = cx + dx, ncy = cy + dy, ncz = cz + dz;
  if (ncx < 0 || ncx >= world.spec.chunkCount.x) return null;
  if (ncy < 0 || ncy >= world.spec.chunkCount.y) return null;
  if (ncz < 0 || ncz >= world.spec.chunkCount.z) return null;
  return world.chunks.get(chunkKey(ncx, ncy, ncz)) ?? null;
}

/**
 * Full chunk pipeline (Step 2.2). Produces a populated VoxelVolume for the
 * chunk at (cx, cy, cz), using the QBIT-Voxel 8-step pipeline at chunk scope:
 *
 *   1. Build composite seeds in the chunk's world window
 *   2. Inject border energy from already-generated neighbors (ghost seeds)
 *   3. Single `propagate` call with all seeds (own + ghost), with the spec's
 *      `attenuationModel` and `maxRadius = overlapRadius`
 *   4. Assign materials from the energy field
 *   5. Apply HollownessAMP
 *
 * `runBiomeCoherenceAMPWorld` is a separate pass at the world level (Step 2.3)
 * because the snapshot-based read-set needs all chunks loaded before it can
 * settle material assignments without cross-chunk oscillation.
 *
 * Pure function: no mutation of `world` other than the implicit cache write
 * that `getOrLoadChunk` performs after the generator returns.
 *
 * @param {ChunkedWorldVolume} world
 * @param {number} cx
 * @param {number} cy
 * @param {number} cz
 * @returns {VoxelVolume}
 */
export function generateWorldChunk(world, cx, cy, cz) {
  assertChunkedWorldVolume(world);
  if (!Number.isInteger(cx) || !Number.isInteger(cy) || !Number.isInteger(cz)) {
    throw new TypeError('Chunk coordinates must be integers');
  }

  const { w, h, d } = world.spec.chunkSize;
  const { overlapRadius, attenuationModel } = world.spec;
  const volume = createVoxelVolume(w, h, d);

  // Step 1: own seeds from the global formula
  const ownSeeds = buildChunkSeeds(world, cx, cy, cz);

  // Step 2: ghost seeds from already-generated neighbors (the seam AMP)
  // Note: the seam AMP reads the neighbor's `energyField` (which is set
  // before this call by the previously-generated neighbor's `propagate`).
  // We build a `getNeighbor` closure that respects world boundaries.
  const getNeighbor = (dx, dy, dz) => getGeneratedNeighbor(world, cx, cy, cz, dx, dy, dz);
  // Use a stub volume (the seam AMP only reads the neighbor's energyField
  // and energyTypes, and its own size — pass the volume so dimensions match).
  const ghostSeeds = injectAllBorderEnergies(volume, getNeighbor, {
    overlapRadius,
    energyFloor: 0.0,
  });

  // Step 3: single propagate call with all seeds
  const allSeeds = [...ownSeeds, ...ghostSeeds];
  const field = propagate(allSeeds, w, h, d, {
    attenuationModel,
    maxRadius: overlapRadius,
    iterations: 3,
  });

  // Step 4: material assignment from energy field
  for (let y = 0; y < h; y++) {
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const energy = field.energyAt(x, y, z);
        volume.energyField[cellIndex(volume, x, y, z)] = energy;
        setCellMaterial(volume, x, y, z, assignMaterial(energy));
      }
    }
  }

  // Step 5: HollownessAMP — proposed removals resolved through authority table.
  // Energy field must be populated (step 4) before this runs.
  // Crystal context: no surface lock, no energy floor (same as qbit-world-game-loop).
  const { deltas: hollowDeltas, surfaceLocked } = collectHollowDeltas(volume, {
    iterations: 3,
    surfaceLockDepth: 0,
    energyMin: 0,
  });
  applyVoxelDeltas(volume, hollowDeltas, surfaceLocked);

  // Surface the chunk's own seeds (chunk-local coords) so consumers can build
  // a glow/lighting cue from energy sources. Ghost seeds are excluded — they
  // belong to neighbors and would double-light the seam.
  volume.seeds = ownSeeds;

  return volume;
}

/**
 * Gather every loaded chunk's own seeds, lifted from chunk-local coordinates
 * into world coordinates (local + chunk origin). Chunks without seeds (e.g.
 * deserialized volumes) contribute nothing. Used to drive the WorldScenePortal
 * glow cue.
 */
export function collectWorldSeeds(world) {
  assertChunkedWorldVolume(world);
  const { w, h, d } = world.spec.chunkSize;
  const out = [];
  for (const [key, vol] of world.chunks) {
    const { cx, cy, cz } = parseChunkKey(key);
    for (const s of (vol.seeds ?? [])) {
      out.push({ x: s.x + cx * w, y: s.y + cy * h, z: s.z + cz * d, energy: s.energy });
    }
  }
  return out;
}

/**
 * Serialize a ChunkedWorldVolume to a plain JSON-safe object.
 * Maps are converted to arrays of [key, value] pairs (per the JSON spec).
 */
export function serializeChunkedWorldVolume(world) {
  assertChunkedWorldVolume(world);
  return {
    contract: world.contract,
    schemaVersion: world.schemaVersion,
    spec: world.spec,
    chunks: Array.from(world.chunks.entries()).map(([key, vol]) => [key, {
      width: vol.width,
      height: vol.height,
      depth: vol.depth,
      cells: Array.from(vol.cells),
      energyField: Array.from(vol.energyField),
      energyTypes: Array.from(vol.energyTypes),
    }]),
    fingerprint: world.fingerprint,
    checksum: world.checksum,
  };
}

/**
 * Deserialize a JSON-safe object back into a ChunkedWorldVolume.
 */
export function deserializeChunkedWorldVolume(obj) {
  if (!obj || typeof obj !== 'object' || obj.contract !== 'PB-WORLD-v1') {
    throw new TypeError('Serialized object is not a PB-WORLD-v1');
  }
  const world = createChunkedWorldVolume({
    chunkSize: obj.spec.chunkSize,
    chunkCount: obj.spec.chunkCount,
    formula: obj.spec.formula,
    seed: obj.spec.seed,
    overlapRadius: obj.spec.overlapRadius,
    attenuationModel: obj.spec.attenuationModel,
    energyTypeMix: obj.spec.energyTypeMix,
  });
  for (const [key, vol] of obj.chunks) {
    const v = {
      width: vol.width,
      height: vol.height,
      depth: vol.depth,
      cells: new Uint16Array(vol.cells),
      energyField: new Float32Array(vol.energyField),
      energyTypes: new Uint8Array(vol.energyTypes),
    };
    world.chunks.set(key, v);
  }
  return world;
}

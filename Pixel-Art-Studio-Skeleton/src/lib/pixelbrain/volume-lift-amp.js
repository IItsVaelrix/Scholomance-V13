/**
 * VOLUME-LIFT AMP — Structural-Energy → True 3D Voxel Volume
 *
 * The consumer half of the Structural-Energy Lift contract
 * (PDR SCHOL-ENC-PDR-STRUCT-ENERGY-LIFT-v1.0). Reads pre-normalized STRUCTURAL
 * energy ([0,1] = "fraction of spine depth") and transduces it into per-part
 * voxel depth, emitting voxels symmetric about z = 0 into a `voxel-volume`.
 *
 * Pure + deterministic. No RNG.
 *
 * Naming note: distinct from the legacy `volume-amp.js` (a 2D colour/value
 * reshaping pass). This module is the geometry lift.
 */

import {
  ENERGY_TYPES,
  createVoxelVolume,
  setCellMaterial,
  cellIndex,
} from './voxel-volume.js';
import { computeStructuralEnergy } from './structural-energy.js';

export const VOLUME_LIFT_AMP_ID = 'pixelbrain.volume-lift-amp';
export const VOLUME_LIFT_AMP_VERSION = '1.0.0';

const DEFAULT_STEPS = 4;

/**
 * Energy → [0,1] depth-fraction curves. The art-direction knob (per-part).
 * @type {Record<string, (e:number, steps:number) => number>}
 */
export const VOLUME_LIFT_PROFILES = Object.freeze({
  flat: () => 1,
  bevel: (e) => e,
  round: (e) => Math.sqrt(Math.max(0, 1 - (1 - e) * (1 - e))),
  stepped: (e, steps) => Math.ceil(e * steps) / steps,
  ridge: (e) => Math.pow(e, 0.6),
});

/**
 * Evaluate a profile curve at energy `e`. Unknown profiles fall back to `flat`.
 * @param {string} profile
 * @param {number} e - structural energy in [0,1]
 * @param {{ steps?: number }} [opts]
 * @returns {number} depth fraction in [0,1]
 */
export function profileValue(profile, e, opts = {}) {
  const fn = VOLUME_LIFT_PROFILES[profile] || VOLUME_LIFT_PROFILES.flat;
  const steps = Math.max(1, Math.round(opts.steps ?? DEFAULT_STEPS));
  return fn(e, steps);
}

/**
 * The depth law: structural energy → symmetric integer z extents.
 *
 *   halfDepth = round( maxDepth * profile(e) )
 *   emit z ∈ [-halfDepth, +halfDepth]              # symmetric about z = 0
 *   if e > 0 and halfDepth == 0: emit z = 0        # never hole the silhouette
 *
 * @param {number} e - structural energy in [0,1]
 * @param {number} maxDepth - half-thickness at the spine (voxels)
 * @param {string} profile
 * @param {{ steps?: number }} [opts]
 * @returns {number[]} sorted integer z values (empty when e <= 0)
 */
export function liftCellToDepths(e, maxDepth, profile, opts = {}) {
  if (!(e > 0)) return [];
  const halfDepth = Math.round(Math.max(0, maxDepth) * profileValue(profile, e, opts));
  if (halfDepth === 0) return [0];
  const zs = [];
  for (let z = -halfDepth; z <= halfDepth; z += 1) zs.push(z);
  return zs;
}

const GLOW_TYPES = new Set([ENERGY_TYPES.RADIANT, ENERGY_TYPES.PHOTONIC]);

/** Read one energy channel by type from a cell's `energies` list. */
function energyByType(cell, type) {
  const entry = (cell.energies || []).find((e) => e.type === type);
  return entry ? entry.value : 0;
}

function resolvePart(partParams, partId) {
  const params = (partParams && partParams[partId]) || {};
  return {
    profile: params.profile || 'flat',
    maxDepth: Number.isFinite(params.maxDepth) ? Math.max(0, Math.round(params.maxDepth)) : 1,
    steps: params.steps,
  };
}

/**
 * Transduce a 2D structural-energy field into a true 3D `voxel-volume`.
 *
 * Each cell's depth is driven ONLY by its STRUCTURAL energy channel (type
 * discipline, PDR §4); RADIANT/PHOTONIC energy is carried through onto every
 * emitted voxel so the Godot bridge can light it. Voxels are symmetric about
 * z = 0, mapped onto the volume's centre plane.
 *
 * @param {Array<{x:number,y:number,partId:string,materialId?:number,energies:Array<{type:number,value:number}>}>} cells
 * @param {{ dims:{width:number,height:number}, partParams:Record<string,{profile?:string,maxDepth?:number,steps?:number}> }} options
 * @returns {object} a voxel-volume with `.diagnostics`
 */
export function liftToVolume(cells = [], options = {}) {
  const { dims = {}, partParams = {} } = options;
  const width = Math.max(1, Math.round(dims.width || 1));
  const height = Math.max(1, Math.round(dims.height || 1));

  // Volume depth is sized to the deepest part's full spine: 2*maxDepth + 1.
  let maxHalf = 0;
  for (const cell of cells) {
    const { maxDepth } = resolvePart(partParams, cell.partId);
    if (maxDepth > maxHalf) maxHalf = maxDepth;
  }
  const depth = 2 * maxHalf + 1;
  const zCentre = maxHalf;

  const vol = createVoxelVolume(width, height, depth);

  let voxelCount = 0;
  for (const cell of cells) {
    const e = energyByType(cell, ENERGY_TYPES.STRUCTURAL);
    if (!(e > 0)) continue; // depth read only by STRUCTURAL type

    const { profile, maxDepth, steps } = resolvePart(partParams, cell.partId);
    const zs = liftCellToDepths(e, maxDepth, profile, { steps });
    if (zs.length === 0) continue;

    const materialId = Number.isFinite(cell.materialId) && cell.materialId > 0
      ? cell.materialId
      : 1;
    const glow = (cell.energies || []).find((entry) => GLOW_TYPES.has(entry.type));

    for (const z of zs) {
      const x = cell.x;
      const y = cell.y;
      const vz = zCentre + z;
      if (x < 0 || x >= width || y < 0 || y >= height || vz < 0 || vz >= depth) continue;
      setCellMaterial(vol, x, y, vz, materialId);
      if (glow) {
        const i = cellIndex(vol, x, y, vz);
        vol.energyField[i] = glow.value;
        vol.energyTypes[i] = glow.type;
      }
      voxelCount += 1;
    }
  }

  vol.diagnostics = Object.freeze({
    amp: VOLUME_LIFT_AMP_ID,
    version: VOLUME_LIFT_AMP_VERSION,
    cellCount: cells.length,
    voxelCount,
    centrePlane: zCentre,
  });
  return vol;
}

/** Smallest dims that contain every cell (when the route doesn't supply them). */
function inferDims(cells) {
  let width = 1;
  let height = 1;
  for (const cell of cells) {
    if (cell.x + 1 > width) width = cell.x + 1;
    if (cell.y + 1 > height) height = cell.y + 1;
  }
  return { width, height };
}

/**
 * Read the per-part VolumeLiftAMP table off the spec (`part.volume`).
 * Absolute thickness lives here (the one law, §5); shape lives in the energy.
 * @param {{ parts?: Array<{id:string, volume?:{profile?:string,maxDepth?:number,steps?:number}}> }} spec
 * @returns {Record<string,{profile:string,maxDepth:number,steps:number|undefined}>}
 */
export function buildPartParams(spec = {}) {
  const params = {};
  for (const part of spec.parts || []) {
    const vol = part.volume || {};
    params[part.id] = {
      profile: vol.profile || 'flat',
      maxDepth: Number.isFinite(vol.maxDepth) ? vol.maxDepth : 1,
      steps: vol.steps,
    };
  }
  return params;
}

/**
 * VolumeLiftAMP as a `microprocessor-route` step: consumes `fills.coordinates`,
 * emits `voxel.volume`. Maps fill colors to stable material IDs, computes STRUCTURAL
 * energy at the seam (the producer law lives in one shared module), then transduces
 * to a voxel volume with per-part lift profiles.
 *
 * @param {{ dims?:{width:number,height:number}, partParams?:object }} [options]
 * @returns {{ name:string, seam:object, execute:(results:object)=>void }}
 */
export function createVolumeLiftStep(options = {}) {
  return {
    name: 'volume-lift-amp',
    seam: {
      id: VOLUME_LIFT_AMP_ID,
      processor: 'volume-lift-amp',
      consumes: ['fills.coordinates'],
      emits: ['voxel.volume'],
    },
    execute(results) {
      const cells = results.fills?.coordinates || [];
      const dims = options.dims || results.dimensions || inferDims(cells);
      const partParams = options.partParams || buildPartParams(results.spec || {});

      // Map painted fill colours to stable material ids (1-based, 0 = empty).
      // Deterministic: same colour → same id across runs.
      const colorToId = new Map();
      let nextId = 1;
      const liftCells = cells.map((c) => {
        const color = String(c.color || '#000000').toUpperCase();
        let materialId = colorToId.get(color);
        if (materialId == null) {
          materialId = nextId;
          nextId += 1;
          colorToId.set(color, materialId);
        }
        return {
          x: c.snappedX ?? c.x,
          y: c.snappedY ?? c.y,
          partId: c.partId,
          materialId,
          energies: Array.isArray(c.energies) ? c.energies : [],
        };
      });

      const energized = computeStructuralEnergy(liftCells, dims);
      const vol = liftToVolume(energized, { dims, partParams });

      // Attach the colour→id lookup so callers can build the serialized
      // PB-VOXEL-ITEM packet with colour hints.
      vol._colorToMaterialId = colorToId;

      results.voxel = { volume: vol };
    },
  };
}

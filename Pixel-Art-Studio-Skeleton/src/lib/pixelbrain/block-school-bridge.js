import { generateFibonacciSeeds } from './wand-seed-lift.js';
import { propagate, DEFAULT_DECAY, DEFAULT_ITERATIONS } from './qbit-field.js';
import { SCHOOL_TO_ENERGY } from '../constants/schools.js';
import { SCHOOL_VOXEL_DEFAULTS } from './scroll-to-voxel-world.js';
import { createVoxelVolume } from './voxel-volume.js';
import { resolveBlockId } from './block-taxonomy.js';

const ALL_SCHOOL_IDS = Object.freeze(Object.keys(SCHOOL_TO_ENERGY));

const _basisCache = new Map();

export function maxRadiusFor(w, h, d) {
  return Math.floor(Math.min(w, h, d) * 0.75);
}

function basisKey(w, h, d) {
  return `${w}x${h}x${d}`;
}

function buildBasis(w, h, d) {
  const volume = createVoxelVolume(w, h, d);
  const rawSeeds = generateFibonacciSeeds(
    { iterations: 6, scale: 0.75 },
    volume,
    { initialEnergy: 1.0 }
  );
  const seeds = rawSeeds.map(s => ({ x: s.vx, y: s.vy, z: s.vz, energy: s.energy }));
  const maxRadius = maxRadiusFor(w, h, d);
  const totalCells = w * h * d;

  const schoolBases = {};
  for (const schoolId of ALL_SCHOOL_IDS) {
    const defaults = SCHOOL_VOXEL_DEFAULTS[schoolId] ?? SCHOOL_VOXEL_DEFAULTS.VOID;
    const decay = DEFAULT_DECAY * defaults.decayScale;
    const iterations = Math.max(0, DEFAULT_ITERATIONS + defaults.iterationsBias);

    const field = propagate(seeds, w, h, d, {
      attenuationModel: defaults.attenuationModel,
      decay,
      iterations,
      maxRadius,
    });

    const buf = new Float32Array(totalCells);
    for (let y = 0; y < h; y++) {
      for (let z = 0; z < d; z++) {
        for (let x = 0; x < w; x++) {
          buf[y * w * d + z * w + x] = field.energyAt(x, y, z);
        }
      }
    }
    schoolBases[schoolId] = buf;
  }

  return Object.freeze(schoolBases);
}

export function getOrBuildBasis(w, h, d) {
  const key = basisKey(w, h, d);
  if (_basisCache.has(key)) return _basisCache.get(key);
  const basis = buildBasis(w, h, d);
  _basisCache.set(key, basis);
  return basis;
}

export function schoolAt(w, h, d, schoolWeights, x, y, z) {
  const basis = getOrBuildBasis(w, h, d);
  const cellIdx = y * w * d + z * w + x;

  let bestSchool = 'VOID';
  let bestScore = -1;

  for (const schoolId of ALL_SCHOOL_IDS) {
    const weight = Number(schoolWeights[schoolId] ?? 0);
    if (weight <= 0) continue;
    const score = weight * (basis[schoolId]?.[cellIdx] ?? 0);
    if (score > bestScore) {
      bestScore = score;
      bestSchool = schoolId;
    }
  }

  return bestSchool;
}

export function invalidateBasis(w, h, d) {
  if (w === undefined) {
    _basisCache.clear();
  } else {
    _basisCache.delete(basisKey(w, h, d));
  }
}

export function lightAt(w, h, d, schoolWeights, x, y, z) {
  const basis = getOrBuildBasis(w, h, d);
  const cellIdx = y * w * d + z * w + x;
  let total = 0;
  for (const schoolId of ALL_SCHOOL_IDS) {
    const weight = Number(schoolWeights[schoolId] ?? 0);
    if (weight <= 0) continue;
    total += weight * (basis[schoolId]?.[cellIdx] ?? 0);
  }
  return Math.min(1, Math.max(0, total));
}

export function resolveBlockContext(w, h, d, schoolWeights, materialId, x, y, z) {
  const schoolId = schoolAt(w, h, d, schoolWeights, x, y, z);
  const blockId = resolveBlockId(schoolId, materialId, x, y, z);
  return { schoolId, blockId };
}

export function prewarmBasis(tiers) {
  for (const { w, h, d } of tiers) {
    getOrBuildBasis(w, h, d);
  }
}

/**
 * QBIT-Voxel Level 5 — Phoneme-World Resonance (The Convergence)
 *
 * Per QBIT-VOXEL-SYNTHESIS.md §4 Level 5:
 *   The player writes a scroll. TrueSight produces a `schoolWeights`
 *   distribution. This module turns that distribution into the energy-type
 *   mix and propagation parameters used to generate the voxel world.
 *
 *   VOID-dominant scroll  → cold structural world
 *   ALCHEMY-dominant scroll → warm thermal world
 *   PSYCHIC-dominant scroll → bright photonic world
 *
 * The convergence is: phoneme distribution (a property of language) becomes
 * energy type distribution (a property of the world). Same scroll, same
 * weights, same world — every time.
 *
 * No RNG. Every output is a pure function of `schoolWeights` and seed
 * positions. Same input → same world on every run, every machine, every
 * chunk load order.
 */

import { SCHOOL_TO_ENERGY } from '../constants/schools.js';
import { ENERGY_TYPES } from './voxel-volume.js';
import { propagate, ATTENUATION_MODELS, DEFAULT_DECAY, DEFAULT_ITERATIONS } from './qbit-field.js';

const ALL_SCHOOL_IDS = Object.freeze(Object.keys(SCHOOL_TO_ENERGY));

// Per-school QBIT propagation tuning. Each entry is a hint, not a hard
// requirement — `deriveQbitParametersFromSchools` blends these by the
// scroll's school weights. Values are conservative and stay inside the
// envelope `propagate()` already validates.
//
// attenuationModel:
//   STRUCTURAL / SHIELDING / ENTROPIC → 'gaussian' (sharp boundaries,
//                                       suits sparse, structural terrain)
//   THERMAL / RADIANT / PHOTONIC      → 'inverse_square' (long-tailed,
//                                       suits dense, glowing terrain)
//   RESONANT / KINETIC                → 'phi_attenuation' (intermediate)
export const SCHOOL_VOXEL_DEFAULTS = Object.freeze({
  SONIC:      { attenuationModel: ATTENUATION_MODELS.PHI_ATTENUATION,  decayScale: 1.0,  iterationsBias: 0 },
  PSYCHIC:    { attenuationModel: ATTENUATION_MODELS.INVERSE_SQUARE,    decayScale: 0.75, iterationsBias: 1 },
  VOID:       { attenuationModel: ATTENUATION_MODELS.GAUSSIAN,          decayScale: 1.3,  iterationsBias: -1 },
  ALCHEMY:    { attenuationModel: ATTENUATION_MODELS.INVERSE_SQUARE,    decayScale: 0.6,  iterationsBias: 2 },
  WILL:       { attenuationModel: ATTENUATION_MODELS.PHI_ATTENUATION,  decayScale: 0.9,  iterationsBias: 1 },
  NECROMANCY: { attenuationModel: ATTENUATION_MODELS.GAUSSIAN,          decayScale: 1.5,  iterationsBias: 0 },
  ABJURATION: { attenuationModel: ATTENUATION_MODELS.GAUSSIAN,          decayScale: 1.2,  iterationsBias: -1 },
  DIVINATION: { attenuationModel: ATTENUATION_MODELS.INVERSE_SQUARE,    decayScale: 0.7,  iterationsBias: 2 },
});

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeSchoolWeights(schoolWeights) {
  if (!schoolWeights || typeof schoolWeights !== 'object') return {};

  const entries = [];
  let total = 0;
  for (const [schoolId, weight] of Object.entries(schoolWeights)) {
    const upper = String(schoolId).toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(SCHOOL_TO_ENERGY, upper)) continue;
    const numeric = Number(weight);
    if (!isFiniteNumber(numeric) || numeric <= 0) continue;
    entries.push([upper, numeric]);
    total += numeric;
  }

  if (total === 0) return {};

  const normalized = {};
  for (const [schoolId, weight] of entries) {
    normalized[schoolId] = weight / total;
  }
  return normalized;
}

/**
 * Convert school weights into a sorted energy-type mix.
 * Each entry includes the energy type definition plus the school's normalized
 * weight. Sorted by weight descending (with deterministic schoolId tiebreak).
 *
 * Defaults to `[{ schoolId: 'VOID', ... weight: 1.0 }]` when input is empty.
 *
 * @param {Record<string, number>} schoolWeights
 * @returns {Array<{
 *   schoolId: string,
 *   energyType: string,
 *   energyTypeId: number,
 *   baseThreshold: number,
 *   emission: number,
 *   weight: number,
 * }>}
 */
export function schoolWeightsToEnergyMix(schoolWeights) {
  const normalized = normalizeSchoolWeights(schoolWeights);
  const schoolIds = Object.keys(normalized);

  if (schoolIds.length === 0) {
    const voidEntry = SCHOOL_TO_ENERGY.VOID;
    return [Object.freeze({
      schoolId: 'VOID',
      energyType: voidEntry.type,
      energyTypeId: voidEntry.typeId,
      baseThreshold: voidEntry.baseThreshold,
      emission: voidEntry.emission,
      weight: 1.0,
    })];
  }

  const mix = schoolIds.map((schoolId) => {
    const energy = SCHOOL_TO_ENERGY[schoolId];
    return Object.freeze({
      schoolId,
      energyType: energy.type,
      energyTypeId: energy.typeId,
      baseThreshold: energy.baseThreshold,
      emission: energy.emission,
      weight: normalized[schoolId],
    });
  });

  mix.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.schoolId.localeCompare(b.schoolId);
  });

  return mix;
}

/**
 * Weighted average of a numeric property across the energy mix.
 *
 * @param {Array<object>} energyMix     output of schoolWeightsToEnergyMix
 * @param {string} property             'baseThreshold' or 'emission'
 * @returns {number}
 */
export function weightedEnergyMixProperty(energyMix, property) {
  if (!Array.isArray(energyMix) || energyMix.length === 0) return 0;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const entry of energyMix) {
    const value = Number(entry[property]);
    if (!isFiniteNumber(value)) continue;
    weightedSum += value * entry.weight;
    totalWeight += entry.weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Deterministically assign each seed an energyType drawn from the mix in
 * proportion to the weights. No RNG: assignment is a pure function of the
 * seed's index in the input array (or its `index` field, if present).
 *
 * Algorithm: pre-compute cumulative weights, then for each seed pick the
 * bucket whose cumulative weight covers `(index + 0.5) / seeds.length`.
 * This produces a stable striped distribution that respects the weights
 * exactly at the asymptote (large `seeds.length`).
 *
 * @param {Array<object>} seeds         Seeds (any shape with optional .energyType)
 * @param {Array<object>} energyMix     output of schoolWeightsToEnergyMix
 * @returns {Array<object>}             New seed objects with energyType
 *                                      replaced; other fields preserved.
 */
export function assignSeedEnergyTypes(seeds, energyMix) {
  if (!Array.isArray(seeds) || seeds.length === 0) return [];
  if (!Array.isArray(energyMix) || energyMix.length === 0) return seeds.slice();

  let cumulative = 0;
  const buckets = energyMix.map((entry) => {
    cumulative += entry.weight;
    return { ceiling: cumulative, energyTypeId: entry.energyTypeId, schoolId: entry.schoolId };
  });
  const totalWeight = cumulative || 1;

  return seeds.map((seed, indexInArray) => {
    const seedIndex = isFiniteNumber(seed.index) ? seed.index : indexInArray;
    const position = ((seedIndex + 0.5) / seeds.length) * totalWeight;
    let chosen = buckets[buckets.length - 1];
    for (const bucket of buckets) {
      if (position <= bucket.ceiling) { chosen = bucket; break; }
    }
    return {
      ...seed,
      energyType: chosen.energyTypeId,
      energySchool: chosen.schoolId,
    };
  });
}

/**
 * Convenience: take seeds + schoolWeights → seeds with energy types assigned
 * by the school distribution.
 *
 * @param {Array<object>} seeds
 * @param {Record<string, number>} schoolWeights
 * @returns {Array<object>}
 */
export function applySchoolWeightsToSeeds(seeds, schoolWeights) {
  const mix = schoolWeightsToEnergyMix(schoolWeights);
  return assignSeedEnergyTypes(seeds, mix);
}

/**
 * Derive QBIT propagation parameters from school weights.
 *
 * The dominant school wins on attenuationModel (categorical — can't blend
 * model names) and contributes its `iterationsBias` and `decayScale` at full
 * weight. Sub-dominant schools' biases blend in proportionally.
 *
 * @param {Record<string, number>} schoolWeights
 * @param {object} [options]
 * @param {number} [options.baseDecay]       Defaults to qbit-field DEFAULT_DECAY
 * @param {number} [options.baseIterations]  Defaults to qbit-field DEFAULT_ITERATIONS
 * @returns {{
 *   attenuationModel: string,
 *   decay: number,
 *   iterations: number,
 *   baseThreshold: number,
 *   emission: number,
 *   dominantSchoolId: string,
 *   dominantEnergyTypeId: number,
 *   mix: Array<object>,
 * }}
 */
export function deriveQbitParametersFromSchools(schoolWeights, options = {}) {
  const baseDecay = isFiniteNumber(options.baseDecay) ? options.baseDecay : DEFAULT_DECAY;
  const baseIterations = isFiniteNumber(options.baseIterations) ? options.baseIterations : DEFAULT_ITERATIONS;

  const mix = schoolWeightsToEnergyMix(schoolWeights);
  const dominant = mix[0];
  const dominantDefaults = SCHOOL_VOXEL_DEFAULTS[dominant.schoolId] || SCHOOL_VOXEL_DEFAULTS.VOID;

  let blendedDecayScale = 0;
  let blendedIterationsBias = 0;
  for (const entry of mix) {
    const defaults = SCHOOL_VOXEL_DEFAULTS[entry.schoolId] || SCHOOL_VOXEL_DEFAULTS.VOID;
    blendedDecayScale += defaults.decayScale * entry.weight;
    blendedIterationsBias += defaults.iterationsBias * entry.weight;
  }

  const decay = baseDecay * blendedDecayScale;
  const iterations = Math.max(0, Math.round(baseIterations + blendedIterationsBias));
  const baseThreshold = weightedEnergyMixProperty(mix, 'baseThreshold');
  const emission = weightedEnergyMixProperty(mix, 'emission');

  return Object.freeze({
    attenuationModel: dominantDefaults.attenuationModel,
    decay,
    iterations,
    baseThreshold,
    emission,
    dominantSchoolId: dominant.schoolId,
    dominantEnergyTypeId: dominant.energyTypeId,
    mix: Object.freeze(mix),
  });
}

/**
 * The full Phoneme-World Resonance pipeline.
 *
 * Given seeds (already lifted to 3D from a Wand formula), a schoolWeights
 * distribution (from TrueSight), and a volume size, this:
 *   1. Builds the energy-type mix from the school weights
 *   2. Reassigns each seed's energyType deterministically by the mix
 *   3. Derives QBIT propagation parameters from the dominant school
 *   4. Propagates the QBIT field
 *
 * The returned `field` has `width`, `height`, `depth`, `energyAt`, and
 * `gradientAt` exactly like the standard `propagate()` return value, so it
 * drops into the existing voxel pipeline (HollownessAMP → BiomeCoherenceAMP
 * → IsoProjector → renderer) without modification.
 *
 * @param {Array<{vx: number, vy: number, vz: number, energy: number}>} seeds
 * @param {Record<string, number>} schoolWeights
 * @param {{width: number, height: number, depth: number}} volume
 * @param {object} [options]
 * @param {number} [options.maxRadius]
 * @returns {{
 *   field: object,
 *   params: object,
 *   mix: Array<object>,
 *   seeds: Array<object>,
 * }}
 */
export function generateVoxelFieldFromScrollAnalysis(seeds, schoolWeights, volume, options = {}) {
  if (!Array.isArray(seeds)) {
    throw new TypeError('generateVoxelFieldFromScrollAnalysis: seeds must be an array');
  }
  if (!volume || !isFiniteNumber(volume.width) || !isFiniteNumber(volume.height) || !isFiniteNumber(volume.depth)) {
    throw new TypeError('generateVoxelFieldFromScrollAnalysis: volume must include width, height, depth');
  }

  const params = deriveQbitParametersFromSchools(schoolWeights, options);
  const taggedSeeds = applySchoolWeightsToSeeds(seeds, schoolWeights);

  const propagateSeeds = taggedSeeds.map((s) => ({
    x: isFiniteNumber(s.x) ? s.x : s.vx,
    y: isFiniteNumber(s.y) ? s.y : s.vy,
    z: isFiniteNumber(s.z) ? s.z : s.vz,
    energy: s.energy,
    energyType: s.energyType,
  }));

  const field = propagate(propagateSeeds, volume.width, volume.height, volume.depth, {
    decay: params.decay,
    iterations: params.iterations,
    attenuationModel: params.attenuationModel,
    maxRadius: isFiniteNumber(options.maxRadius) ? options.maxRadius : null,
  });

  return Object.freeze({
    field,
    params,
    mix: params.mix,
    seeds: Object.freeze(taggedSeeds),
  });
}

export const SCROLL_TO_VOXEL_INTERNALS = Object.freeze({
  ALL_SCHOOL_IDS,
  normalizeSchoolWeights,
});

// Re-export so callers don't need to reach into voxel-volume.js for these.
export { ENERGY_TYPES, SCHOOL_TO_ENERGY };

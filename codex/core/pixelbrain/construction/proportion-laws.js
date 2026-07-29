/**
 * Named proportion systems for geometric construction.
 * PDR §3: ProportionSystem — golden, root-two, thirds, fifths, modular, etc.
 *
 * All proportions are deterministic constants. No I/O, no randomness.
 */

import { GOLDEN_RATIO } from '../shared.js';

export const PROPORTION_CONSTANTS = Object.freeze({
  GOLDEN: GOLDEN_RATIO,                    // φ = 1.618033988749895
  GOLDEN_CONJUGATE: 1 / GOLDEN_RATIO,      // 1/φ = 0.6180339887498949
  ROOT_TWO: Math.SQRT2,                    // √2 = 1.4142135623730951
  ROOT_TWO_CONJUGATE: 1 / Math.SQRT2,      // 1/√2 = 0.7071067811865475
});

/**
 * Resolve a proportion system spec to a numeric ratio.
 *
 * @param {object} spec - One of:
 *   { kind: 'ratio', value: number }
 *   { kind: 'golden' }
 *   { kind: 'root-two' }
 *   { kind: 'thirds' }
 *   { kind: 'fifths' }
 *   { kind: 'modular', module: number }
 *   { kind: 'species-specific', species: string }
 *   { kind: 'architectural-canonical', canon: string }
 * @returns {number} The resolved ratio.
 */
export function resolveProportion(spec) {
  if (!spec || typeof spec !== 'object') {
    throw new Error('Proportion spec must be an object');
  }

  switch (spec.kind) {
    case 'ratio':
      if (typeof spec.value !== 'number' || !Number.isFinite(spec.value)) {
        throw new Error('ratio proportion requires a finite numeric value');
      }
      return spec.value;

    case 'golden':
      return PROPORTION_CONSTANTS.GOLDEN_CONJUGATE; // 0.618...

    case 'root-two':
      return PROPORTION_CONSTANTS.ROOT_TWO_CONJUGATE; // 0.707...

    case 'thirds':
      return 1 / 3;

    case 'fifths':
      return 1 / 5;

    case 'modular':
      if (typeof spec.module !== 'number' || spec.module <= 0) {
        throw new Error('modular proportion requires a positive module value');
      }
      return spec.module;

    case 'species-specific':
      // Deferred to follow-up PDR — curated lookup table.
      throw new Error(`species-specific proportion "${spec.species}" not yet curated`);

    case 'architectural-canonical':
      // Deferred to follow-up PDR — curated canon table.
      throw new Error(`architectural-canonical proportion "${spec.canon}" not yet curated`);

    default:
      throw new Error(`Unknown proportion kind "${spec.kind}"`);
  }
}

/**
 * Resolve a RatioSpec from the construction IR.
 * { ratio: { reference: number | PartRef, value: number } }
 *
 * If reference is a number, result = reference * value.
 * If reference is a PartRef, the caller must resolve it first.
 */
export function resolveRatioSpec(ratioSpec, resolvedRefs = {}) {
  if (!ratioSpec || !ratioSpec.ratio) {
    throw new Error('RatioSpec must have a ratio field');
  }
  const { reference, value } = ratioSpec.ratio;

  let refValue;
  if (typeof reference === 'number') {
    refValue = reference;
  } else if (reference && typeof reference === 'object' && reference.ref) {
    const key = `${reference.ref}.${reference.point}`;
    if (!(key in resolvedRefs)) {
      throw new Error(`Unresolved part reference "${key}" in ratio spec`);
    }
    refValue = resolvedRefs[key];
  } else {
    throw new Error('RatioSpec reference must be a number or a PartRef');
  }

  return refValue * value;
}

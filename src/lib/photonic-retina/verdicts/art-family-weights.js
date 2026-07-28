/**
 * Art-family calibration weights for Retina verdict evidence (sidecar).
 */

export const ART_FAMILIES = Object.freeze([
  'heraldic',
  'landscape',
  'prop',
  'character',
  'ui',
  'default',
]);

const BASE = Object.freeze({
  structuralValidity: 1,
  intentFidelity: 1,
  materialCoherence: 1,
  compositionCoherence: 1,
  perceptualLegibility: 1,
  vixelIdentity: 1,
  rendererStability: 1,
  noveltyWithinFamily: 0.5,
});

export const ART_FAMILY_WEIGHTS = Object.freeze({
  default: BASE,
  heraldic: Object.freeze({
    ...BASE,
    compositionCoherence: 1.2,
    structuralValidity: 1.3,
    noveltyWithinFamily: 0.3,
  }),
  landscape: Object.freeze({
    ...BASE,
    compositionCoherence: 1.4,
    perceptualLegibility: 1.1,
    noveltyWithinFamily: 0.7,
  }),
  prop: Object.freeze({
    ...BASE,
    materialCoherence: 1.3,
    vixelIdentity: 1.2,
  }),
  character: Object.freeze({
    ...BASE,
    intentFidelity: 1.3,
    perceptualLegibility: 1.2,
  }),
  ui: Object.freeze({
    ...BASE,
    structuralValidity: 1.4,
    perceptualLegibility: 1.3,
    noveltyWithinFamily: 0.2,
  }),
});

export function resolveArtFamilyWeights(family, overrides = null) {
  const base = ART_FAMILY_WEIGHTS[family] || ART_FAMILY_WEIGHTS.default;
  if (!overrides) return base;
  return Object.freeze({ ...base, ...overrides });
}

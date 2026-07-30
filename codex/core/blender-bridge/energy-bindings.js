/**
 * Declared, graded energy → shader bindings registry.
 *
 * The bridge carries the energy vector; it does not interpret it.
 * All eight ENERGY_TYPES cross as raw named attributes.
 * Any mapping onto a shader input is a DECLARED, GRADED binding.
 *
 * Grades follow the Semantic Correspondence Registry:
 *   ID — identity, proven equivalent
 *   SC — structural correspondence, tested
 *   FA — functional analogy, plausible but unproven
 *   MT — metaphor only
 *   FF — false friend, explicitly not equivalent
 *
 * Implicit defaults are forbidden (SCR-017). Every binding must be declared
 * here with its grade before it can be used in a shader graph.
 */

export const ENERGY_TYPES = Object.freeze([
  'RESONANT',    // 0
  'PHOTONIC',    // 1
  'STRUCTURAL',  // 2
  'THERMAL',     // 3
  'KINETIC',     // 4
  'ENTROPIC',    // 5
  'SHIELDING',   // 6
  'RADIANT',     // 7
]);

/**
 * The binding registry. Each entry declares:
 *   energyType: which ENERGY_TYPES index
 *   shaderInput: the Blender shader node input name
 *   grade: SCR grade (ID, SC, FA, MT, FF)
 *   transferFunction: how the raw [0,1] value maps to the shader input
 *   evidence: what supports the grade
 */
export const ENERGY_BINDINGS = Object.freeze([
  Object.freeze({
    energyType: 'PHOTONIC',
    energyIndex: 1,
    shaderInput: 'Emission Strength',
    grade: 'FA',
    transferFunction: 'linear',
    evidence: 'Photonic energy maps to light emission. Functional analogy: both describe radiated energy. Not structural: photonic energy in PixelBrain is a semantic tag, not a physical radiance measurement. Grade FA per SCR protocol — plausible but unproven.',
  }),
]);

/**
 * Look up the binding for an energy type.
 * Returns null if no binding is declared (the energy crosses as a raw attribute only).
 */
export function getBinding(energyType) {
  return ENERGY_BINDINGS.find((b) => b.energyType === energyType) ?? null;
}

/**
 * List all energy types that have NO declared binding.
 * These cross as raw attributes and must not be implicitly mapped.
 */
export function unboundEnergyTypes() {
  const bound = new Set(ENERGY_BINDINGS.map((b) => b.energyType));
  return ENERGY_TYPES.filter((t) => !bound.has(t));
}

/**
 * Validate that a proposed binding does not violate SCR-017
 * (no implicit material-name → procedural-texture wires).
 */
export function validateBinding(proposal) {
  if (!proposal || typeof proposal !== 'object') {
    return { valid: false, reason: 'proposal must be a non-null object' };
  }
  if (!ENERGY_TYPES.includes(proposal.energyType)) {
    return { valid: false, reason: `unknown energy type: ${proposal.energyType}` };
  }
  if (!['ID', 'SC', 'FA', 'MT', 'FF'].includes(proposal.grade)) {
    return { valid: false, reason: `invalid grade: ${proposal.grade}` };
  }
  if (proposal.grade === 'FF') {
    return { valid: false, reason: 'false-friend bindings are forbidden by definition' };
  }
  if (!proposal.shaderInput || typeof proposal.shaderInput !== 'string') {
    return { valid: false, reason: 'shaderInput must be a non-empty string' };
  }
  const existing = getBinding(proposal.energyType);
  if (existing) {
    return { valid: false, reason: `binding already declared for ${proposal.energyType} (grade ${existing.grade})` };
  }
  return { valid: true, reason: 'ok' };
}

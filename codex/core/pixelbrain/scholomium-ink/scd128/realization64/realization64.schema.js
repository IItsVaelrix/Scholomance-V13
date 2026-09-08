/**
 * Scholomium Ink — REALIZATION64 Sealed Realization Witness Schema & Validators
 *
 * Rejects any structural skeleton/geometry/mass-altering field.
 * Isolated from FORM64.
 */

import { REALIZATION64_SLOT_NAMES, SCD128_ERROR_CODES } from '../scd128.constants.js';

export const FORBIDDEN_REALIZATION_FIELDS = Object.freeze([
  'skeleton_nodes',
  'branch_attachments',
  'crown_dimensions',
  'trunk_taper',
  'collision_geometry',
  'root_placement',
  'global_silhouette',
  'add_mass',
  'remove_mass',
  'move_mass',
  'branch_angles',
  'trunk_axis',
  'skeleton',
  'crown_envelope',
  'negative_space_void',
]);

/**
 * Validates that an evidence object does not contain forbidden structural fields.
 */
export function validateRealizationEvidenceView(evidence) {
  const violations = [];
  if (!evidence || typeof evidence !== 'object') {
    return [{ field: 'root', message: 'Evidence view is not an object', code: SCD128_ERROR_CODES.REALIZATION_SCHEMA }];
  }

  function checkKeys(obj, prefix = '') {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (FORBIDDEN_REALIZATION_FIELDS.some((f) => lower === f || lower.includes(f))) {
        violations.push({
          field: prefix ? `${prefix}.${key}` : key,
          message: `Forbidden structural field '${key}' present in REALIZATION64 evidence view`,
          code: SCD128_ERROR_CODES.FORBIDDEN_FIELD,
        });
      }
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        checkKeys(obj[key], prefix ? `${prefix}.${key}` : key);
      }
    }
  }

  checkKeys(evidence);
  return violations;
}

/**
 * Validates that the 8 REALIZATION64 slot definitions are complete and conform to slot rules.
 */
export function validateRealizationSlots(slots) {
  const violations = [];
  if (!Array.isArray(slots) || slots.length !== REALIZATION64_SLOT_NAMES.length) {
    violations.push({
      field: 'slots',
      message: `REALIZATION64 must have exactly 8 slots, got ${slots?.length}`,
      code: SCD128_ERROR_CODES.REALIZATION_SCHEMA,
    });
    return violations;
  }

  for (let i = 0; i < REALIZATION64_SLOT_NAMES.length; i++) {
    const expected = REALIZATION64_SLOT_NAMES[i];
    const s = slots[i];
    if (!s || s.slot !== expected || s.position !== i) {
      violations.push({
        field: `slots[${i}]`,
        message: `Expected slot '${expected}' at position ${i}, got '${s?.slot}'`,
        code: SCD128_ERROR_CODES.REALIZATION_SCHEMA,
      });
    }
  }

  return violations;
}

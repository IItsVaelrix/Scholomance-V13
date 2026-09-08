/**
 * Scholomium Ink — FORM64 Sealed Structural Witness Schema & Validators
 *
 * Rejects any realization/decorative/palette/hue/lighting field.
 * Isolated from REALIZATION64.
 */

import { FORM64_SLOT_NAMES, SCD128_ERROR_CODES } from '../scd128.constants.js';

export const FORBIDDEN_FORM_FIELDS = Object.freeze([
  'hue',
  'palette',
  'material_color',
  'color',
  'colors',
  'highlights',
  'lighting_direction',
  'light_direction',
  'decorative_texture',
  'dithering',
  'finish_scoring',
  'pixel_cluster',
  'finish',
  'ambient_occlusion_tint',
  'specular_color',
]);

/**
 * Validates that an evidence object does not contain forbidden realization fields.
 */
export function validateFormEvidenceView(evidence) {
  const violations = [];
  if (!evidence || typeof evidence !== 'object') {
    return [{ field: 'root', message: 'Evidence view is not an object', code: SCD128_ERROR_CODES.FORM_SCHEMA }];
  }

  function checkKeys(obj, prefix = '') {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (FORBIDDEN_FORM_FIELDS.some((f) => lower === f || lower.includes(f))) {
        violations.push({
          field: prefix ? `${prefix}.${key}` : key,
          message: `Forbidden realization field '${key}' present in FORM64 evidence view`,
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
 * Validates that the 8 FORM64 slot definitions are complete and conform to slot rules.
 */
export function validateFormSlots(slots) {
  const violations = [];
  if (!Array.isArray(slots) || slots.length !== FORM64_SLOT_NAMES.length) {
    violations.push({
      field: 'slots',
      message: `FORM64 must have exactly 8 slots, got ${slots?.length}`,
      code: SCD128_ERROR_CODES.FORM_SCHEMA,
    });
    return violations;
  }

  for (let i = 0; i < FORM64_SLOT_NAMES.length; i++) {
    const expected = FORM64_SLOT_NAMES[i];
    const s = slots[i];
    if (!s || s.slot !== expected || s.position !== i) {
      violations.push({
        field: `slots[${i}]`,
        message: `Expected slot '${expected}' at position ${i}, got '${s?.slot}'`,
        code: SCD128_ERROR_CODES.FORM_SCHEMA,
      });
    }
  }

  return violations;
}

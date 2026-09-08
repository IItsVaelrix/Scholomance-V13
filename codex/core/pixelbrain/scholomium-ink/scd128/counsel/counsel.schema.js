/**
 * Scholomium Ink — SCD128 Lawyer & Counsel Schemas
 *
 * Defines:
 * - SCD128CounselConflictV1
 * - SCD128ProjectionDirectiveV1
 * - SCD128CounselReceiptV1
 * - SCD128HearingInputV1
 */

import { SCD128_ERROR_CODES } from '../scd128.constants.js';

export const COUNSEL_CONTRACT = 'SCD128-COUNSEL-v1';
export const COUNSEL_SCHEMA_VERSION = 1;

export const COUNSEL_MODES = Object.freeze(['canonical', 'laboratory']);
export const COUNSEL_VERDICTS = Object.freeze(['approved', 'quarantined']);

/**
 * Validates the structure of a hearing input before adjudication.
 */
export function validateHearingInput(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, reason: 'Hearing input must be an object' };
  }
  if (!input.form || typeof input.form !== 'object') {
    return { ok: false, reason: 'Missing form witness packet in hearing input' };
  }
  if (!input.realization || typeof input.realization !== 'object') {
    return { ok: false, reason: 'Missing realization witness packet in hearing input' };
  }
  if (!input.policy || typeof input.policy !== 'object' || typeof input.policy.evaluateCompatibility !== 'function') {
    return { ok: false, reason: 'Missing or invalid policy object with evaluateCompatibility method' };
  }
  return { ok: true };
}

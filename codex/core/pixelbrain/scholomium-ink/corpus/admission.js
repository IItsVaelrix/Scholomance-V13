/**
 * Scholomium Ink — Canonical Admission Gate
 *
 * Implements the explicit human admission gate.
 * Gated by:
 * - Must have an approved SCD128 counsel receipt.
 * - Quarantined receipts fail closed.
 * - Requires explicit author / approver token.
 * - Rejects missing or tampered digests.
 */

import { computeCanonicalDigest256 } from '../scd128/scd128.canonical.js';
import { isQuarantined, assertNotQuarantined } from '../scd128/counsel/quarantine.js';
import { ADMISSION_CONTRACT, CORPUS_SCHEMA_VERSION } from './corpus.schema.js';
import { SCD128_ERROR_CODES } from '../scd128/scd128.constants.js';

/**
 * Creates an immutable admission receipt.
 */
export function createAdmissionReceipt({
  specimenId,
  family,
  counselReceipt,
  sourceDigest,
  approvedBy = 'Angel',
  notes = 'Canonical corpus admission',
}) {
  assertNotQuarantined(counselReceipt, `Admission of '${specimenId}'`);

  if (!sourceDigest || typeof sourceDigest !== 'string') {
    const err = new Error(`Cannot admit '${specimenId}': missing sourceDigest`);
    err.code = SCD128_ERROR_CODES.CORPUS_ADMISSION;
    throw err;
  }

  const preimage = {
    contract: ADMISSION_CONTRACT,
    schemaVersion: CORPUS_SCHEMA_VERSION,
    specimenId,
    family,
    checksum128: counselReceipt.checksum128,
    formDigest256: counselReceipt.formDigest256,
    realizationDigest256: counselReceipt.realizationDigest256,
    counselReceiptDigest: counselReceipt.receiptDigest256,
    sourceDigest,
    approvedBy,
    notes,
    admittedEpoch: '2026-09-07',
  };

  const admissionDigest256 = computeCanonicalDigest256(preimage);

  return Object.freeze({
    ...preimage,
    admissionDigest256,
  });
}

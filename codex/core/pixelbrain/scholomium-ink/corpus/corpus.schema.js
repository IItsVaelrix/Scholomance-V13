/**
 * Scholomium Ink — Corpus Ledger & Admission Schemas
 *
 * Defines:
 * - SCD128-CORPUS-LEDGER-v1
 * - SCD128-ADMISSION-v1
 * - ScholomiumInkProvenanceV1
 */

export const CORPUS_LEDGER_CONTRACT = 'SCD128-CORPUS-LEDGER-v1';
export const ADMISSION_CONTRACT = 'SCD128-ADMISSION-v1';
export const CORPUS_SCHEMA_VERSION = 1;

/**
 * Validates an admission receipt record.
 */
export function validateAdmissionReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') {
    return { ok: false, reason: 'Admission receipt must be an object' };
  }
  if (receipt.contract !== ADMISSION_CONTRACT) {
    return { ok: false, reason: `Invalid admission contract: ${receipt.contract}` };
  }
  if (!receipt.checksum128 || receipt.checksum128.length !== 128) {
    return { ok: false, reason: 'Missing or invalid checksum128' };
  }
  if (!receipt.approvedBy || typeof receipt.approvedBy !== 'string') {
    return { ok: false, reason: 'Missing approvedBy human signature' };
  }
  if (!receipt.counselReceiptDigest || receipt.counselReceiptDigest.length !== 64) {
    return { ok: false, reason: 'Missing or invalid counselReceiptDigest' };
  }
  return { ok: true };
}

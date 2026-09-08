/**
 * Scholomium Ink — SCD128 Quarantine Enforcement & Gating
 *
 * Enforces Law 6: Quarantine is non-heritable.
 * Quarantined previews may teach a human, but never Scholomium Ink.
 * They cannot enter a corpus, derive an AMP, become ancestry, or be exported as canonical evidence.
 */

import { SCD128_ERROR_CODES } from '../scd128.constants.js';

export function isQuarantined(receipt) {
  if (!receipt || typeof receipt !== 'object') return true;
  return receipt.verdict !== 'approved' || receipt.mode !== 'canonical';
}

export function assertNotQuarantined(receipt, actionName = 'Operation') {
  if (isQuarantined(receipt)) {
    const reason = receipt?.conflicts?.map((c) => c.description).join('; ') || 'Verdict is not approved in canonical mode';
    const err = new Error(`${actionName} refused: receipt is quarantined. (${reason})`);
    err.code = SCD128_ERROR_CODES.QUARANTINE_VIOLATION;
    err.receipt = receipt;
    throw err;
  }
}

export function canAdmitToCorpus(receipt) {
  return !isQuarantined(receipt);
}

export function canDeriveAMP(receipt) {
  return !isQuarantined(receipt);
}

export function canActAsParent(receipt) {
  return !isQuarantined(receipt);
}

export function canExportCanonical(receipt) {
  return !isQuarantined(receipt);
}

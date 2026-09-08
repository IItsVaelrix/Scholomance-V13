/**
 * Scholomium Ink — Content-Addressed Corpus Ledger
 *
 * Implements the append-only ledger for canonical masters and approved descendants.
 * Enforces:
 * - Unique source digests (no duplicate assets).
 * - Quarantine exclusion (no quarantined preview may enter ledger).
 * - Cryptographic audit trail linking source, witnesses, Lawyer receipt, and admission receipt.
 */

import { computeCanonicalDigest256 } from '../scd128/scd128.canonical.js';
import { validateAdmissionReceipt } from './corpus.schema.js';
import { isQuarantined } from '../scd128/counsel/quarantine.js';
import { CORPUS_LEDGER_CONTRACT, CORPUS_SCHEMA_VERSION } from './corpus.schema.js';
import { SCD128_ERROR_CODES } from '../scd128/scd128.constants.js';

export class CorpusLedger {
  constructor() {
    this.entries = new Map();
    this.sourceDigestIndex = new Set();
  }

  admit({
    specimenId,
    family,
    counselReceipt,
    admissionReceipt,
    scdlSource,
    evidenceBundle = {},
  }) {
    if (this.entries.has(specimenId)) {
      const err = new Error(`Corpus admission rejected: specimen '${specimenId}' already admitted`);
      err.code = SCD128_ERROR_CODES.CORPUS_ADMISSION;
      throw err;
    }

    if (isQuarantined(counselReceipt)) {
      const err = new Error(`Corpus admission rejected: specimen '${specimenId}' has quarantined counsel receipt`);
      err.code = SCD128_ERROR_CODES.QUARANTINE_VIOLATION;
      throw err;
    }

    const receiptCheck = validateAdmissionReceipt(admissionReceipt);
    if (!receiptCheck.ok) {
      const err = new Error(`Corpus admission rejected: invalid admission receipt (${receiptCheck.reason})`);
      err.code = SCD128_ERROR_CODES.CORPUS_ADMISSION;
      throw err;
    }

    const sourceDigest = admissionReceipt.sourceDigest;
    if (this.sourceDigestIndex.has(sourceDigest)) {
      const err = new Error(`Corpus admission rejected: duplicate source digest '${sourceDigest}'`);
      err.code = SCD128_ERROR_CODES.CORPUS_ADMISSION;
      throw err;
    }

    const entry = Object.freeze({
      specimenId,
      family,
      checksum128: counselReceipt.checksum128,
      formDigest256: counselReceipt.formDigest256,
      realizationDigest256: counselReceipt.realizationDigest256,
      counselReceiptDigest: counselReceipt.receiptDigest256,
      admissionDigest256: admissionReceipt.admissionDigest256,
      sourceDigest,
      approvedBy: admissionReceipt.approvedBy,
      admittedEpoch: admissionReceipt.admittedEpoch,
      evidenceBundle: Object.freeze({ ...evidenceBundle }),
      scdlSource,
    });

    this.entries.set(specimenId, entry);
    this.sourceDigestIndex.add(sourceDigest);
    return entry;
  }

  get(specimenId) {
    return this.entries.get(specimenId) || null;
  }

  list() {
    return Array.from(this.entries.values());
  }

  exportSnapshot() {
    const sortedEntries = this.list().sort((a, b) => a.specimenId.localeCompare(b.specimenId));
    const ledgerPreimage = {
      contract: CORPUS_LEDGER_CONTRACT,
      schemaVersion: CORPUS_SCHEMA_VERSION,
      count: sortedEntries.length,
      entries: sortedEntries,
    };
    const ledgerDigest256 = computeCanonicalDigest256(ledgerPreimage);
    return Object.freeze({
      ...ledgerPreimage,
      ledgerDigest256,
    });
  }

  verifyIntegrity() {
    for (const entry of this.entries.values()) {
      if (!entry.checksum128 || entry.checksum128.length !== 128) {
        return { ok: false, reason: `Corpus entry '${entry.specimenId}' has invalid checksum128` };
      }
      if (!entry.admissionDigest256 || entry.admissionDigest256.length !== 64) {
        return { ok: false, reason: `Corpus entry '${entry.specimenId}' has invalid admissionDigest256` };
      }
    }
    return { ok: true, count: this.entries.size };
  }
}

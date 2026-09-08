import { describe, it, expect } from 'vitest';
import {
  isQuarantined,
  assertNotQuarantined,
  canAdmitToCorpus,
  canDeriveAMP,
  canActAsParent,
  canExportCanonical,
} from '../../../../../codex/core/pixelbrain/scholomium-ink/scd128/counsel/quarantine.js';

describe('SCD128 Quarantine Invariants & Gates', () => {
  const approvedReceipt = {
    contract: 'SCD128-COUNSEL-v1',
    schemaVersion: 1,
    mode: 'canonical',
    verdict: 'approved',
    checksum128: 'A'.repeat(128),
    conflicts: [],
  };

  const quarantinedReceipt = {
    contract: 'SCD128-COUNSEL-v1',
    schemaVersion: 1,
    mode: 'canonical',
    verdict: 'quarantined',
    checksum128: 'B'.repeat(128),
    conflicts: [{ ruleId: 'STYLE_MISMATCH', description: 'Incompatible' }],
  };

  const laboratoryReceipt = {
    contract: 'SCD128-COUNSEL-v1',
    schemaVersion: 1,
    mode: 'laboratory',
    verdict: 'quarantined',
    checksum128: 'C'.repeat(128),
    conflicts: [],
  };

  it('correctly identifies approved vs quarantined receipts', () => {
    expect(isQuarantined(approvedReceipt)).toBe(false);
    expect(isQuarantined(quarantinedReceipt)).toBe(true);
    expect(isQuarantined(laboratoryReceipt)).toBe(true);
    expect(isQuarantined(null)).toBe(true);
    expect(isQuarantined({})).toBe(true);
  });

  it('permits operations only for approved receipts and blocks quarantined', () => {
    expect(canAdmitToCorpus(approvedReceipt)).toBe(true);
    expect(canAdmitToCorpus(quarantinedReceipt)).toBe(false);
    expect(canAdmitToCorpus(laboratoryReceipt)).toBe(false);

    expect(canDeriveAMP(approvedReceipt)).toBe(true);
    expect(canDeriveAMP(quarantinedReceipt)).toBe(false);

    expect(canActAsParent(approvedReceipt)).toBe(true);
    expect(canActAsParent(quarantinedReceipt)).toBe(false);

    expect(canExportCanonical(approvedReceipt)).toBe(true);
    expect(canExportCanonical(quarantinedReceipt)).toBe(false);
  });

  it('throws QUARANTINE_VIOLATION error when assertNotQuarantined fails', () => {
    expect(() => assertNotQuarantined(approvedReceipt, 'Export')).not.toThrow();
    expect(() => assertNotQuarantined(quarantinedReceipt, 'Corpus Admission')).toThrow(/quarantined/i);
    expect(() => assertNotQuarantined(laboratoryReceipt, 'AMP Derivation')).toThrow(/quarantined/i);
  });
});

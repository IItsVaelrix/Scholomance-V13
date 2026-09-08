import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TREE_FAMILIES } from '../../../../../codex/core/pixelbrain/scholomium-ink/families/tree/tree-form.vocabulary.js';
import { auditTreeCorpus } from '../../../../../scripts/scholomium-ink-corpus.mjs';

describe('SCD128 Seven-Tree Pilot Corpus', () => {
  const ASSETS_ROOT = resolve('assets/ASSETS/scholomium-ink/trees');

  it('contains valid and complete on-disk evidence bundles for all seven masters', () => {
    expect(TREE_FAMILIES).toHaveLength(7);

    const requiredFiles = [
      'structural-brief.md',
      'master.scdl',
      'form-evidence.json',
      'realization-evidence.json',
      'form64.json',
      'realization64.json',
      'counsel-receipt.json',
      'admission-receipt.json',
    ];

    for (const family of TREE_FAMILIES) {
      const familyDir = resolve(ASSETS_ROOT, family);
      expect(existsSync(familyDir)).toBe(true);

      for (const reqFile of requiredFiles) {
        const filePath = resolve(familyDir, reqFile);
        expect(existsSync(filePath)).toBe(true);
      }

      // Check form64.json
      const form = JSON.parse(readFileSync(resolve(familyDir, 'form64.json'), 'utf8'));
      expect(form.contract).toBe('SCD128-FORM64-v1');
      expect(form.checksum64.startsWith('81')).toBe(true);
      expect(form.slots).toHaveLength(8);

      // Check realization64.json
      const real = JSON.parse(readFileSync(resolve(familyDir, 'realization64.json'), 'utf8'));
      expect(real.contract).toBe('SCD128-REALIZATION64-v1');
      expect(real.checksum64.startsWith('91')).toBe(true);
      expect(real.slots).toHaveLength(8);

      // Check counsel-receipt.json
      const counsel = JSON.parse(readFileSync(resolve(familyDir, 'counsel-receipt.json'), 'utf8'));
      expect(counsel.contract).toBe('SCD128-COUNSEL-v1');
      expect(counsel.verdict).toBe('approved');
      expect(counsel.mode).toBe('canonical');
      expect(counsel.checksum128).toBe(form.checksum64 + real.checksum64);

      // Check admission-receipt.json
      const admission = JSON.parse(readFileSync(resolve(familyDir, 'admission-receipt.json'), 'utf8'));
      expect(admission.contract).toBe('SCD128-ADMISSION-v1');
      expect(admission.approvedBy).toBe('Angel');
      expect(admission.checksum128).toBe(counsel.checksum128);
    }
  });

  it('audits corpus-ledger.json and confirms all 7 entries pass integrity checks', () => {
    const audit = auditTreeCorpus();
    expect(audit.ok).toBe(true);
    expect(audit.count).toBe(7);
    expect(audit.entries).toHaveLength(7);

    // Verify all source digests are distinct
    const sourceDigests = new Set(audit.entries.map((e) => e.sourceDigest));
    expect(sourceDigests.size).toBe(7);

    // Verify all checksum128 are distinct
    const checksums = new Set(audit.entries.map((e) => e.checksum128));
    expect(checksums.size).toBe(7);
  });
});

import { describe, it, expect } from 'vitest';
import { computePageBytecode, CONSTELLATION_CONTRACT_VERSION } from '../../../codex/core/constellation/pageBytecode.js';

const basis = {
  normalized: 'the bright wound of morning',
  kind: 'phrase',
  engineVersions: { leximancy: 'lex-1', rhymeAstrology: 'ra-1' },
};

describe('computePageBytecode', () => {
  it('is deterministic for the same basis', () => {
    expect(computePageBytecode(basis)).toBe(computePageBytecode(basis));
  });

  it('has the COS-PAGE-v1 prefix', () => {
    expect(computePageBytecode(basis)).toMatch(/^COS-PAGE-v1-[0-9A-F]+$/);
  });

  it('changes when the normalized query changes', () => {
    expect(computePageBytecode(basis)).not.toBe(
      computePageBytecode({ ...basis, normalized: 'gravity' }),
    );
  });

  it('changes when an engine version changes', () => {
    expect(computePageBytecode(basis)).not.toBe(
      computePageBytecode({ ...basis, engineVersions: { leximancy: 'lex-2', rhymeAstrology: 'ra-1' } }),
    );
  });

  it('exposes the contract version', () => {
    expect(CONSTELLATION_CONTRACT_VERSION).toBe('cos-page-phase1-v1');
  });
});

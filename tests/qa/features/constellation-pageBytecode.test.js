import { describe, it, expect } from 'vitest';
import { computePageBytecode, CONSTELLATION_CONTRACT_VERSION } from '../../../codex/core/constellation/pageBytecode.js';

/**
 * GOLDEN VECTORS — feedback report 2026-08-19 (P0-2): "Golden vectors proving
 * every lawful basis field affects identity." Each lawful PDR §16 input gets a
 * vector proving it re-keys the page; each EXCLUDED input gets a vector proving
 * it does not. The basis was rebuilt from [contract, normalized, kind,
 * partial engineVersions] to the full PDR §16 set — these tests are the proof
 * the rebuild is complete, not aspirational.
 */
const basis = {
  normalized: 'the bright wound of morning',
  kind: 'phrase',
  intent: 'literary',
  engineVersions: { leximancy: 'lex-1', rhymeAstrology: 'ra-1' },
  scoringProfiles: { senseRanking: 'sr-1' },
  corpusChecksum: 'corpus:100:5000:4:1234',
  flags: { phonology: 'ready', wordnet: 'on', corpus: 'on', scaleOrders: 'on' },
};

describe('computePageBytecode', () => {
  it('is deterministic for the same basis', () => {
    expect(computePageBytecode(basis)).toBe(computePageBytecode(basis));
  });

  it('has the COS-PAGE-v1 prefix', () => {
    expect(computePageBytecode(basis)).toMatch(/^COS-PAGE-v1-[0-9A-F]+$/);
  });

  it('exposes the v2 contract version', () => {
    expect(CONSTELLATION_CONTRACT_VERSION).toBe('cos-page-v2');
  });

  describe('every lawful basis field re-keys identity', () => {
    it('normalized query', () => {
      expect(computePageBytecode(basis)).not.toBe(
        computePageBytecode({ ...basis, normalized: 'gravity' }),
      );
    });

    it('query kind', () => {
      expect(computePageBytecode(basis)).not.toBe(
        computePageBytecode({ ...basis, kind: 'word' }),
      );
    });

    it('parsed intent', () => {
      expect(computePageBytecode(basis)).not.toBe(
        computePageBytecode({ ...basis, intent: 'meta-query' }),
      );
    });

    it('an engine version', () => {
      expect(computePageBytecode(basis)).not.toBe(
        computePageBytecode({ ...basis, engineVersions: { leximancy: 'lex-2', rhymeAstrology: 'ra-1' } }),
      );
    });

    it('a scoring profile version', () => {
      expect(computePageBytecode(basis)).not.toBe(
        computePageBytecode({ ...basis, scoringProfiles: { senseRanking: 'sr-2' } }),
      );
    });

    it('the corpus checksum', () => {
      expect(computePageBytecode(basis)).not.toBe(
        computePageBytecode({ ...basis, corpusChecksum: 'corpus:100:5000:4:9999' }),
      );
    });

    it('corpus present vs absent', () => {
      expect(computePageBytecode(basis)).not.toBe(
        computePageBytecode({ ...basis, corpusChecksum: null }),
      );
    });

    it('a deterministic option flag', () => {
      expect(computePageBytecode(basis)).not.toBe(
        computePageBytecode({ ...basis, flags: { ...basis.flags, phonology: 'pending' } }),
      );
    });
  });

  describe('excluded inputs never re-key identity (PDR §16)', () => {
    it('version-map key order is irrelevant', () => {
      expect(computePageBytecode(basis)).toBe(
        computePageBytecode({ ...basis, engineVersions: { rhymeAstrology: 'ra-1', leximancy: 'lex-1' } }),
      );
    });

    it('absent optional fields fall back stably', () => {
      const minimal = { normalized: 'gravity', kind: 'word', engineVersions: {} };
      expect(computePageBytecode(minimal)).toBe(computePageBytecode(minimal));
      expect(computePageBytecode(minimal)).toMatch(/^COS-PAGE-v1-[0-9A-F]+$/);
    });

    it('null intent and missing intent are the same page', () => {
      expect(computePageBytecode({ ...basis, intent: null })).toBe(
        computePageBytecode({ ...basis, intent: undefined }),
      );
    });
  });

  describe('golden pin — the v2 basis is a sealed identity', () => {
    it('the canonical basis hashes to a stable value', () => {
      // If this pin changes, the basis changed — that is a contract event,
      // not a coincidence. Update the pin deliberately and say why.
      expect(computePageBytecode(basis)).toBe('COS-PAGE-v1-4922C817');
    });
  });
});

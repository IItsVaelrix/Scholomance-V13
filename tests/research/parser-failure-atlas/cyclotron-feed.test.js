/**
 * ATLAS → CYCLOTRON FEED
 *
 * Production change that would make these fail: feeding the cyclotron a
 * raw corpus instead of atlas-selected failures; dropping the plate and
 * construction-label provenance from a candidate; or letting the sealed
 * test split reach construction ranking.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseConllu } from '../../../codex/core/constellation/treebank.js';
import { loadPosMap } from '../../../scripts/lib/constellation-corpus.mjs';
import { feedCyclotron } from '../../../codex/research/parser-failure-atlas/cyclotron-feed.js';

const RECORDS = parseConllu(
  readFileSync('tests/qa/fixtures/constellation/treebank-gate.conllu', 'utf8'),
).filter((r) => (r.tokens || []).length <= 12).slice(0, 60);

describe('feedCyclotron', () => {
  const posMap = loadPosMap();

  it('feeds the cyclotron atlas failures, not the raw corpus', () => {
    const fed = feedCyclotron(RECORDS, posMap, { minCount: 1, topPairs: 20 });

    expect(fed.recordsIn).toBe(RECORDS.length);
    expect(fed.atlasCases).toBeGreaterThan(0);
    expect(fed.atlasCases).toBeLessThan(RECORDS.length);
    expect(fed.recordsFed).toBe(fed.atlasCases);
  });

  it('carries plate and construction-label provenance onto every candidate', () => {
    const fed = feedCyclotron(RECORDS, posMap, { minCount: 1, topPairs: 20 });

    expect(fed.candidates.length).toBeGreaterThan(0);
    for (const candidate of fed.candidates) {
      expect(candidate).toHaveProperty('signature');
      expect(Array.isArray(candidate.bonds)).toBe(true);
      expect(Array.isArray(candidate.evidencePlates)).toBe(true);
      expect(Array.isArray(candidate.evidenceLabels)).toBe(true);
    }
  });

  it('refuses the sealed test split', () => {
    expect(() => feedCyclotron(RECORDS, posMap, { split: 'test' }))
      .toThrow(/sealed|test/i);
  });
});

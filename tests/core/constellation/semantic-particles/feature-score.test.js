/**
 * T1 relational scorer — values interact; knownness is not a reward.
 *
 * Production change that would make these fail: scoring a lone lexical
 * feature, or giving animate=true and animate=false the same subject-of-motion
 * edge score.
 */
import { describe, expect, it } from 'vitest';

import { derangeFeatureValues } from '../../../../codex/core/constellation/semantic-particles/feature-provider.js';
import { EXPERIMENTAL_FEATURE_PROVIDER } from '../../../../codex/core/constellation/semantic-particles/experimental-inventory.js';
import {
  FEATURE_COMPAT,
  edgeCompatibility,
  projectRelation,
  scoreLexicalReading,
} from '../../../../codex/core/constellation/semantic-particles/feature-score.js';
import { formatPValue } from '../../../../codex/core/constellation/semantic-particles/stats.js';

const provider = EXPERIMENTAL_FEATURE_PROVIDER;

describe('lone knownness earns nothing', () => {
  it('gives a feature-rich isolated reading a null/zero relational score', () => {
    const row = scoreLexicalReading({
      lemma: 'cat',
      type: 'N',
      neighbors: [],
      provider,
    });
    expect(row.known).toBeGreaterThan(0);
    expect(row.score).toBeNull();
    expect(row.used).toBe(false);
  });
});

describe('value-sensitive subject-like compatibility', () => {
  it('scores animate+motion above inanimate+motion, and neither is illegal', () => {
    const live = edgeCompatibility({
      left: { lemma: 'dog', type: 'N' },
      right: { lemma: 'run', type: 'V' },
      relation: 'subject-like',
      provider,
    });
    const rock = edgeCompatibility({
      left: { lemma: 'table', type: 'N' },
      right: { lemma: 'run', type: 'V' },
      relation: 'subject-like',
      provider,
    });
    expect(live.score).toBeGreaterThan(rock.score);
    expect(rock.illegal).toBe(false);
    expect(live.illegal).toBe(false);
  });

  it('lets derangement change an edge score while preserving known-count', () => {
    const neighbors = [{ lemma: 'ran', type: 'V', side: 'right' }];
    const real = scoreLexicalReading({ lemma: 'cat', type: 'N', neighbors, provider });
    const deranged = derangeFeatureValues(provider, 0x53454d31);
    const fake = scoreLexicalReading({
      lemma: 'cat',
      type: 'N',
      neighbors,
      provider: deranged,
    });
    expect(real.used).toBe(true);
    expect(fake.known).toBe(real.known);
    expect(fake.score).not.toBe(real.score);
  });
});

describe('knownness is not a scoring channel', () => {
  it('preserves known-count and still moves some relational scores under derange', () => {
    const pairs = [
      { lemma: 'cat', type: 'N', neighbors: [{ lemma: 'ran', type: 'V', side: 'right' }] },
      { lemma: 'table', type: 'N', neighbors: [{ lemma: 'ran', type: 'V', side: 'right' }] },
      { lemma: 'idea', type: 'N', neighbors: [{ lemma: 'think', type: 'V', side: 'right' }] },
      { lemma: 'to', type: 'TO', neighbors: [{ lemma: 'run', type: 'V', side: 'right' }] },
    ];
    const deranged = derangeFeatureValues(provider, 0x53454d31);
    let moved = 0;
    for (const pair of pairs) {
      const real = scoreLexicalReading({ ...pair, provider });
      const fake = scoreLexicalReading({ ...pair, provider: deranged });
      expect(fake.known).toBe(real.known);
      expect(fake.allUnknown).toBe(real.allUnknown);
      if (real.score !== fake.score) moved += 1;
    }
    expect(moved).toBeGreaterThan(0);
  });
});

describe('high-frequency neighbors get sheet music', () => {
  it('projects ADV+V as adverbial and N+N as compound', () => {
    expect(projectRelation('ADV', 'V', 'right')).toBe('adverbial');
    expect(projectRelation('V', 'ADV', 'right')).toBe('adverbial');
    expect(projectRelation('N', 'N', 'right')).toBe('compound');
  });
});

describe('Phase 8 complement T1', () => {
  it('keeps FEATURE_COMPAT free of complement-relation rows', () => {
    const relations = new Set(FEATURE_COMPAT.map((r) => r.relation));
    expect(relations.has('INFINITIVAL_COMPLEMENT')).toBe(false);
    expect(relations.has('PROPOSITIONAL_COMPLEMENT')).toBe(false);
  });

  it('scores want+INF above leave+INF and marks neither illegal', () => {
    const want = edgeCompatibility({
      left: { lemma: 'want', type: 'V' },
      right: { lemma: 'leave', type: 'INF' },
      relation: 'INFINITIVAL_COMPLEMENT',
      provider,
    });
    const leave = edgeCompatibility({
      left: { lemma: 'leave', type: 'V' },
      right: { lemma: 'go', type: 'INF' },
      relation: 'INFINITIVAL_COMPLEMENT',
      provider,
    });
    expect(want.fired).toBeGreaterThan(0);
    expect(leave.fired).toBe(0);
    expect(want.illegal).toBe(false);
    expect(leave.illegal).toBe(false);
    expect(want.score).toBeGreaterThan(leave.score);
  });
});

describe('p-value printing', () => {
  it('never prints a rounded zero as p = 0', () => {
    expect(formatPValue(0).printed).toBe('p < 1e-6');
    expect(formatPValue(1e-9).printed).toBe('p < 1e-6');
    expect(formatPValue(0.25).printed).toBe('p = 0.25');
    expect(formatPValue(0).test).toMatch(/sign/);
  });
});

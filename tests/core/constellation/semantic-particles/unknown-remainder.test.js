/**
 * Remaining-UNKNOWN buckets. Production change that would make these fail:
 * treating i::PROPN as a content word that deserves particles, or dumping
 * function types into the TRAIN enrichment list.
 */
import { describe, expect, it } from 'vitest';

import { EXPERIMENTAL_FEATURE_PROVIDER } from '../../../../codex/core/constellation/semantic-particles/experimental-inventory.js';
import {
  UNKNOWN_BUCKETS,
  classifyUnknownKey,
  noveltyKind,
  summarizeUnknownBuckets,
} from '../../../../codex/core/constellation/semantic-particles/unknown-remainder.js';

describe('function/systematic keys are bucket A', () => {
  it('sends closed-class types and discourse adverbs to type defaults', () => {
    const cases = [
      ['to', 'P'],
      ['that', 'REL'],
      ['is', 'AUX'],
      ['you', 'PRON'],
      ["'s", 'POSS'],
      ['and', 'CONJ'],
      ['if', 'SUB'],
      ['will', 'MODAL'],
      ['out', 'PRT'],
      ['out', 'ADV'],
      ['there', 'ADV'],
    ];
    for (const [lemma, type] of cases) {
      const row = classifyUnknownKey({ lemma, type });
      expect({ lemma, type, ...row }).toMatchObject({
        bucket: UNKNOWN_BUCKETS.A_FUNCTION,
        action: 'type-default',
      });
    }
  });
});

describe('legitimate content keys are bucket B', () => {
  it('keeps real noun/verb/adjective readings for TRAIN enrichment', () => {
    const cases = [
      ['bicycle', 'N'],
      ['whisper', 'V'],
      ['porous', 'ADJ'],
      ['baghdad', 'PROPN'],
    ];
    for (const [lemma, type] of cases) {
      const row = classifyUnknownKey({ lemma, type });
      expect({ lemma, type, ...row }).toMatchObject({
        bucket: UNKNOWN_BUCKETS.B_CONTENT,
        action: 'train-enrichment',
      });
    }
  });
});

describe('spurious emissions are bucket C', () => {
  it('does not ask the semantic layer to score i::PROPN or implausible content', () => {
    const cases = [
      ['i', 'PROPN'],
      ['a', 'PROPN'],
      ['so', 'N'],
      ['out', 'N'],
      ['out', 'ADJ'],
      ['very', 'ADJ'],
      ['here', 'ADJ'],
      ['why', 'N'],
    ];
    for (const [lemma, type] of cases) {
      const row = classifyUnknownKey({ lemma, type });
      expect({ lemma, type, ...row }).toMatchObject({
        bucket: UNKNOWN_BUCKETS.C_SPURIOUS,
        action: 'fix-emission',
      });
    }
  });
});

describe('novelty distinguishes missing words from extra types', () => {
  it('marks good::N as known-elsewhere-content and bicycle::N as novel', () => {
    const p = EXPERIMENTAL_FEATURE_PROVIDER;
    expect(noveltyKind('good', 'N', p)).toBe('known-elsewhere-content');
    expect(noveltyKind('do', 'V', p)).toBe('known-elsewhere-function');
    expect(noveltyKind('bicycle', 'N', p)).toBe('novel');
  });
});

describe('bucket mass is cumulative and exclusive', () => {
  it('reports share of remaining UNKNOWN mass per bucket', () => {
    const summary = summarizeUnknownBuckets([
      { lemma: 'to', type: 'P', unknownMass: 50 },
      { lemma: 'i', type: 'PROPN', unknownMass: 30 },
      { lemma: 'bicycle', type: 'N', unknownMass: 20 },
    ]);
    expect(summary.totalMass).toBe(100);
    expect(summary.byBucket.A_FUNCTION.mass).toBe(50);
    expect(summary.byBucket.C_SPURIOUS.mass).toBe(30);
    expect(summary.byBucket.B_CONTENT.mass).toBe(20);
    expect(summary.byBucket.A_FUNCTION.share).toBe(0.5);
  });
});

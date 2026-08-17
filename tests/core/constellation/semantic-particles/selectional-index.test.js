/**
 * T2 — Bidirectional selectional-preference charges.
 *
 * Production change that would make these fail: a missing relation scoring
 * 0.5, a negative charge deleting a derivation, or I/O inside the charge
 * function.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { createFeatureProvider } from '../../../../codex/core/constellation/semantic-particles/feature-provider.js';
import {
  freezeSelectionalIndex,
  selectionalCharge,
  SELECTIONAL_ROLES,
} from '../../../../codex/core/constellation/semantic-particles/selectional-index.js';

const require = createRequire(import.meta.url);
const source = require('fs').readFileSync(
  require('path').resolve('codex/core/constellation/semantic-particles/selectional-index.js'),
  'utf8',
);

const index = freezeSelectionalIndex({
  corpusHash: 'fixture:selectional-v1',
  rows: [
    { predicate: 'ran', role: 'subject-like', filler: 'men', count: 40 },
    { predicate: 'ran', role: 'subject-like', filler: 'idea', count: 1 },
    { predicate: 'ate', role: 'object-like', filler: 'men', count: 2 },
  ],
});

function node(type, lemma, from = 0) {
  return {
    type,
    from,
    to: from,
    token: lemma,
    nucleus: { lemmas: [lemma], headLemmas: [lemma] },
  };
}

describe('bidirectional selectional charges', () => {
  it('exposes the coarse roles the chart can actually project', () => {
    expect(SELECTIONAL_ROLES).toEqual([
      'subject-like',
      'object-like',
      'pp-complement',
      'copular-complement',
      'modifier',
      'particle-complementizer',
    ]);
    expect(source).not.toMatch(/fs\.|fetch\(|sqlite|createRequire/);
  });

  it('abstains on unseen relations instead of emitting a default score', () => {
    const r = selectionalCharge(
      node('V', 'dreamed'),
      node('NP', 'quarks', 1),
      ['V', 'NP', 'VP', 0],
      index,
    );
    expect(r.abstain).toBe(true);
    expect(r.score).toBeNull();
    expect(r.confidence).toBeNull();
    expect(r.reason).toMatch(/unseen|abstain/i);
  });

  it('separates forward and inverse contributions on a known pair', () => {
    const r = selectionalCharge(
      node('NP', 'men'),
      node('VP', 'ran', 1),
      ['NP', 'VP', 'S', 1],
      index,
    );
    expect(r.abstain).toBe(false);
    expect(typeof r.forward).toBe('number');
    expect(typeof r.inverse).toBe('number');
    expect(r.score).toBe(r.forward + r.inverse);
    expect(r.support).toBeGreaterThan(0);
    expect(r.corpusHash).toBe('fixture:selectional-v1');
  });

  it('backs off through the microfeature class when the filler lemma is unseen', () => {
    const provider = createFeatureProvider();
    const r = selectionalCharge(
      node('NP', 'man'),
      node('VP', 'ran', 1),
      ['NP', 'VP', 'S', 1],
      index,
      { featureProvider: provider },
    );
    expect(r.abstain).toBe(false);
    expect(r.backoff).toBe('semantic-class');
  });

  it('never returns a hard reject — negative charge is a score, not deletion', () => {
    const r = selectionalCharge(
      node('NP', 'idea'),
      node('VP', 'ran', 1),
      ['NP', 'VP', 'S', 1],
      index,
    );
    expect(r.reject).toBeUndefined();
    expect(r.delete).toBeUndefined();
    expect(r.score === null || Number.isFinite(r.score)).toBe(true);
  });
});

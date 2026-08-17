/**
 * Observe-only coverage counters. Production change that would make these
 * fail: counting a sense-less atom as lexically lit, or counting an
 * uninterpreted bond as a composed structure.
 */
import { describe, expect, it } from 'vitest';

import { EXPERIMENTAL_FEATURE_PROVIDER } from '../../../../codex/core/constellation/semantic-particles/experimental-inventory.js';
import {
  DEFAULT_LEXICAL_LEXICON,
  createLexicalLexicon,
} from '../../../../codex/core/constellation/semantic-particles/lexical-semantics.js';
import { leafMeaning } from '../../../../codex/core/constellation/semantic-particles/compositional-semantics.js';
import {
  diagnoseT1Edge,
  observeAtomCoverage,
  observeDerivationCoverage,
  rolesComplete,
  summarizeObserveCoverage,
} from '../../../../codex/core/constellation/semantic-particles/observe-coverage.js';

function leaf(type, lemma) {
  return {
    type,
    token: lemma,
    nucleus: { lemmas: [lemma], headLemmas: [lemma] },
    derivations: [],
  };
}

describe('lexical atom coverage', () => {
  it('lights men::N on the authored lexicon and leaves qzxqzx dark', () => {
    const lit = observeAtomCoverage({ lemma: 'men', type: 'N' }, DEFAULT_LEXICAL_LEXICON, EXPERIMENTAL_FEATURE_PROVIDER);
    const dark = observeAtomCoverage({ lemma: 'qzxqzx', type: 'N' }, DEFAULT_LEXICAL_LEXICON, EXPERIMENTAL_FEATURE_PROVIDER);
    expect(lit.senseHit).toBe(true);
    expect(lit.featureHit).toBe(true);
    expect(dark.senseHit).toBe(false);
    expect(dark.featureHit).toBe(false);
  });
});

describe('compositional derivation coverage', () => {
  it('treats NP+VP→S with men/ran as a complete structure and an unknown NP as lexical starvation', () => {
    const ok = observeDerivationCoverage(
      leafMeaning(leaf('NP', 'men')),
      leafMeaning(leaf('VP', 'ran')),
      ['NP', 'VP', 'S', 1],
    );
    expect(ok.named).toBe(true);
    expect(ok.complete).toBe(true);
    expect(ok.unknown).toBe(false);
    expect(ok.starvation).toBeNull();

    const starved = observeDerivationCoverage(
      leafMeaning(leaf('NP', 'men')),
      leafMeaning(leaf('VP', 'qzxqzx'), createLexicalLexicon({})),
      ['NP', 'VP', 'S', 1],
    );
    expect(starved.named).toBe(true);
    expect(starved.unknown).toBe(true);
    expect(starved.starvation).toBe('lexical');
  });

  it('labels an uninterpreted bond as compositional starvation', () => {
    const row = observeDerivationCoverage(
      leafMeaning(leaf('CONJ', 'and')),
      leafMeaning(leaf('N', 'men')),
      ['CONJ', 'N', 'N', 1],
    );
    expect(row.named).toBe(false);
    expect(row.starvation).toBe('compositional');
  });
});

describe('T1 edge diagnosis', () => {
  it('can fire on cat+ran and abstains when one side is missing', () => {
    const fire = diagnoseT1Edge(
      { lemma: 'cat', type: 'N' },
      { lemma: 'ran', type: 'V', side: 'right' },
      EXPERIMENTAL_FEATURE_PROVIDER,
    );
    expect(fire.status).toBe('could-fire');
    const missing = diagnoseT1Edge(
      { lemma: 'qzxqzx', type: 'N' },
      { lemma: 'ran', type: 'V', side: 'right' },
      EXPERIMENTAL_FEATURE_PROVIDER,
    );
    expect(missing.status).toBe('one-side-missing');
  });
});

describe('role completeness', () => {
  it('requires Agent+Event for a clause and Entity+Property for modification', () => {
    expect(rolesComplete('clause-predication', { Agent: 'men', Event: 'ran' })).toBe(true);
    expect(rolesComplete('clause-predication', { Event: 'ran' })).toBe(false);
    expect(rolesComplete('intersective-modification', { Entity: 'men', Property: 'old' })).toBe(true);
    expect(rolesComplete('uninterpreted-bond', { Agent: 'x' })).toBe(false);
  });
});

describe('summary rates', () => {
  it('reports shares against the declared denominators', () => {
    const summary = summarizeObserveCoverage({
      ambiguousAtoms: 10,
      senseHits: 2,
      featureHits: 4,
      derivations: 8,
      namedDerivations: 5,
      completeDerivations: 3,
      t1Edges: 10,
      t1CouldFire: 3,
      t1OneSideMissing: 4,
      lexicalStarvation: 2,
      compositionalStarvation: 3,
    });
    expect(summary.senseRate).toBe(0.2);
    expect(summary.featureRate).toBe(0.4);
    expect(summary.namedRate).toBe(0.625);
    expect(summary.t1FireRate).toBe(0.3);
    expect(summary.t1MissingSideRate).toBe(0.4);
  });
});

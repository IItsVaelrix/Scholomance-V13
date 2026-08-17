/**
 * Decision-bearing coverage. Production change that would make these
 * fail: counting S+PUNCT as a missing semantic relation, or counting a
 * named-versus-silent pair as two songs.
 */
import { describe, expect, it } from 'vitest';

import { EXPERIMENTAL_FEATURE_PROVIDER } from '../../../../codex/core/constellation/semantic-particles/experimental-inventory.js';
import { DEFAULT_LEXICAL_LEXICON } from '../../../../codex/core/constellation/semantic-particles/lexical-semantics.js';
import {
  bondFamily,
  derivationSignature,
  isGlueBond,
  observeCompetitiveCell,
  summarizeDecisionBearing,
} from '../../../../codex/core/constellation/semantic-particles/decision-bearing.js';

function leaf(type, lemma, from = 0) {
  return {
    type,
    from,
    to: from,
    token: lemma,
    nucleus: { lemmas: [lemma], headLemmas: [lemma] },
    derivations: [],
  };
}

function cell(type, from, to, derivations) {
  return { type, from, to, token: null, derivations };
}

describe('glue vs decision-bearing bonds', () => {
  it('treats punctuation absorb as glue and leaves clause attachment in the denominator', () => {
    expect(isGlueBond(['S', 'PUNCT', 'S'])).toBe(true);
    expect(isGlueBond(['NP', 'PUNCT', 'NP'])).toBe(true);
    expect(isGlueBond(['SCOMMA', 'S', 'S'])).toBe(true);
    expect(isGlueBond(['PP', 'S', 'S'])).toBe(false);
    expect(isGlueBond(['S', 'SBAR', 'S'])).toBe(false);
    expect(isGlueBond(['NPCOMMA', 'NP', 'APPOS'])).toBe(false);
    expect(isGlueBond(['NP', 'VP', 'S'])).toBe(false);
  });

  it('names complement, modifier, argument, coordination, and clause attachment', () => {
    expect(bondFamily(['NP', 'VP', 'S'])).toBe('argument');
    expect(bondFamily(['ADJ', 'N', 'N'])).toBe('modifier');
    expect(bondFamily(['S', 'SBAR', 'S'])).toBe('complement');
    expect(bondFamily(['CONJ', 'NP', 'CONJNP'])).toBe('coordination');
    expect(bondFamily(['PP', 'S', 'S'])).toBe('clause-attachment');
    expect(bondFamily(['VP', 'INF', 'VP'])).toBe('complement');
    expect(bondFamily(['INV', 'VP', 'S'])).toBe('argument');
    expect(bondFamily(['S', 'PUNCT', 'S'])).toBe('glue');
  });
});

describe('derivation signatures', () => {
  it('treats different child spans as different alternatives and same punct absorb as one', () => {
    const s = leaf('S', 'ran', 2);
    s.to = 4;
    const punct = leaf('PUNCT', '.', 5);
    const ppEarly = leaf('PP', 'in', 0);
    ppEarly.to = 1;
    const ppLate = leaf('PP', 'in', 3);
    ppLate.to = 4;
    const samePunct = derivationSignature({ bond: ['S', 'PUNCT', 'S'], left: s, right: punct });
    const alsoPunct = derivationSignature({ bond: ['S', 'PUNCT', 'S'], left: s, right: punct });
    expect(samePunct).toBe(alsoPunct);
    expect(derivationSignature({ bond: ['PP', 'S', 'S'], left: ppEarly, right: s }))
      .not.toBe(derivationSignature({ bond: ['PP', 'S', 'S'], left: ppLate, right: s }));
  });
});

describe('competitive cell observation', () => {
  it('excludes a cell whose only competition is punctuation absorb', () => {
    const clause = leaf('NP', 'men');
    const vp = leaf('VP', 'ran', 1);
    const s = leaf('S', 'ran', 0);
    s.to = 1;
    const punct = leaf('PUNCT', '.', 2);
    const node = cell('S', 0, 2, [
      { bond: ['NP', 'VP', 'S'], left: clause, right: vp },
      { bond: ['S', 'PUNCT', 'S'], left: s, right: punct },
    ]);
    const row = observeCompetitiveCell(node, DEFAULT_LEXICAL_LEXICON, EXPERIMENTAL_FEATURE_PROVIDER);
    expect(row.competitive).toBe(true);
    expect(row.decisionCompetitive).toBe(false);
    expect(row.stronglyDistinguishable).toBe(false);
  });

  it('does not call named-versus-silent two songs', () => {
    const np = leaf('NP', 'men');
    const vp = leaf('VP', 'ran', 1);
    const pp = leaf('PP', 'in', 0);
    pp.to = 0;
    const s = leaf('S', 'ran', 1);
    s.to = 2;
    const node = cell('S', 0, 2, [
      { bond: ['NP', 'VP', 'S'], left: np, right: vp },
      { bond: ['PP', 'S', 'S'], left: pp, right: s },
    ]);
    const row = observeCompetitiveCell(node, DEFAULT_LEXICAL_LEXICON, EXPERIMENTAL_FEATURE_PROVIDER);
    expect(row.decisionCompetitive).toBe(true);
    expect(row.weaklyDistinguishable).toBe(true);
    expect(row.stronglyDistinguishable).toBe(false);
    expect(row.missingFamilies).toContain('clause-attachment');
  });

  it('counts a cell as strongly distinguishable when two content alternatives both carry factors', () => {
    const adj = leaf('ADJ', 'old');
    const noun = leaf('N', 'men', 1);
    const leftN = leaf('N', 'man');
    const rightN = leaf('N', 'men', 1);
    const node = cell('N', 0, 1, [
      { bond: ['ADJ', 'N', 'N'], left: adj, right: noun },
      { bond: ['N', 'N', 'N'], left: leftN, right: rightN },
    ]);
    const row = observeCompetitiveCell(node, DEFAULT_LEXICAL_LEXICON, EXPERIMENTAL_FEATURE_PROVIDER);
    expect(row.decisionCompetitive).toBe(true);
    expect(row.stronglyDistinguishable).toBe(true);
  });
});

describe('summary rates', () => {
  it('reports group coverage against decision-competitive cells, not all packed cells', () => {
    const summary = summarizeDecisionBearing({
      packedCells: 10,
      competitiveCells: 6,
      decisionCompetitiveCells: 5,
      weaklyDistinguishable: 3,
      stronglyDistinguishable: 1,
      decisionBearingEdges: 8,
      decisionBearingCouldFire: 2,
    });
    expect(summary.decisionBearingGroupRate).toBe(0.2);
    expect(summary.weakDistinguishRate).toBe(0.6);
    expect(summary.decisionBearingEdgeCouldFireRate).toBe(0.25);
  });
});

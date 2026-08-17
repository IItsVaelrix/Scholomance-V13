/**
 * Compositional semantics — grammar combines word meanings by logic rules.
 *
 * Production change that would make these fail: scoring a phrase by
 * feature-count instead of role bindings, or writing the forest, or
 * collapsing bank's two senses before the adjective chooses.
 */
import { describe, expect, it } from 'vitest';

import { composePacked } from '../../../../codex/core/constellation/compose-packed.js';
import { forestFingerprint } from '../../../../codex/core/constellation/semantic-particles/annotate.js';
import { createLexicalLexicon } from '../../../../codex/core/constellation/semantic-particles/lexical-semantics.js';
import {
  composeMeanings,
  leafMeaning,
  meaningOf,
} from '../../../../codex/core/constellation/semantic-particles/compositional-semantics.js';

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

describe('who did what to whom is a role binding, not a feature count', () => {
  it('binds Agent and Event on NP + VP → S', () => {
    const np = leafMeaning(leaf('NP', 'men'));
    const vp = leafMeaning(leaf('VP', 'ran'));
    const composed = composeMeanings(np, vp, ['NP', 'VP', 'S', 1]);
    expect(composed.readings.length).toBeGreaterThan(0);
    const top = composed.readings[0];
    expect(top.roles.Agent).toBe('men');
    expect(top.roles.Event).toBe('ran');
    expect(top.rule).toBe('clause-predication');
  });

  it('binds Stimulus on V + NPO → VP for a perception verb', () => {
    const verb = leafMeaning(leaf('V', 'see'));
    const obj = leafMeaning(leaf('NPO', 'him'));
    const composed = composeMeanings(verb, obj, ['V', 'NPO', 'VP', 0]);
    const top = composed.readings[0];
    expect(top.roles.Stimulus).toBe('him');
    expect(top.roles.Event).toBe('see');
    expect(top.rule).toBe('object-predication');
  });
});

describe('modifiers apply a property without inventing a clause', () => {
  it('keeps men as the entity when old modifies men', () => {
    const adj = leafMeaning(leaf('ADJ', 'old'));
    const noun = leafMeaning(leaf('N', 'men'));
    const composed = composeMeanings(adj, noun, ['ADJ', 'N', 'N', 1]);
    const top = composed.readings[0];
    expect(top.roles.Entity).toBe('men');
    expect(top.roles.Property).toBe('old');
    expect(top.rule).toBe('intersective-modification');
  });
});

describe('polysemy survives until composition', () => {
  it('lets federal prefer the institution sense of bank, steep the river sense', () => {
    const bank = leafMeaning(leaf('N', 'bank'));
    expect(bank.readings.length).toBe(2);
    const federal = composeMeanings(leafMeaning(leaf('ADJ', 'federal')), bank, ['ADJ', 'N', 'N', 1]);
    const steep = composeMeanings(leafMeaning(leaf('ADJ', 'steep')), bank, ['ADJ', 'N', 'N', 1]);
    expect(federal.readings[0].sense).toBe('bank.n.money');
    expect(steep.readings[0].sense).toBe('bank.n.river');
    expect(federal.readings[0].score).not.toBe(steep.readings[0].score);
  });
});

describe('unknown follows the head, not every child', () => {
  it('keeps men+ran filled when the adjective is dark', () => {
    const empty = createLexicalLexicon({});
    const modified = composeMeanings(
      leafMeaning(leaf('ADJ', 'qzxqzx'), empty),
      leafMeaning(leaf('N', 'men')),
      ['ADJ', 'N', 'N', 1],
    );
    expect(modified.readings[0].unknown).toBe(false);
    expect(modified.readings[0].roles.Entity).toBe('men');
    const clause = composeMeanings(
      leafMeaning(leaf('NP', 'men')),
      leafMeaning(leaf('VP', 'ran')),
      ['NP', 'VP', 'S', 1],
    );
    expect(clause.readings[0].unknown).toBe(false);
  });

  it('names ADV+VP and NC+NC instead of leaving blank sheet music', () => {
    const adv = composeMeanings(
      leafMeaning(leaf('ADV', 'quickly')),
      leafMeaning(leaf('VP', 'ran')),
      ['ADV', 'VP', 'VP', 1],
    );
    expect(adv.rule).toBe('adverbial-modification');
    const compound = composeMeanings(
      leafMeaning(leaf('NC', 'staff')),
      leafMeaning(leaf('NC', 'name')),
      ['NC', 'NC', 'NC', 1],
    );
    expect(compound.rule).toBe('compound-nominal');
  });
});

describe('unknown children abstain rather than fake a role', () => {
  it('binds the surface filler and keeps the clause filled when the predicate is known', () => {
    const np = leafMeaning(leaf('NP', 'qzxqzx'));
    const vp = leafMeaning(leaf('VP', 'ran'));
    const composed = composeMeanings(np, vp, ['NP', 'VP', 'S', 1]);
    expect(composed.readings[0].roles.Agent).toBe('qzxqzx');
    expect(composed.readings[0].roles.Event).toBe('ran');
    expect(composed.readings[0].unknown).toBe(false);
  });
});

describe('meaningOf stays bounded on packed forests', () => {
  it('does not throw when a node carries many derivations', () => {
    const leafA = leaf('N', 'men');
    const leafB = leaf('V', 'ran');
    const node = {
      type: 'S',
      from: 0,
      to: 1,
      nucleus: { headLemmas: ['ran'] },
      derivations: Array.from({ length: 80 }, () => ({
        bond: ['NP', 'VP', 'S', 1],
        left: leafA,
        right: leafB,
      })),
    };
    const meaning = meaningOf(node);
    expect(meaning.readings.length).toBeGreaterThan(0);
    expect(meaning.readings.length).toBeLessThanOrEqual(16);
  });
});

describe('composition observes a packed chart without rewriting it', () => {
  it('assigns Agent=men Event=ran on old men ran and leaves the forest identical', () => {
    const pos = new Map([['old', ['a']], ['men', ['n']], ['ran', ['v']]]);
    const off = composePacked(['old', 'men', 'ran'], pos);
    const on = composePacked(['old', 'men', 'ran'], pos, { semanticParticles: true });
    expect(forestFingerprint(on)).toBe(forestFingerprint(off));
    const root = (on.stable || []).find((n) => n.type === 'S') || on.stable[0];
    const meaning = meaningOf(root);
    expect(meaning.readings[0].roles.Agent).toBe('men');
    expect(meaning.readings[0].roles.Event).toBe('ran');
  });
});

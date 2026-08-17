/**
 * Lexical semantics — senses, synonyms, polysemy, role frames.
 *
 * Production change that would make these fail: collapsing bank's two
 * noun senses into one feature bag, or treating synonymy as string
 * equality, or inventing a sense for an unknown lemma.
 */
import { describe, expect, it } from 'vitest';

import {
  areSynonyms,
  createLexicalLexicon,
  polysemyCount,
  roleFrame,
  sensesFor,
  synsetMembers,
} from '../../../../codex/core/constellation/semantic-particles/lexical-semantics.js';

describe('polysemy is sense-level, not lemma-level', () => {
  it('gives bank-as-N two senses with different synsets and features', () => {
    const senses = sensesFor('bank', 'N');
    expect(senses.length).toBe(2);
    const synsets = new Set(senses.map((s) => s.synset));
    expect(synsets.size).toBe(2);
    const money = senses.find((s) => s.synset === 'financial-institution');
    const river = senses.find((s) => s.synset === 'river-edge');
    expect(money.features['entity.organization']).toBe(true);
    expect(river.features['entity.location']).toBe(true);
    expect(money.features['entity.location']).not.toBe(true);
  });
});

describe('synonymy is shared synset membership', () => {
  it('treats cat and feline as synonyms and cat and bank as not', () => {
    expect(areSynonyms('cat', 'N', 'feline', 'N')).toBe(true);
    expect(areSynonyms('cat', 'N', 'bank', 'N')).toBe(false);
    expect(synsetMembers('felid')).toEqual(['cat', 'feline']);
  });
});

describe('semantic roles live on the sense, not the surface word', () => {
  it('offers Agent on run and Experiencer+Stimulus on see', () => {
    expect(roleFrame('run', 'V').roles).toEqual(['Agent']);
    expect(roleFrame('see', 'V').roles).toEqual(['Experiencer', 'Stimulus']);
    expect(roleFrame('give', 'V').roles).toEqual(['Agent', 'Theme', 'Recipient']);
  });
});

describe('unknown lemmas abstain', () => {
  it('returns no senses and a null frame for a lemma with no inventory', () => {
    const empty = createLexicalLexicon({});
    expect(sensesFor('qzxqzx', 'N', empty)).toEqual([]);
    expect(roleFrame('qzxqzx', 'V', empty)).toBeNull();
    expect(polysemyCount('qzxqzx', 'N', empty)).toBe(0);
  });
});

describe('class fallback mints one sense from TRAIN bags', () => {
  it('gives work::N a default sense without collapsing bank polysemy', () => {
    const work = sensesFor('work', 'N');
    expect(work.length).toBe(1);
    expect(work[0].id).toMatch(/class$/);
    expect(sensesFor('bank', 'N').length).toBe(2);
    const empty = createLexicalLexicon({});
    expect(sensesFor('work', 'N', empty)).toEqual([]);
  });
});

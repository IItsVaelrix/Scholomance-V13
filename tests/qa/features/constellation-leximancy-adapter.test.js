import { describe, it, expect } from 'vitest';
import { analyzeLeximancy } from '../../../codex/server/services/constellation/leximancy.adapter.js';

function fakeAdapter(sensesByWord, syn = [], ant = []) {
  return {
    lookupWord: (w) => sensesByWord[w] || [],
    extractGloss: (senses) => (senses && senses[0]) || null,
    lookupSynonyms: () => syn.map((lemma) => ({ lemma })),
    lookupAntonyms: () => ant.map((lemma) => ({ lemma })),
  };
}

describe('analyzeLeximancy', () => {
  it('marks a polyseme with divergent POS as ambiguous', () => {
    const adapter = fakeAdapter({
      wound: [
        { pos: 'noun', senses: ['injury / opening in flesh'], source: 's' },
        { pos: 'verb', senses: ['past tense of wind'], source: 's' },
      ],
    });
    const r = analyzeLeximancy(adapter, 'wound');
    expect(r.status).toBe('ambiguous');
    expect(r.selectedInterpretationId).toBeNull();
    expect(r.interpretations).toHaveLength(2);
    expect(r.interpretations[0].gloss).toMatch(/injury/);
  });

  it('resolves a single-sense word and selects it', () => {
    const adapter = fakeAdapter({ gravity: [{ pos: 'noun', senses: ['a force'], source: 's' }] });
    const r = analyzeLeximancy(adapter, 'gravity');
    expect(r.status).toBe('resolved');
    expect(r.selectedInterpretationId).toBe(r.interpretations[0].id);
  });

  it('expands an entry with multiple senses into multiple interpretations', () => {
    const adapter = fakeAdapter({
      bank: [{
        pos: 'noun',
        senses: [
          'sloping land beside water',
          'a financial institution',
          'a long ridge or pile',
        ],
        source: 's',
      }],
    });
    const r = analyzeLeximancy(adapter, 'bank');
    expect(r.interpretations).toHaveLength(3);
    expect(r.interpretations.map((i) => i.gloss)).toEqual([
      'sloping land beside water',
      'a financial institution',
      'a long ridge or pile',
    ]);
    // All the same POS → resolved, first sense selected (dominant rank).
    expect(r.status).toBe('resolved');
    expect(r.selectedInterpretationId).toBe(r.interpretations[0].id);
  });

  it('reports unsupported when the word is unknown', () => {
    const r = analyzeLeximancy(fakeAdapter({}), 'zzzq');
    expect(r.status).toBe('unsupported');
    expect(r.interpretations).toEqual([]);
  });

  it('maps synonyms to nearKin and antonyms to counterfield', () => {
    const adapter = fakeAdapter(
      { light: [{ pos: 'noun', senses: ['radiance'], source: 's' }] },
      ['glow', 'radiance'],
      ['dark'],
    );
    const r = analyzeLeximancy(adapter, 'light');
    expect(r.nearKin).toContain('glow');
    expect(r.counterfield).toContain('dark');
  });

  it('is unsupported when there is no content token', () => {
    const r = analyzeLeximancy(fakeAdapter({}), null);
    expect(r.status).toBe('unsupported');
  });
});

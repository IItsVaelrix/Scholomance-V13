import { describe, it, expect } from 'vitest';
import { analyzeLeximancy } from '../../../codex/server/services/constellation/leximancy.adapter.js';

function fakeAdapter(entriesByWord, opts = {}) {
  const { syn = [], ant = [], related = null, freqs = null } = opts;
  return {
    lookupWord: (w) => entriesByWord[w] || [],
    // Real extractGloss takes a sense array; a sense may be a string or {gloss}.
    extractGloss: (senses) => {
      const s = senses && senses[0];
      return typeof s === 'string' ? s : (s && s.gloss) || null;
    },
    lookupSynonyms: () => syn.map((lemma) => ({ lemma })),
    lookupAntonyms: () => ant.map((lemma) => ({ lemma })),
    ...(related ? { lookupRelated: () => related } : {}),
    ...(freqs ? { getCorpusFrequencies: (words) => new Map(words.map((w) => [w, freqs[w] ?? 0])) } : {}),
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
      { syn: ['glow', 'radiance'], ant: ['dark'] },
    );
    const r = analyzeLeximancy(adapter, 'light');
    expect(r.nearKin).toContain('glow');
    expect(r.counterfield).toContain('dark');
  });

  it('is unsupported when there is no content token', () => {
    const r = analyzeLeximancy(fakeAdapter({}), null);
    expect(r.status).toBe('unsupported');
  });

  it('pulls etymology and IPA from the SELECTED interpretation entry (homograph)', () => {
    // Two separate entries; sense arrays are single-sense so POS divergence => ambiguous.
    const adapter = fakeAdapter({
      wound: [
        { pos: 'noun', senses: ['injury / opening in flesh'], etymology: 'OE wund', pronunciation: '/wuːnd/' },
        { pos: 'verb', senses: ['past tense of wind'], etymology: 'OE windan', pronunciation: '/waʊnd/' },
      ],
    });
    const r = analyzeLeximancy(adapter, 'wound');
    expect(r.status).toBe('ambiguous');           // no selection
    expect(r.etymology).toBe('OE wund');          // falls back to the TOP entry
    expect(r.ipa).toBe('/wuːnd/');
  });

  it('binds etymology/IPA to the chosen entry when a sense is selected', () => {
    const adapter = fakeAdapter({
      gravity: [{ pos: 'noun', senses: ['a force'], etymology: 'L gravitas', pronunciation: '/ˈɡrævɪti/' }],
    });
    const r = analyzeLeximancy(adapter, 'gravity');
    expect(r.status).toBe('resolved');
    expect(r.etymology).toBe('L gravitas');
    expect(r.ipa).toBe('/ˈɡrævɪti/');
  });

  it('threads sense examples onto interpretations, capped at 3 and 20 words', () => {
    const long = Array.from({ length: 25 }, (_, i) => `w${i}`).join(' ');
    const adapter = fakeAdapter({
      river: [{
        pos: 'noun',
        senses: [{ gloss: 'a large stream', examples: ['the river ran high', 'they crossed the river', 'a river of light', long] }],
        etymology: 'OF rivere',
      }],
    });
    const r = analyzeLeximancy(adapter, 'river');
    expect(r.interpretations[0].examples).toHaveLength(3);           // capped at 3
    expect(r.interpretations[0].examples[0]).toBe('the river ran high');
  });

  it('returns sorted, capped relations (freq desc, then alphabetical)', () => {
    const adapter = fakeAdapter(
      { wound: [{ pos: 'noun', senses: ['injury'], etymology: 'x' }] },
      {
        related: {
          broader: [{ lemma: 'trauma' }, { lemma: 'injury' }],   // injury freq higher
          narrower: [{ lemma: 'gash' }, { lemma: 'cut' }],
          akin: [{ lemma: 'a' }, { lemma: 'b' }, { lemma: 'c' }, { lemma: 'd' }],
        },
        freqs: { injury: 900, trauma: 100, gash: 5, cut: 50 },
      },
    );
    const r = analyzeLeximancy(adapter, 'wound');
    expect(r.relations.broader).toEqual(['injury', 'trauma']);       // 900 > 100
    expect(r.relations.narrower).toEqual(['cut', 'gash']);           // 50 > 5
    expect(r.relations.akin.length).toBeLessThanOrEqual(10);
  });

  it('distinguishes empty relations (found nothing) from a missing method', () => {
    // No lookupRelated method at all -> empty arrays, no throw.
    const bare = fakeAdapter({ light: [{ pos: 'noun', senses: ['radiance'], etymology: 'x' }] });
    const r = analyzeLeximancy(bare, 'light');
    expect(r.relations).toEqual({ broader: [], narrower: [], akin: [] });
  });

  it('reports rarity from corpus frequency, null when no signal', () => {
    const withFreq = fakeAdapter({ owl: [{ pos: 'noun', senses: ['a bird'], etymology: 'x' }] }, { freqs: { owl: 45 } });
    expect(analyzeLeximancy(withFreq, 'owl').rarity).toEqual({ band: 4, max: 9, label: 'uncommon' });
    // getCorpusFrequencies returning an empty Map => null (no signal), not band 0.
    const noSignal = fakeAdapter({ owl: [{ pos: 'noun', senses: ['a bird'], etymology: 'x' }] });
    expect(analyzeLeximancy(noSignal, 'owl').rarity).toBeNull();
  });
});

/**
 * THE MOCKS ABOVE DO NOT MIRROR THE REAL ADAPTER.
 *
 * Measured against scholomance_dict.sqlite: lookupWord('wound') returns ONE
 * entry, pos 'a', with all 7 senses inside it and NO per-sense pos. Every mock
 * above hands back pre-partitioned entries, so the POS-divergence branch is
 * exercised in tests and structurally dead in production — `wound` shipped as
 * 7 × `wound.a.N`, "an injury to living tissue" labelled an adjective, and
 * status 'resolved' on a word with a three-way POS split.
 *
 * lookupLexicalEntries DOES retain the partition (wordnet_lemma.pos), so the
 * true POS is recoverable. Joining on gloss text is the honest join — the same
 * convention semanticInquiry.adapter already documents.
 */
describe('analyzeLeximancy — POS truth from the real adapter shape', () => {
  /** Mirrors scholomance_dict.sqlite exactly: collapsed lookupWord, partitioned lexical entries. */
  function realShapeAdapter() {
    const senses = [
      { gloss: 'put in a coil' },
      { gloss: 'an injury to living tissue' },
      { gloss: 'cause injuries or bodily harm to' },
    ];
    return {
      lookupWord: () => [{ pos: 'a', senses, etymology: 'OE wund', pronunciation: '/waʊnd/' }],
      extractGloss: (s) => {
        const x = s && s[0];
        return typeof x === 'string' ? x : (x && x.gloss) || null;
      },
      lookupSynonyms: () => [],
      lookupAntonyms: () => [],
      lookupLexicalEntries: () => [
        { pos: 'a', senses: [{ synsetId: 'oewn-02325885-s', gloss: 'put in a coil', examples: [] }] },
        { pos: 'n', senses: [{ synsetId: 'oewn-14322317-n', gloss: 'an injury to living tissue', examples: [] }] },
        { pos: 'v', senses: [{ synsetId: 'oewn-00069650-v', gloss: 'cause injuries or bodily harm to', examples: [] }] },
      ],
    };
  }

  it('labels each sense with its true POS, not the collapsed entry POS', () => {
    const r = analyzeLeximancy(realShapeAdapter(), 'wound');
    const byGloss = Object.fromEntries(r.interpretations.map((i) => [i.gloss, i.pos]));
    expect(byGloss['put in a coil']).toBe('a');
    expect(byGloss['an injury to living tissue']).toBe('n');
    expect(byGloss['cause injuries or bodily harm to']).toBe('v');
  });

  it('reports a three-way POS split as ambiguous rather than resolved', () => {
    const r = analyzeLeximancy(realShapeAdapter(), 'wound');
    expect(r.status).toBe('ambiguous');
    expect(r.selectedInterpretationId).toBeNull();
  });
});

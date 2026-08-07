import { describe, it, expect } from 'vitest';
import { buildConstellationPage } from '../../../codex/server/services/constellationPage.service.js';

const lexiconAdapter = {
  lookupWord: (w) => (w === 'morning'
    ? [{ pos: 'noun', senses: [{ gloss: 'dawn', examples: ['early in the morning'] }], etymology: 'OE morgen', pronunciation: '/ˈmɔːnɪŋ/', source: 's' }]
    : []),
  extractGloss: (s) => { const x = s?.[0]; return typeof x === 'string' ? x : (x && x.gloss) || null; },
  lookupSynonyms: () => [{ lemma: 'dawn' }],
  lookupAntonyms: () => [{ lemma: 'dusk' }],
  lookupRelated: () => ({ broader: [{ lemma: 'time' }], narrower: [{ lemma: 'sunrise' }], akin: [{ lemma: 'daybreak' }] }),
  getCorpusFrequencies: (words) => new Map(words.map((w) => [w, w === 'morning' ? 10 : 300])),
  // Mirrors the real adapter: the POS partition wordnet_lemma retains.
  lookupLexicalEntries: (w) => (w === 'morning'
    ? [{ pos: 'n', senses: [{ synsetId: 'oewn-morning-n', gloss: 'dawn', examples: [] }] }]
    : []),
};
const rhymeQueryEngine = {
  async query() {
    return {
      topMatches: [{ token: 'mourning', overallScore: 0.7 }],
      constellations: [{ dominantVowelFamily: ['AO'], dominantStressPattern: 'x /', members: ['warning'], cohesionScore: 0.5, densityScore: 0.4 }],
      diagnostics: { queryTimeMs: 1, cacheHit: false, candidateCount: 1 },
    };
  },
};
const rhymeLexiconRepo = { lookupNodeByNormalized: () => ({ phonemes: ['M', 'AO1', 'R', 'N', 'IH0', 'NG'] }) };
/**
 * cmudict does not load under vitest, so without an injected source the heteronym
 * check cannot run and the page reports semanticInquiry.phonology as degraded —
 * correctly. These fixtures assert a HEALTHY page, so give it a source.
 */
const phonology = { async ready() { return true; }, variants: () => [['M', 'AO1', 'R', 'N', 'IH0', 'NG']] };
const deps = { lexiconAdapter, rhymeQueryEngine, rhymeLexiconRepo, phonology };

describe('buildConstellationPage', () => {
  it('composes all channels for a known phrase', async () => {
    const p = await buildConstellationPage('the bright wound of morning', deps);
    expect(p.schema_id).toBe('scholomance/constellation-os-page-phase2');
    expect(p.query.kind).toBe('phrase');
    expect(p.query.intent).toBe('literary');
    expect(p.leximancy.status).toBe('resolved');
    expect(p.rhymeAstrology.phonemes.length).toBeGreaterThan(0);
    expect(p.phraseGenome.syllables).toBe(2);
    expect(p.pageBytecode).toMatch(/^COS-PAGE-v1-/);
    expect(p.diagnostics.degradedChannels).toEqual([]);
    // Phase 2: phrase structure is present
    expect(p.phraseStructure.intent).toBe('literary');
    expect(p.phraseStructure.headToken).toBeTruthy();
    expect(p.phraseStructure.devices.length).toBeGreaterThan(0);
  });

  it('degrades only the rhyme channel when its engine throws', async () => {
    const brokenDeps = { ...deps, rhymeQueryEngine: { async query() { throw new Error('index offline'); } } };
    const p = await buildConstellationPage('morning', brokenDeps);
    expect(p.rhymeAstrology).toBeNull();
    expect(p.diagnostics.degradedChannels).toContain('rhymeAstrology');
    expect(p.leximancy.status).toBe('resolved'); // other channels intact
  });

  it('is deterministic in bytecode for the same query', async () => {
    const a = await buildConstellationPage('morning', deps);
    const b = await buildConstellationPage('morning', deps);
    expect(a.pageBytecode).toBe(b.pageBytecode);
  });

  it('threads etymology, rarity, relations, examples, and IPA onto the packet', async () => {
    const p = await buildConstellationPage('morning', deps);
    expect(p.leximancy.etymology).toBe('OE morgen');
    expect(p.leximancy.rarity).toEqual({ band: 2, max: 9, label: 'rare' });
    expect(p.leximancy.relations.broader).toEqual(['time']);
    expect(p.leximancy.interpretations[0].examples).toEqual(['early in the morning']);
    expect(p.rhymeAstrology.ipa).toBe('/ˈmɔːnɪŋ/');
  });

  it('records a granular degraded channel when relations lookup throws', async () => {
    const brokenLex = {
      ...lexiconAdapter,
      lookupRelated: () => { throw new Error('wordnet offline'); },
    };
    const p = await buildConstellationPage('morning', { ...deps, lexiconAdapter: brokenLex });
    expect(p.leximancy.relations).toEqual({ broader: [], narrower: [], akin: [] });
    expect(p.diagnostics.degradedChannels).toContain('leximancy.relations');
    expect(p.leximancy.etymology).toBe('OE morgen'); // other sub-fields intact
  });
});

/**
 * MEASURED INERTNESS. Against the live page, `a wound` resolved framePos 'n' and
 * viableWordCount 1 — the heteronym settled as the noun — and the packet still
 * shipped `wound.a.0` "put in a coil". `he wound the clock` resolved framePos
 * 'v' and shipped the same sense. The frame reader did its work and the answer
 * threw it away, because the ONLY wire into leximancy's selection ran through
 * h_sense_by_gloss_overlap, and gloss overlap is not what settled the word.
 *
 * A resolved frame is hard syntactic evidence. It gets its own wire.
 */
describe('buildConstellationPage — a settled frame decides the sense', () => {
  const WOUND_GROUPS = [
    { pos: 'a', senses: [{ synsetId: 'oewn-02325885-s', gloss: 'put in a coil', examples: [] }] },
    { pos: 'n', senses: [{ synsetId: 'oewn-14322317-n', gloss: 'an injury to living tissue', examples: [] }] },
    { pos: 'v', senses: [{ synsetId: 'oewn-00069650-v', gloss: 'cause injuries or bodily harm to', examples: [] }] },
  ];

  /** Mirrors scholomance_dict.sqlite: lookupWord collapses POS, lookupLexicalEntries keeps it. */
  const woundLexicon = {
    lookupWord: (w) => (w === 'wound'
      ? [{ pos: 'a', senses: WOUND_GROUPS.flatMap((g) => g.senses), etymology: 'OE wund', pronunciation: '/waʊnd/' }]
      : []),
    extractGloss: (s) => { const x = s?.[0]; return typeof x === 'string' ? x : (x && x.gloss) || null; },
    lookupSynonyms: () => [],
    lookupAntonyms: () => [],
    lookupRelated: () => ({ broader: [], narrower: [], akin: [] }),
    // Real corpus counts, so head selection is exercised rather than sidestepped.
    getCorpusFrequencies: (words) => new Map(words.map((w) => [w, { wound: 79, clock: 251 }[w] ?? 0])),
    batchLookupPos: (words) => Object.fromEntries(
      words.map((w) => [w, { wound: ['a', 'n', 'v'], clock: ['n', 'v'] }[w] ?? []]),
    ),
    lookupLexicalEntries: (w) => (w === 'wound' ? WOUND_GROUPS : []),
  };

  /** Two distinct pronunciations — /waʊnd/ coiled vs /wuːnd/ injured. */
  const twoWayPhonology = {
    async ready() { return true; },
    variants: () => [['W', 'AW1', 'N', 'D'], ['W', 'UW1', 'N', 'D']],
  };

  const woundDeps = {
    lexiconAdapter: woundLexicon,
    rhymeQueryEngine,
    rhymeLexiconRepo,
    phonology: twoWayPhonology,
  };

  it('selects the noun sense when a determiner settles the frame', async () => {
    const p = await buildConstellationPage('a wound', woundDeps);
    expect(p.semanticInquiry.framePos).toBe('n');
    expect(p.semanticInquiry.viableWordCount).toBe(1);

    const selected = p.leximancy.interpretations.find((i) => i.id === p.leximancy.selectedInterpretationId);
    expect(selected).toBeDefined();
    expect(selected.pos).toBe('n');
    expect(selected.gloss).toBe('an injury to living tissue');
  });

  it('selects the verb sense when a subject pronoun settles the frame', async () => {
    const p = await buildConstellationPage('he wound the clock', woundDeps);
    expect(p.semanticInquiry.framePos).toBe('v');

    const selected = p.leximancy.interpretations.find((i) => i.id === p.leximancy.selectedInterpretationId);
    expect(selected).toBeDefined();
    expect(selected.pos).toBe('v');
  });

  it('leaves the split unselected when no frame settles it', async () => {
    const p = await buildConstellationPage('wound', woundDeps);
    expect(p.semanticInquiry.framePos).toBeNull();
    expect(p.semanticInquiry.viableWordCount).toBeGreaterThan(1);
    // Refusing to pick is the correct answer here, not a shortfall.
    expect(p.leximancy.selectedInterpretationId).toBeNull();
  });
});

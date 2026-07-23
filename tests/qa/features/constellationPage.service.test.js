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
  getCorpusFrequencies: (words) => new Map(words.map((w) => [w, w === 'morning' ? 300 : 10])),
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
const deps = { lexiconAdapter, rhymeQueryEngine, rhymeLexiconRepo };

describe('buildConstellationPage', () => {
  it('composes all channels for a known phrase', async () => {
    const p = await buildConstellationPage('the bright wound of morning', deps);
    expect(p.schema_id).toBe('scholomance/constellation-os-page-phase1');
    expect(p.query.kind).toBe('phrase');
    expect(p.leximancy.status).toBe('resolved');
    expect(p.rhymeAstrology.phonemes.length).toBeGreaterThan(0);
    expect(p.phraseGenome.syllables).toBe(2);
    expect(p.pageBytecode).toMatch(/^COS-PAGE-v1-/);
    expect(p.diagnostics.degradedChannels).toEqual([]);
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
    expect(p.leximancy.rarity).toEqual({ band: 5, max: 9, label: 'uncommon' });
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

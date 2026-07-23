import { describe, it, expect } from 'vitest';
import { buildConstellationPage } from '../../../codex/server/services/constellationPage.service.js';

const lexiconAdapter = {
  lookupWord: (w) => (w === 'morning' ? [{ pos: 'noun', senses: ['dawn'], source: 's' }] : []),
  extractGloss: (s) => s?.[0] || null,
  lookupSynonyms: () => [{ lemma: 'dawn' }],
  lookupAntonyms: () => [{ lemma: 'dusk' }],
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
});

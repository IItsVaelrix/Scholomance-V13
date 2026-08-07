import { describe, it, expect } from 'vitest';
import { analyzeDiscovery, DISCOVERY_ADAPTER_VERSION } from '../../../codex/server/services/constellation/discovery.adapter.js';
import { resolveQueryIdentity } from '../../../codex/core/constellation/queryIdentity.js';

function mockLexicon({ graph = {}, freqs = {} } = {}) {
  // graph: word -> { synonyms:[], related:{broader,narrower,akin}, antonyms:[], symbols:[], fts:[], gloss:{} }
  const g = (w) => graph[w] || {};
  return {
    lookupSynonyms: (w) => (g(w).synonyms || []).map((lemma) => ({ lemma })),
    lookupAntonyms: (w) => (g(w).antonyms || []).map((lemma) => ({ lemma })),
    lookupRelated: (w) => {
      const r = g(w).related || {};
      return {
        broader: (r.broader || []).map((lemma) => ({ lemma })),
        narrower: (r.narrower || []).map((lemma) => ({ lemma })),
        akin: (r.akin || []).map((lemma) => ({ lemma })),
      };
    },
    lookupSymbolsLoose: (w) => (g(w).symbols || []).map((lemma) => ({ lemma })),
    searchEntries: (w) => (g(w).fts || []).map((headword) => ({ headword })),
    extractGloss: () => '',
    getCorpusFrequencies: (words) => new Map(words.map((x) => [x, freqs[x] ?? 100])),
    lookupWord: (w) => {
      const gloss = g(w).gloss;
      if (!gloss) return [];
      return [{ pos: 'n', senses: [{ gloss }], etymology: null, pronunciation: null }];
    },
  };
}

describe('analyzeDiscovery', () => {
  it('exports disc-adapter-1 version', () => {
    expect(DISCOVERY_ADAPTER_VERSION).toBe('disc-adapter-1');
  });

  it('ranks abyss for darkness + emotional when graph supports it', async () => {
    const lexiconAdapter = mockLexicon({
      graph: {
        darkness: {
          synonyms: ['gloom', 'abyss', 'night'],
          related: { akin: ['shadow'] },
          gloss: { abyss: 'immeasurably deep space; emotional void' },
        },
        emotional: { synonyms: ['feeling', 'emotion'] },
        abyss: { gloss: 'deep emotional void' },
        gloom: { gloss: 'partial darkness' },
        night: { gloss: 'period of darkness' },
        shadow: { gloss: 'dark shape' },
      },
      freqs: { abyss: 5, gloom: 200, night: 500, shadow: 100 },
    });
    // enrich lookupWord gloss for candidates
    lexiconAdapter.lookupWord = (w) => {
      const glosses = {
        abyss: 'deep emotional void',
        gloom: 'partial darkness',
        night: 'period of darkness',
        shadow: 'dark shape',
      };
      return glosses[w] ? [{ pos: 'n', senses: [{ gloss: glosses[w] }] }] : [];
    };
    const identity = resolveQueryIdentity('Words that resemble darkness but feel more emotional');
    const d = await analyzeDiscovery(identity.raw, identity, { lexiconAdapter });
    expect(d.status).toBe('resolved');
    expect(d.mode).toBe('semantic');
    expect(d.hits.map((h) => h.token)).toContain('abyss');
    expect(d.hits.find((h) => h.token === 'abyss').via.length).toBeGreaterThan(0);
  });

  it('hard-filters rhyme: every hit rhymes with sea', async () => {
    const lexiconAdapter = mockLexicon({
      graph: {
        grief: { synonyms: ['sorrow', 'plea', 'misery', 'table'] },
      },
    });
    const rhymeSet = new Set(['plea', 'decree', 'sea']);
    const deps = {
      lexiconAdapter,
      rhymeLexiconRepo: {
        rhymesWith: (a, b) => {
          if (b === 'sea') return rhymeSet.has(a);
          return false;
        },
        lookupNodeByNormalized: () => null,
      },
    };
    const identity = resolveQueryIdentity('words semantically near grief that rhyme with sea');
    const d = await analyzeDiscovery(identity.raw, identity, deps);
    expect(d.constraints.rhymeWith).toBe('sea');
    expect(d.mode).toBe('semantic+rhyme');
    for (const h of d.hits) {
      expect(rhymeSet.has(h.token) || h.token === 'plea').toBe(true);
      expect(h.token).not.toBe('table');
      expect(h.token).not.toBe('sorrow'); // unless in rhyme set
    }
    expect(d.hits.every((h) => rhymeSet.has(h.token))).toBe(true);
  });

  it('enumeration is order-stable under shuffled synonym input', async () => {
    const make = (syns) => mockLexicon({ graph: { darkness: { synonyms: syns } } });
    const identity = resolveQueryIdentity('words that resemble darkness');
    const a = await analyzeDiscovery(identity.raw, identity, {
      lexiconAdapter: make(['night', 'gloom', 'abyss']),
    });
    const b = await analyzeDiscovery(identity.raw, identity, {
      lexiconAdapter: make(['abyss', 'night', 'gloom']),
    });
    expect(a.hits.map((h) => h.token)).toEqual(b.hits.map((h) => h.token));
  });

  it('rarity cannot promote zero-evidence candidate', async () => {
    // Only gloom has via; rare glitter word never enters without generator path
    const lexiconAdapter = mockLexicon({
      graph: { darkness: { synonyms: ['gloom'] } },
      freqs: { gloom: 500, glitteryx: 1 },
    });
    const identity = resolveQueryIdentity('words that resemble darkness');
    const d = await analyzeDiscovery(identity.raw, identity, { lexiconAdapter });
    expect(d.hits.map((h) => h.token)).not.toContain('glitteryx');
  });
});

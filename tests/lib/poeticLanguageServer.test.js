import { describe, it, expect, beforeAll } from 'vitest';
import { PoeticLanguageServer } from '../../src/lib/poeticLanguageServer.js';
import { createPhonologyTransport } from '../../src/lib/phonology.transport.js';

// Mock PhonemeEngine with known word analyses
const mockCoreEngine = {
  WORD_CACHE: new Map(),
  analyzeWord(word) {
    const upper = String(word).toUpperCase();
    const dict = {
      NIGHT: { vowelFamily: 'AY', rhymeKey: 'AY-T', syllableCount: 1, coda: 'T', phonemes: ['N', 'AY1', 'T'] },
      LIGHT: { vowelFamily: 'AY', rhymeKey: 'AY-T', syllableCount: 1, coda: 'T', phonemes: ['L', 'AY1', 'T'] },
      FIGHT: { vowelFamily: 'AY', rhymeKey: 'AY-T', syllableCount: 1, coda: 'T', phonemes: ['F', 'AY1', 'T'] },
      SIGHT: { vowelFamily: 'AY', rhymeKey: 'AY-T', syllableCount: 1, coda: 'T', phonemes: ['S', 'AY1', 'T'] },
      TIME:  { vowelFamily: 'AY', rhymeKey: 'AY-M', syllableCount: 1, coda: 'M', phonemes: ['T', 'AY1', 'M'] },
      FIRE:  { vowelFamily: 'AY', rhymeKey: 'AY-R', syllableCount: 1, coda: 'R', phonemes: ['F', 'AY1', 'R'] },
      FACE:  { vowelFamily: 'EY', rhymeKey: 'EY-S', syllableCount: 1, coda: 'S', phonemes: ['F', 'EY1', 'S'] },
      BASE:  { vowelFamily: 'EY', rhymeKey: 'EY-S', syllableCount: 1, coda: 'S', phonemes: ['B', 'EY1', 'S'] },
      DARK:  { vowelFamily: 'A', rhymeKey: 'A-K', syllableCount: 1, coda: 'K', phonemes: ['D', 'AA1', 'R', 'K'] },
      SOUL:  { vowelFamily: 'IY', rhymeKey: 'IY-L', syllableCount: 1, coda: 'L', phonemes: ['S', 'IY1', 'L'] },
      INTO:  { vowelFamily: 'IH', rhymeKey: 'IH-open', syllableCount: 2, coda: null, phonemes: ['IH1', 'N', 'T', 'UW0'] },
      THE:   { vowelFamily: 'AE', rhymeKey: 'AE-open', syllableCount: 1, coda: null, phonemes: ['DH', 'AH0'] },
      VOID:  { vowelFamily: 'OY', rhymeKey: 'OY-D', syllableCount: 1, coda: 'D', phonemes: ['V', 'OY1', 'D'] },
    };
    return dict[upper] || null;
  },
  checkCodaMutation(a, b) {
    const groups = [['M', 'NG', 'N'], ['S', 'Z', 'SH', 'ZH'], ['T', 'D'], ['P', 'B'], ['K', 'G']];
    for (const g of groups) { if (g.includes(a) && g.includes(b)) return true; }
    return false;
  },
};

// Wrapped in the REAL transport, so the double answers the consume verb
// `getAnalysis` for exactly as long as production does. Hand-written doubles are
// how the providers migrated off `analyzeWord` without a single test noticing.
const mockPhonemeEngine = createPhonologyTransport(mockCoreEngine, { isBrowser: false });

// Mock Trie
class MockTrie {
  predict(prefix, limit = 5) {
    const words = ['light', 'lime', 'like', 'fire', 'fight', 'face', 'dark', 'night', 'soul'];
    return words.filter(w => w.startsWith(prefix.toLowerCase())).slice(0, limit);
  }
  predictNext(word, limit = 5) {
    const bigrams = { 'the': ['night', 'void', 'dark', 'soul'], 'into': ['the'] };
    return (bigrams[word.toLowerCase()] || []).slice(0, limit);
  }
}

describe('PoeticLanguageServer', () => {
  let pls;

  beforeAll(async () => {
    pls = new PoeticLanguageServer({
      phonemeEngine: mockPhonemeEngine,
      trie: new MockTrie(),
    });
    await pls.buildIndex([
      'night', 'light', 'fight', 'sight', 'time', 'fire',
      'face', 'base', 'dark', 'soul', 'into', 'the', 'void',
    ]);
  });

  it('returns completions with scores and badges', async () => {
    const results = await pls.getCompletions({
      prefix: 'li',
      prevWord: null,
      prevLineEndWord: 'night',
      currentLineWords: ['into', 'the'],
    });

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r).toHaveProperty('token');
      expect(r).toHaveProperty('score');
      expect(r).toHaveProperty('scores');
      expect(r.scores).toHaveProperty('predictability');
      expect(r).toHaveProperty('badges');
      expect(r).toHaveProperty('ghostLine');
    }
  });

  it('prioritizes rhyming candidates', async () => {
    const results = await pls.getCompletions({
      prefix: '',
      prevWord: 'the',
      prevLineEndWord: 'night', // rhyme target: AY-T
      currentLineWords: [],
    });

    // Words that rhyme with "night" (light, fight, sight) should score higher
    const rhymeCandidates = results.filter(r => r.badges.includes('RHYME'));
    expect(rhymeCandidates.length).toBeGreaterThan(0);
  });

  it('generates correct ghost lines', async () => {
    const results = await pls.getCompletions({
      prefix: 'li',
      prevWord: null,
      prevLineEndWord: 'night',
      currentLineWords: ['into', 'the'],
    });

    for (const r of results) {
      expect(r.ghostLine).toMatch(/^into the .+/);
    }
  });

  it('returns empty when not ready', async () => {
    const unready = new PoeticLanguageServer({
      phonemeEngine: mockPhonemeEngine,
      trie: new MockTrie(),
    });
    const results = await unready.getCompletions({ prefix: 'li', prevWord: null, prevLineEndWord: null, currentLineWords: [] });
    expect(results).toHaveLength(0);
  });

  it('allows runtime weight adjustment', async () => {
    pls.setWeights({ rhyme: 0.9, prefix: 0.1, meter: 0, color: 0 });

    const results = await pls.getCompletions({
      prefix: '',
      prevWord: 'the',
      prevLineEndWord: 'night',
      currentLineWords: [],
    });

    // With rhyme weight at 0.9, rhyming words should dominate
    if (results.length > 1) {
      const topRhymes = results.slice(0, 3).filter(r => r.scores.rhyme > 0);
      expect(topRhymes.length).toBeGreaterThan(0);
    }

    // Restore defaults
    pls.setWeights({ rhyme: 0.30, prefix: 0.15, meter: 0.20, color: 0.15, synonym: 0.10, validity: 0.10 });
  });

  it('completes in under 50ms', async () => {
    const start = performance.now();
    await pls.getCompletions({
      prefix: 'li',
      prevWord: null,
      prevLineEndWord: 'night',
      currentLineWords: ['into', 'the'],
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('uses dictionary rhymes, synonyms, and validity scoring when API is wired', async () => {
    const dictionaryAPI = {
      async lookup(word) {
        if (String(word).toLowerCase() === 'time') {
          return {
            rhymes: ['dime', 'sublime'],
            synonyms: ['moment', 'era'],
          };
        }
        return { rhymes: [], synonyms: [] };
      },
      async validateBatch(words) {
        const known = new Set(['dime', 'moment', 'era', 'time']);
        return words
          .map((word) => String(word).toLowerCase())
          .filter((word) => known.has(word));
      },
    };

    const withDictionary = new PoeticLanguageServer({
      phonemeEngine: mockPhonemeEngine,
      trie: new MockTrie(),
      dictionaryAPI,
    });
    await withDictionary.buildIndex([
      'night', 'light', 'fight', 'sight', 'time', 'fire',
      'face', 'base', 'dark', 'soul', 'into', 'the', 'void',
    ]);

    const results = await withDictionary.getCompletions({
      prefix: '',
      prevWord: 'time',
      prevLineEndWord: 'time',
      currentLineWords: [],
    }, { limit: 20 });

    expect(results.some((candidate) => candidate.token === 'dime')).toBe(true);
    expect(results.some((candidate) => candidate.badges.includes('SYNONYM'))).toBe(true);

    const dime = results.find((candidate) => candidate.token === 'dime');
    const sublime = results.find((candidate) => candidate.token === 'sublime');
    expect(dime?.scores?.validity).toBe(1);
    expect(sublime?.scores?.validity).toBe(0.2);
  });
});

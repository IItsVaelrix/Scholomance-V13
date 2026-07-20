import { describe, it, expect, vi } from 'vitest';
import { democracyProvider } from '../../../../src/lib/pls/providers/democracyProvider.js';

describe('democracyProvider', () => {
  const mockEngines = {
    trie: {
      predict: (prefix) => (prefix === 'li' ? ['light', 'lime'] : []),
      predictNext: () => [],
    },
    spellchecker: {
      suggest: (prefix) => (prefix === 'li' ? ['light', 'life'] : []),
    },
    phonemeEngine: {
      analyzeWord: (word) => {
        const dict = {
          NIGHT: { rhymeKey: 'AY-T' },
          LIGHT: { rhymeKey: 'AY-T' },
          LIME: { rhymeKey: 'AY-M' },
        };
        return dict[String(word).toUpperCase()] || null;
      },
    },
  };

  const mockContext = {
    prefix: 'li',
    prevWord: null,
    prevLineEndWord: 'night',
  };

  it('assigns democracy scores based on layer consensus', async () => {
    const candidates = [
      { token: 'light', scores: {} }, // Trie, Spellcheck, and Phoneme (AY-T)
      { token: 'lime', scores: {} },  // Trie only
      { token: 'life', scores: {} },  // Spellcheck only
      { token: 'void', scores: {} },  // None
    ];

    const results = await democracyProvider(mockContext, mockEngines, candidates);

    const light = results.find(r => r.token === 'light');
    const lime = results.find(r => r.token === 'lime');
    const life = results.find(r => r.token === 'life');
    const void_cand = results.find(r => r.token === 'void');

    expect(light.scores.democracy).toBeGreaterThan(lime.scores.democracy);
    expect(light.scores.democracy).toBeGreaterThan(life.scores.democracy);
    expect(lime.scores.democracy).toBeGreaterThan(void_cand.scores.democracy);
    expect(life.scores.democracy).toBeGreaterThan(void_cand.scores.democracy);
    expect(void_cand.scores.democracy).toBe(0);
  });

  it('handles missing engines gracefully', async () => {
    const candidates = [{ token: 'light', scores: {} }];
    const results = await democracyProvider(mockContext, {}, candidates);
    expect(results[0].scores.democracy).toBe(0);
  });

  it('uses async spell suggestions when available', async () => {
    const spellchecker = {
      suggestAsync: vi.fn(async () => ['light']),
      check: () => false,
    };
    const candidates = [{ token: 'light', scores: {} }];

    const results = await democracyProvider(
      mockContext,
      { ...mockEngines, spellchecker },
      candidates
    );

    expect(spellchecker.suggestAsync).toHaveBeenCalled();
    expect(results[0].scores.democracy).toBeGreaterThan(0);
  });

  it('adds spellcheck votes from dictionary validation', async () => {
    const dictionaryAPI = {
      validateBatch: vi.fn(async () => ['void']),
    };
    const candidates = [{ token: 'void', scores: {} }];

    const results = await democracyProvider(
      { ...mockContext, prefix: '' },
      { ...mockEngines, spellchecker: null, dictionaryAPI },
      candidates
    );

    expect(dictionaryAPI.validateBatch).toHaveBeenCalled();
    expect(results[0].scores.democracy).toBeGreaterThan(0);
  });

  it('propagates ranked spellcheck scores so context winners beat near-misses', async () => {
    const spellchecker = {
      suggestDetailedAsync: vi.fn(async () => [
        { word: 'steal', score: 0.72 },
        { word: 'steel', score: 0.51 },
      ]),
      check: () => false,
    };
    const candidates = [
      { token: 'steal', scores: {} },
      { token: 'steel', scores: {} },
    ];

    const results = await democracyProvider(
      { prefix: 'stel', prevWord: 'to', prevLineEndWord: null },
      { spellchecker, trie: null, phonemeEngine: null },
      candidates,
    );

    const steal = results.find((entry) => entry.token === 'steal');
    const steel = results.find((entry) => entry.token === 'steel');
    expect(spellchecker.suggestDetailedAsync).toHaveBeenCalledWith('stel', 15, 'to');
    expect(steal.scores.democracy).toBeGreaterThan(steel.scores.democracy);
  });
});

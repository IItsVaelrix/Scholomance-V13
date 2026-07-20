import { describe, expect, it } from 'vitest';
import { computeSongStats } from '../../../codex/core/song-stats/index.js';
import { computeUniqueVocabulary } from '../../../codex/core/song-stats/uniqueVocabulary.js';

function word(normalized) {
  return { text: normalized, normalized };
}

describe('uniqueVocabulary', () => {
  it('computes unique lemmas per 100 words and surface type count', () => {
    const words = ['walk', 'walks', 'walking', 'run', 'ran'].map((text) => ({
      text,
      normalized: text,
    }));
    const pillar = computeUniqueVocabulary(words);
    expect(pillar.unit).toBe('/100t');
    expect(pillar.secondary.tokenCount).toBe(5);
    expect(pillar.secondary.surfaceTypeCount).toBe(5);
    expect(pillar.secondary.uniqueLemmaCount).toBeLessThanOrEqual(5);
    expect(pillar.value).toBeCloseTo((pillar.secondary.uniqueLemmaCount / 5) * 100, 5);
  });

  it('emits vocabulary_sample_small for N in [8, 32)', () => {
    const words = Array.from({ length: 10 }, (_, i) => ({
      text: `word${i}`,
      normalized: `word${i}`,
    }));
    const pillar = computeUniqueVocabulary(words);
    expect(pillar.diagnostics.some((d) => d.code === 'vocabulary_sample_small')).toBe(true);
  });

  it('does not emit vocabulary_sample_small when N >= 32', () => {
    const words = Array.from({ length: 32 }, (_, i) => word(`token${i}`));
    const pillar = computeUniqueVocabulary(words);
    expect(pillar.diagnostics.some((d) => d.code === 'vocabulary_sample_small')).toBe(false);
  });

  it('excludes single-character tokens from the count', () => {
    const words = [
      word('a'),
      word('I'),
      ...Array.from({ length: 8 }, (_, i) => word(`word${i}`)),
    ];
    const pillar = computeUniqueVocabulary(words);
    expect(pillar.secondary.tokenCount).toBe(8);
  });

  it('uses normalized01 = clamp(V / 60) with exact fidelity', () => {
    const words = Array.from({ length: 10 }, (_, i) => word(`word${i}`));
    const pillar = computeUniqueVocabulary(words);
    expect(pillar.fidelity).toBe('exact');
    expect(pillar.normalized01).toBeCloseTo(Math.min(1, pillar.value / 60), 5);
  });

  it('wires computed lexical diversity into computeSongStats for N >= 8', () => {
    // Alphabetic suffixes only — normalizeLyricToken strips digits.
    const labels = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];
    const allWords = labels.map((text) => word(text));
    const result = computeSongStats({ raw: labels.join(' '), lines: [], allWords });

    expect(result.meta.analyzedTokenCount).toBe(8);
    expect(result.wordCount).toBe(8);
    expect(result.pillars.uniqueVocabulary.value).toBe(100);
    expect(result.pillars.uniqueVocabulary.secondary.uniqueLemmaCount).toBe(8);
    expect(result.pillars.uniqueVocabulary.secondary.tokenCount).toBe(8);
  });
});

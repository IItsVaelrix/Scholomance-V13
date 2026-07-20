import { describe, expect, it } from 'vitest';
import { computeSongStats } from '../../../codex/core/song-stats/index.js';
import {
  computeRhymeDensity,
  longestVowelMatchLength,
} from '../../../codex/core/song-stats/rhymeDensity.js';

function word(normalized, phonemes) {
  return { normalized, phonetics: { phonemes } };
}

describe('rhymeDensity', () => {
  it('matches vowel identity while ignoring stress', () => {
    expect(longestVowelMatchLength(['AH0', 'IY0'], ['AH1', 'IY1'])).toBe(2);
  });

  it('uses the maximum equal suffix within the rhyme window', () => {
    const words = [
      word('alpha', ['AH0', 'IY0']),
      word('day', ['D', 'IY1']),
      word('omega', ['AH2', 'IY1']),
    ];

    const pillar = computeRhymeDensity(words, { rhymeWindow: 24 });

    expect(pillar.secondary.malmiDensity).toBeCloseTo(1);
    expect(pillar.value).toBeCloseTo(5 / 3);
    expect(pillar.value).toBeGreaterThan(pillar.secondary.malmiDensity);
    expect(pillar.secondary.longestChain).toBe(2);
  });

  it('limits matches to prior words inside the configured window', () => {
    const words = [
      word('first', ['EY1']),
      word('middle', ['IH1']),
      word('last', ['EY0']),
    ];

    expect(computeRhymeDensity(words, { rhymeWindow: 1 }).value).toBe(0);
    expect(computeRhymeDensity(words, { rhymeWindow: 2 }).value).toBeCloseTo(1 / 3);
  });

  it('uses deepPhonetics and reports phoneme coverage', () => {
    const words = [
      {
        normalized: 'deep-a',
        phonetics: { phonemes: [] },
        deepPhonetics: { phonemes: ['EY1'] },
      },
      { normalized: 'missing' },
      { normalized: 'deep-b', deepPhonetics: { phonemes: ['EY0'] } },
    ];

    const pillar = computeRhymeDensity(words, { rhymeWindow: 24 });

    expect(pillar.value).toBeCloseTo(1 / 3);
    expect(pillar.secondary.phonemeCoverage).toBeCloseTo(2 / 3);
    expect(pillar.coverage01).toBeCloseTo(2 / 3);
  });

  it('does not attribute tied non-identical rhymes to repetition', () => {
    const words = [
      word('day', ['D', 'EY1']),
      word('say', ['S', 'EY1']),
      word('day', ['D', 'EY1']),
      word('say', ['S', 'EY1']),
    ];

    const pillar = computeRhymeDensity(words, { rhymeWindow: 24 });

    expect(pillar.secondary.repetitionContribution).toBeCloseTo(0);
    expect(pillar.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'rhyme_repetition_heavy' }),
    );
  });

  it('counts identical tokens and diagnoses repetition-heavy density', () => {
    const death = word('death', ['D', 'EH1', 'TH']);
    const pillar = computeRhymeDensity(
      [death, death, death, death, death],
      { rhymeWindow: 24 },
    );

    expect(pillar.secondary.repetitionContribution).toBe(1);
    expect(pillar.diagnostics).toContainEqual({
      code: 'rhyme_repetition_heavy',
      message: 'More than half of rhyme density comes from repeated tokens.',
      severity: 'info',
    });
  });

  it('wires computed rhyme density into computeSongStats for N >= 8', () => {
    const allWords = Array.from({ length: 8 }, (_, index) => (
      word(`token-${index}`, ['EY1'])
    ));
    const result = computeSongStats({ raw: 'eight words', lines: [], allWords });

    expect(result.pillars.rhymeDensity.value).toBeCloseTo(7 / 8);
    expect(result.pillars.rhymeDensity.secondary.malmiDensity).toBeCloseTo(7 / 8);
  });
});

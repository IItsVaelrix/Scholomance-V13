import { describe, expect, it } from 'vitest';
import { computeSongStats } from '../../../codex/core/song-stats/index.js';

describe('computeSongStats empty / short', () => {
  it('returns null composite and need_more_lyrics when N < 8', () => {
    const doc = {
      raw: 'one two three',
      lines: [{ text: 'one two three', number: 0, words: [] }],
      allWords: ['one', 'two', 'three'].map((text, i) => ({
        text,
        normalized: text,
        start: i * 4,
        end: i * 4 + text.length,
        phonetics: { phonemes: ['AH0'] },
      })),
      stats: {},
    };
    const result = computeSongStats(doc);
    expect(result.wordCount).toBe(3);
    expect(result.meta.rawWordCount).toBe(3);
    expect(result.meta.analyzedTokenCount).toBe(3);
    expect(result.meta.excludedTokenCount).toBe(0);
    expect(result.composite.total0to100).toBeNull();
    expect(result.composite.label).toBe('technical_density');
    expect(result.meta.engineVersion).toBe('song-stats-v1');
    expect(result.pillars.rhymeDensity.diagnostics.some((d) => d.code === 'need_more_lyrics')).toBe(true);
  });
});

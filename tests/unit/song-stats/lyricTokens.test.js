import { describe, expect, it } from 'vitest';
import {
  collectSongStatsTokens,
  isSectionHeadingLine,
} from '../../../codex/core/song-stats/lyricTokens.js';
import { computeSongStats } from '../../../codex/core/song-stats/index.js';

function word(text, extras = {}) {
  return {
    text,
    normalized: text.toLowerCase(),
    ...extras,
  };
}

describe('lyricTokens', () => {
  it('treats bracket section labels as headings', () => {
    expect(isSectionHeadingLine({ text: '[Verse 1]' })).toBe(true);
    expect(isSectionHeadingLine({ text: 'CHORUS' })).toBe(true);
    expect(isSectionHeadingLine({ text: 'I light the fire higher' })).toBe(false);
  });

  it('reconciles raw vs analyzed counts and excludes short tokens + headings', () => {
    const doc = {
      raw: '[Verse]\nI am a fire\nok',
      lines: [
        {
          text: '[Verse]',
          number: 0,
          words: [word('Verse', { lineNumber: 0, start: 1 })],
        },
        {
          text: 'I am a fire',
          number: 1,
          words: [
            word('I', { lineNumber: 1, start: 10 }),
            word('am', { lineNumber: 1, start: 12 }),
            word('a', { lineNumber: 1, start: 15 }),
            word('fire', { lineNumber: 1, start: 17 }),
          ],
        },
        {
          text: 'ok',
          number: 2,
          words: [word('ok', { lineNumber: 2, start: 30 })],
        },
      ],
      allWords: [
        word('Verse', { lineNumber: 0, start: 1 }),
        word('I', { lineNumber: 1, start: 10 }),
        word('am', { lineNumber: 1, start: 12 }),
        word('a', { lineNumber: 1, start: 15 }),
        word('fire', { lineNumber: 1, start: 17 }),
        word('ok', { lineNumber: 2, start: 30 }),
      ],
    };

    const tokens = collectSongStatsTokens(doc);
    expect(tokens.rawWordCount).toBe(6);
    // Verse (heading), I, a excluded → am, fire, ok
    expect(tokens.analyzedTokenCount).toBe(3);
    expect(tokens.excludedTokenCount).toBe(3);
    expect(tokens.analyzedTokens.map((entry) => entry.normalized)).toEqual([
      'am',
      'fire',
      'ok',
    ]);
  });

  it('uses analyzed token count for footer denominator and vocab secondary', () => {
    const words = Array.from({ length: 40 }, (_, index) => {
      if (index % 5 === 0) {
        return word('I', {
          lineNumber: 0,
          start: index,
          phonetics: { phonemes: ['AY1'] },
        });
      }
      return word(`word${index}`, {
        lineNumber: 0,
        start: index,
        phonetics: { phonemes: ['W', 'ER1', 'D'] },
      });
    });

    const doc = {
      raw: words.map((entry) => entry.text).join(' '),
      lines: [{ text: words.map((entry) => entry.text).join(' '), number: 0, words }],
      allWords: words,
    };

    const result = computeSongStats(doc);
    expect(result.meta.rawWordCount).toBe(40);
    expect(result.meta.analyzedTokenCount).toBe(32); // 8 × "I" excluded
    expect(result.meta.excludedTokenCount).toBe(8);
    expect(result.wordCount).toBe(32);
    expect(result.pillars.uniqueVocabulary.secondary.tokenCount).toBe(32);
    expect(result.wordCount).toBe(result.pillars.uniqueVocabulary.secondary.tokenCount);
  });
});

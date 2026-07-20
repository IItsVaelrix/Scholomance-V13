import { describe, it, expect } from 'vitest';
import { buildTrackScore, type ColoredLyricToken } from '../../../src/pages/Visualiser/songScore';

const line = (tokens: ColoredLyricToken[]): ColoredLyricToken[] => tokens;

describe('buildTrackScore', () => {
  it('computes school shares and dominant school from colored lyrics', () => {
    const colored: ColoredLyricToken[][] = [
      line([
        { word: 'Echo', school: 'SONIC', color: '#a00', analysis: { syllableCount: 2, phonemes: ['EH', 'K', 'OW'] } },
        { word: ' ', school: null, color: null, analysis: null },
        { word: 'veil', school: 'VOID', color: '#00a', analysis: { syllableCount: 1, phonemes: ['V', 'EY', 'L'] } },
      ]),
      line([
        { word: 'call', school: 'SONIC', color: '#a00', analysis: { syllableCount: 1, phonemes: ['K', 'AO', 'L'] } },
      ]),
    ];
    const score = buildTrackScore({
      coloredLyrics: colored,
      lineBeats: [4, 2],
      bpm: 136,
      syncMode: 'aligned',
    });

    expect(score.dominantSchool).toBe('SONIC');
    expect(score.bpm).toBe(136);
    expect(score.syncMode).toBe('aligned');
    expect(score.schoolShares).toEqual([
      { school: 'SONIC', count: 2, pct: expect.closeTo(66.67, 0.1), color: '#a00' },
      { school: 'VOID', count: 1, pct: expect.closeTo(33.33, 0.1), color: '#00a' },
    ]);
  });

  it('builds per-line syllables, phonemes, beats, and pressure', () => {
    const colored: ColoredLyricToken[][] = [
      line([
        { word: 'broadband', school: 'WILL', color: '#f80', analysis: { syllableCount: 2, phonemes: ['B', 'R', 'AO', 'D', 'B', 'AE', 'N', 'D'] } },
      ]),
      line([
        { word: 'oh', school: 'SONIC', color: '#a0f', analysis: { syllableCount: 1, phonemes: ['OW'] } },
      ]),
    ];
    const score = buildTrackScore({
      coloredLyrics: colored,
      lineBeats: [4, 2],
      bpm: 120,
      syncMode: 'estimated',
    });

    expect(score.lines).toHaveLength(2);
    expect(score.lines[0]).toMatchObject({
      index: 0,
      syllables: 2,
      phonemes: 8,
      beats: 4,
      pressure: 0.5,
    });
    expect(score.lines[1]).toMatchObject({
      index: 1,
      syllables: 1,
      phonemes: 1,
      beats: 2,
      pressure: 0.5,
    });
    expect(score.lines[0].schools).toEqual({ WILL: 1 });
  });

  it('falls back to heuristic syllables when analysis is missing', () => {
    const colored: ColoredLyricToken[][] = [
      line([
        { word: 'temples', school: null, color: null, analysis: null },
        { word: ' ', school: null, color: null, analysis: null },
        { word: 'fall', school: null, color: null, analysis: null },
      ]),
    ];
    const score = buildTrackScore({
      coloredLyrics: colored,
      lineBeats: [3],
      bpm: 120,
      syncMode: 'estimated',
    });

    // temples (2) + fall (1) via graphemic heuristic
    expect(score.lines[0].syllables).toBe(3);
    expect(score.lines[0].pressure).toBe(1);
    expect(score.schoolShares).toEqual([]);
    expect(score.dominantSchool).toBe('SONIC');
  });

  it('returns empty lines when colored lyrics are null', () => {
    const score = buildTrackScore({
      coloredLyrics: null,
      lineBeats: [2, 2],
      bpm: 100,
      syncMode: 'estimated',
      lyricLines: ['one two', 'three'],
    });
    expect(score.lines).toHaveLength(2);
    expect(score.lines[0].syllables).toBeGreaterThan(0);
    expect(score.schoolShares).toEqual([]);
  });
});

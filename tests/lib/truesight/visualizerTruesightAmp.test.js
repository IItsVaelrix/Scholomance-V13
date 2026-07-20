import { describe, it, expect, vi } from 'vitest';
import {
  applyVisualizerTruesight,
  digestSourceText,
  joinLyricLines,
  tokenizeLyricsWithCharStarts,
  TRUESIGHT_ARTIFACT_SCHEMA,
} from '../../../src/lib/truesight/visualizerTruesightAmp.js';

vi.mock('../../../src/pages/Visualiser/truesightColor.ts', () => ({
  tokenTruesight: (tokenData, word) => ({
    color: '#ff00aa',
    school: 'SONIC',
    analysis: tokenData,
  }),
  wordTruesight: (word) => ({
    color: '#00ffaa',
    school: 'WILL',
    analysis: { client: true, word },
  }),
}));

describe('visualizerTruesightAmp', () => {
  it('tokenizes with Scribe newline charStart convention', () => {
    const rows = tokenizeLyricsWithCharStarts(['Echo veil', 'call']);
    expect(rows[0].tokens.find((t) => t.word === 'Echo')?.charStart).toBe(0);
    expect(rows[0].tokens.find((t) => t.word === 'veil')?.charStart).toBe(5);
    // "Echo veil\n" = 9 chars before "call"
    expect(rows[1].tokens.find((t) => t.word === 'call')?.charStart).toBe(10);
  });

  it('never emits whitespace as a token', () => {
    const rows = tokenizeLyricsWithCharStarts(['Black Lotus  (PANDA!!!!)']);
    expect(rows[0].tokens.every((t) => !/^\s+$/.test(t.word))).toBe(true);
    expect(rows[0].tokens.some((t) => t.word === ' ')).toBe(false);
    const panda = rows[0].tokens.find((t) => t.word === 'PANDA');
    expect(panda?.isWord).toBe(true);
    // space before "(" rides on the punct token
    expect(rows[0].tokens.find((t) => t.word === '(')?.padLeft).toMatch(/\s/);
  });

  it('returns empty syncMode with no artifact (no ungated paint)', async () => {
    const result = await applyVisualizerTruesight({
      trackId: 't1',
      lyrics: ['Echo veil'],
      artifact: null,
    });
    expect(result.syncMode).toBe('empty');
    expect(result.lines[0].every((t) => t.color == null)).toBe(true);
  });

  it('refuses digest mismatch', async () => {
    const lyrics = ['Echo veil'];
    const result = await applyVisualizerTruesight({
      trackId: 't1',
      lyrics,
      artifact: {
        schemaVersion: TRUESIGHT_ARTIFACT_SCHEMA,
        trackId: 't1',
        sourceTextDigest: 'deadbeef',
        authorityUnavailable: false,
        wordsByCharStart: {},
        connections: [],
        multis: [],
      },
    });
    expect(result.syncMode).toBe('mismatch');
    expect(result.reason).toBe('digest');
  });

  it('colors only gated charStarts via tokenTruesight (COLOR_DRAGON)', async () => {
    const lyrics = ['Echo veil'];
    const text = joinLyricLines(lyrics);
    const digest = await digestSourceText(text);
    const rows = tokenizeLyricsWithCharStarts(lyrics);
    const echoStart = rows[0].tokens.find((t) => t.word === 'Echo').charStart;
    const veilStart = rows[0].tokens.find((t) => t.word === 'veil').charStart;

    const result = await applyVisualizerTruesight({
      trackId: 't1',
      lyrics,
      artifact: {
        schemaVersion: TRUESIGHT_ARTIFACT_SCHEMA,
        trackId: 't1',
        sourceTextDigest: digest,
        authorityUnavailable: false,
        wordsByCharStart: {
          [String(echoStart)]: { rhymeKey: 'OW-open', vowelFamily: 'OW', token: 'Echo' },
          [String(veilStart)]: { rhymeKey: 'EY-L', vowelFamily: 'EY', token: 'veil' },
        },
        connections: [
          {
            type: 'perfect',
            score: 1,
            wordA: { charStart: echoStart },
            wordB: { charStart: echoStart },
          },
        ],
        multis: [],
      },
    });

    expect(result.syncMode).toBe('gated');
    const echo = result.lines[0].find((t) => t.word === 'Echo');
    const veil = result.lines[0].find((t) => t.word === 'veil');
    expect(echo.color).toBe('#ff00aa');
    expect(echo.school).toBe('SONIC');
    expect(veil.color).toBeNull();
  });

  it('authorityUnavailable yields degraded empty coloring', async () => {
    const lyrics = ['Echo'];
    const digest = await digestSourceText(joinLyricLines(lyrics));
    const result = await applyVisualizerTruesight({
      trackId: 't1',
      lyrics,
      artifact: {
        schemaVersion: TRUESIGHT_ARTIFACT_SCHEMA,
        trackId: 't1',
        sourceTextDigest: digest,
        authorityUnavailable: true,
        wordsByCharStart: { 0: { rhymeKey: 'OW-open', token: 'Echo' } },
        connections: [
          { type: 'perfect', score: 1, wordA: { charStart: 0 }, wordB: { charStart: 0 } },
        ],
        multis: [],
      },
    });
    expect(result.syncMode).toBe('degraded');
    expect(result.lines[0][0].color).toBeNull();
  });

  it('multis light rhyme-tier words via gate (Scribe parity)', async () => {
    const lyrics = ['tried remember', 'tried remember'];
    const digest = await digestSourceText(joinLyricLines(lyrics));
    const rows = tokenizeLyricsWithCharStarts(lyrics);
    const a0 = rows[0].tokens.find((t) => t.word === 'tried').charStart;
    const a1 = rows[0].tokens.find((t) => t.word === 'remember').charStart;
    const b0 = rows[1].tokens.find((t) => t.word === 'tried').charStart;
    const b1 = rows[1].tokens.find((t) => t.word === 'remember').charStart;

    const result = await applyVisualizerTruesight({
      trackId: 't1',
      lyrics,
      artifact: {
        schemaVersion: TRUESIGHT_ARTIFACT_SCHEMA,
        trackId: 't1',
        sourceTextDigest: digest,
        authorityUnavailable: false,
        wordsByCharStart: {
          [String(a0)]: { rhymeKey: 'AY-D', token: 'tried' },
          [String(a1)]: { rhymeKey: 'EH-MBER', token: 'remember' },
          [String(b0)]: { rhymeKey: 'AY-D', token: 'tried' },
          [String(b1)]: { rhymeKey: 'EH-MBER', token: 'remember' },
        },
        connections: [],
        multis: [
          {
            score: 0.98,
            a: { charStarts: [a0, a1] },
            b: { charStarts: [b0, b1] },
          },
        ],
      },
    });

    expect(result.syncMode).toBe('gated');
    expect(result.gateSize).toBe(4);
    expect(result.lines.flat().filter((t) => t.color === '#ff00aa')).toHaveLength(4);
  });

  it('COLOR_DRAGON: gated without tokenData stays uncolored (no wordTruesight)', async () => {
    const lyrics = ['Echo veil'];
    const digest = await digestSourceText(joinLyricLines(lyrics));
    const echoStart = tokenizeLyricsWithCharStarts(lyrics)[0].tokens
      .find((t) => t.word === 'Echo').charStart;

    const result = await applyVisualizerTruesight({
      trackId: 't1',
      lyrics,
      artifact: {
        schemaVersion: TRUESIGHT_ARTIFACT_SCHEMA,
        trackId: 't1',
        sourceTextDigest: digest,
        authorityUnavailable: false,
        wordsByCharStart: {},
        connections: [
          {
            type: 'perfect',
            score: 1,
            wordA: { charStart: echoStart },
            wordB: { charStart: echoStart },
          },
        ],
        multis: [],
      },
    });

    const echo = result.lines[0].find((t) => t.word === 'Echo');
    expect(echo.tier).toBe('rhyme');
    expect(echo.color).toBeNull();
    // wordTruesight mock returns #00ffaa — must not appear
    expect(result.lines.flat().some((t) => t.color === '#00ffaa')).toBe(false);
  });
});

// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSongStats } from '../../src/hooks/useSongStats.js';
import { buildSourceFingerprint } from '../../codex/core/song-stats/fingerprint.js';
import { DEFAULT_BEATS_PER_LINE, DEFAULT_BPM, DEFAULT_RHYME_WINDOW } from '../../codex/core/song-stats/constants.js';

function fingerprintFor(raw) {
  return buildSourceFingerprint({
    raw,
    rhymeWindow: DEFAULT_RHYME_WINDOW,
    bpm: DEFAULT_BPM,
    beatsPerLine: DEFAULT_BEATS_PER_LINE,
  });
}

function songStatsResult(sourceFingerprint) {
  return {
    wordCount: 40,
    pillars: {},
    composite: { label: 'technical_density', total0to100: 61, band: 'Adept', provisional: false, weights: {} },
    meta: { sourceFingerprint },
  };
}

describe('useSongStats', () => {
  it('returns null and no failure while there is no analysis yet', () => {
    const { result } = renderHook(() => useSongStats('some lyrics', null));
    expect(result.current.songStats).toBeNull();
    expect(result.current.computeFailed).toBe(false);
  });

  it('passes through a successful songStats result', () => {
    const raw = 'some lyrics';
    const stats = songStatsResult(fingerprintFor(raw));
    const { result } = renderHook(() => useSongStats(raw, { songStats: stats }));
    expect(result.current.songStats).toBe(stats);
    expect(result.current.computeFailed).toBe(false);
  });

  it('falls back to the last good result when a later compute fails but content is unchanged', () => {
    const raw = 'hello world cadence lyric solid another pulse meter';
    const stats = songStatsResult(fingerprintFor(raw));
    const { result, rerender } = renderHook(
      ({ text, deepAnalysis }) => useSongStats(text, deepAnalysis),
      { initialProps: { text: raw, deepAnalysis: { songStats: stats } } },
    );
    expect(result.current.songStats).toBe(stats);

    // Same content, but this round's deepAnalysis carries no songStats.
    // Client fallback recomputes from raw text rather than marking failed.
    rerender({ text: raw, deepAnalysis: { songStats: null } });

    expect(result.current.songStats).not.toBeNull();
    expect(result.current.songStats.meta.sourceFingerprint).toBe(fingerprintFor(raw));
    expect(result.current.computeFailed).toBe(false);
  });

  it('returns null pending (not computeFailed) when text changes but old songStats remains', () => {
    const originalText = 'some lyrics';
    const stats = songStatsResult(fingerprintFor(originalText));
    const { result, rerender } = renderHook(
      ({ text, deepAnalysis }) => useSongStats(text, deepAnalysis),
      { initialProps: { text: originalText, deepAnalysis: { songStats: stats } } },
    );
    expect(result.current.songStats).toBe(stats);

    // Content changed; stale server payload still present until re-analysis.
    rerender({ text: 'completely different lyrics now', deepAnalysis: { songStats: stats } });

    expect(result.current.songStats).toBeNull();
    expect(result.current.computeFailed).toBe(false);
  });

  it('computes client-side songStats when deepAnalysis omits songStats', () => {
    const raw = 'hello world cadence lyric solid another pulse meter';
    const { result } = renderHook(() => useSongStats(raw, { songStats: null, scheme: {} }));

    expect(result.current.songStats).not.toBeNull();
    expect(result.current.songStats.meta.sourceFingerprint).toBe(fingerprintFor(raw));
    expect(result.current.computeFailed).toBe(false);
  });
});

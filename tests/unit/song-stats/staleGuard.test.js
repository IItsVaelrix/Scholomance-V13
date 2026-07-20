import { describe, expect, it } from 'vitest';
import { resolveSongStatsDisplay } from '../../../codex/core/song-stats/staleGuard.js';

function resultWithFingerprint(sourceFingerprint) {
  return {
    wordCount: 40,
    pillars: {},
    composite: { label: 'technical_density', total0to100: 61, band: 'Adept', provisional: false, weights: {} },
    meta: { sourceFingerprint },
  };
}

describe('resolveSongStatsDisplay', () => {
  it('returns the next result only when its fingerprint matches current', () => {
    const nextResult = resultWithFingerprint('fp-a');
    expect(resolveSongStatsDisplay({
      computeFailed: false,
      lastGood: null,
      currentFingerprint: 'fp-a',
      nextResult,
    })).toBe(nextResult);
  });

  it('returns null (pending) when nextResult fingerprint mismatches current', () => {
    const lastGood = resultWithFingerprint('fp-old');
    const nextResult = resultWithFingerprint('fp-old');
    expect(resolveSongStatsDisplay({
      computeFailed: false,
      lastGood,
      currentFingerprint: 'fp-new',
      nextResult,
    })).toBeNull();
  });

  it('returns the next result on success even when it differs from lastGood', () => {
    const lastGood = resultWithFingerprint('fp-old');
    const nextResult = resultWithFingerprint('fp-new');
    expect(resolveSongStatsDisplay({
      computeFailed: false,
      lastGood,
      currentFingerprint: 'fp-new',
      nextResult,
    })).toBe(nextResult);
  });

  it('falls back to lastGood when compute failed but content identity is unchanged', () => {
    const lastGood = resultWithFingerprint('fp-a');
    expect(resolveSongStatsDisplay({
      computeFailed: true,
      lastGood,
      currentFingerprint: 'fp-a',
      nextResult: null,
    })).toBe(lastGood);
  });

  it('returns null (stats_compute_failed) when compute failed and content has changed', () => {
    const lastGood = resultWithFingerprint('fp-old');
    expect(resolveSongStatsDisplay({
      computeFailed: true,
      lastGood,
      currentFingerprint: 'fp-new',
      nextResult: null,
    })).toBeNull();
  });

  it('returns null when compute failed and there is no lastGood at all', () => {
    expect(resolveSongStatsDisplay({
      computeFailed: true,
      lastGood: null,
      currentFingerprint: 'fp-a',
      nextResult: null,
    })).toBeNull();
  });

  it('returns null when compute failed and lastGood has no fingerprint metadata', () => {
    expect(resolveSongStatsDisplay({
      computeFailed: true,
      lastGood: { pillars: {}, composite: {} },
      currentFingerprint: 'fp-a',
      nextResult: null,
    })).toBeNull();
  });
});

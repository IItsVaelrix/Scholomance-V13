import { useEffect, useMemo, useRef } from 'react';
import { analyzeText } from '../../codex/core/analysis.pipeline.js';
import { computeSongStats } from '../../codex/core/song-stats/index.js';
import { buildSourceFingerprint } from '../../codex/core/song-stats/fingerprint.js';
import { DEFAULT_BEATS_PER_LINE, DEFAULT_BPM, DEFAULT_RHYME_WINDOW } from '../../codex/core/song-stats/constants.js';
import { resolveSongStatsDisplay } from '../../codex/core/song-stats/staleGuard.js';

/**
 * Bridges the server-attached `songStats` field (computed server-side from
 * the same AnalyzedDocument used for the rest of panel analysis) into
 * Read-page state, applying the fingerprint-identity stale guard so a
 * failed or stale computation never silently shows a result for different lyrics.
 *
 * When deepAnalysis lacks songStats (local synthesize fallback / non-fatal
 * server miss) but scroll text is available, computes client-side via
 * analyzeText + computeSongStats instead of marking computeFailed.
 *
 * @param {string} rawText - the current scroll/editor content driving analysis
 * @param {{ songStats?: import('../../codex/core/song-stats/types.js').SongStatsResult | null } | null} deepAnalysis
 * @returns {{
 *   songStats: import('../../codex/core/song-stats/types.js').SongStatsResult | null,
 *   computeFailed: boolean,
 * }}
 */
export function useSongStats(rawText, deepAnalysis) {
  const lastGoodRef = useRef(null);
  const text = String(rawText || '');

  const currentFingerprint = useMemo(() => buildSourceFingerprint({
    raw: text,
    rhymeWindow: DEFAULT_RHYME_WINDOW,
    bpm: DEFAULT_BPM,
    beatsPerLine: DEFAULT_BEATS_PER_LINE,
  }), [text]);

  const serverResult = deepAnalysis?.songStats ?? null;

  const clientResult = useMemo(() => {
    // Prefer the server payload when present; only fill gaps on local/fallback
    // analysis paths that omit songStats.
    if (!deepAnalysis || serverResult || !text) return null;
    try {
      return computeSongStats(analyzeText(text));
    } catch {
      return null;
    }
  }, [deepAnalysis, serverResult, text]);

  const nextResult = serverResult ?? clientResult;

  // True failure only when analysis arrived, server omitted songStats, and the
  // client fallback also could not produce a result. Fingerprint mismatch is
  // pending — never computeFailed.
  const computeFailed = Boolean(deepAnalysis) && !serverResult && !clientResult;

  useEffect(() => {
    if (nextResult?.meta?.sourceFingerprint === currentFingerprint) {
      lastGoodRef.current = nextResult;
    }
  }, [nextResult, currentFingerprint]);

  const songStats = resolveSongStatsDisplay({
    computeFailed,
    lastGood: lastGoodRef.current,
    currentFingerprint,
    nextResult,
  });

  return {
    songStats,
    computeFailed: computeFailed && !songStats,
  };
}

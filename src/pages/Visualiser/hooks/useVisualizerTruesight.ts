import { useEffect, useMemo, useState } from 'react';
import { engineMicroprocessors } from '../../../lib/engine.adapter.js';
import { TRUESIGHT_ARTIFACT_SCHEMA } from '../../../lib/truesight/visualizerTruesightAmp.js';
import { degradeWithFallback } from '../recovery';

/**
 * Load baked truesight artifact and apply amp.visualizer.truesight.
 * Mirrors useLyricAlignment's fetch contract.
 */
export function useVisualizerTruesight(trackId: string, lyrics: string[]) {
  const lyricsKey = useMemo(
    () => (Array.isArray(lyrics) ? lyrics.join('\n') : ''),
    [lyrics],
  );

  const [result, setResult] = useState<{
    lines: { word: string; color: string | null; school: string | null; analysis: any; tier: string | null }[][] | null;
    syncMode: string;
    dominantSchool: string;
    gateSize: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    if (!trackId || !lyricsKey) return;

    const url = `${import.meta.env.BASE_URL}data/truesight/${trackId}.truesight-v1.json`;
    const lyricLines = lyricsKey.split('\n');

    (async () => {
      let artifact = null;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          if (json?.schemaVersion === TRUESIGHT_ARTIFACT_SCHEMA && json?.trackId === trackId) {
            artifact = json;
          } else if (!cancelled) {
            degradeWithFallback(
              new Error(`schema/trackId mismatch for ${trackId}`),
              'truesight-artifact-rejected',
            );
          }
        } else if (!cancelled) {
          degradeWithFallback(
            new Error(`HTTP ${res.status}`),
            'truesight-artifact-missing',
          );
        }
      } catch (error) {
        artifact = null;
        degradeWithFallback(error, 'truesight-artifact-fetch-failed');
      }

      try {
        const applied = await engineMicroprocessors.execute('amp.visualizer.truesight', {
          trackId,
          lyrics: lyricLines,
          artifact,
        });
        if (!cancelled) {
          setResult({
            lines: applied?.lines ?? null,
            syncMode: applied?.syncMode ?? 'empty',
            dominantSchool: applied?.dominantSchool ?? 'SONIC',
            gateSize: applied?.gateSize ?? 0,
          });
        }
      } catch (err) {
        if (!cancelled) {
          degradeWithFallback(err, 'truesight-amp-apply-failed');
          setResult({
            lines: null,
            syncMode: 'empty',
            dominantSchool: 'SONIC',
            gateSize: 0,
          });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [trackId, lyricsKey]);

  return result;
}

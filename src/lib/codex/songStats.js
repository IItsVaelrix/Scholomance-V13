/**
 * Song stats adapter — re-exports from codex/core/song-stats for UI layer.
 */

export { computeSongStats } from '../../../codex/core/song-stats/index.js';
export { buildSourceFingerprint } from '../../../codex/core/song-stats/fingerprint.js';
export {
  DEFAULT_BEATS_PER_LINE,
  DEFAULT_BPM,
  DEFAULT_RHYME_WINDOW,
  MIN_WORDS_FOR_STATS,
} from '../../../codex/core/song-stats/constants.js';
export { resolveSongStatsDisplay } from '../../../codex/core/song-stats/staleGuard.js';

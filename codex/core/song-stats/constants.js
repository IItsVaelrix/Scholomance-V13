/** @type {'song-stats-v1'} */
export const ENGINE_VERSION = 'song-stats-v1';
export const CALIBRATION_VERSION = 'cal-2026-07-18';
export const DEFAULT_RHYME_WINDOW = 24;
export const MAX_RHYME_SPAN_WORDS = 1;
export const RD_C_CEILING = 2;
export const VOCAB_CEILING = 60;
export const SPS_CEILING = 8;
export const FLOW_SPS_WEIGHT = 0.55;
export const FLOW_SYNC_WEIGHT = 0.45;
export const WEIGHTS = {
  rhymeDensity: 0.4,
  uniqueVocabulary: 0.35,
  flowAlignment: 0.25,
};
export const MIN_WORDS_FOR_STATS = 8;
export const MIN_WORDS_FOR_STABLE_COMPOSITE = 32;
export const DEFAULT_BPM = 90;
export const DEFAULT_BEATS_PER_LINE = 4;
export const ALIGNMENT_COVERAGE_MIN = 0.85;
export const BEAT_GRID_COVERAGE_MIN = 0.95;

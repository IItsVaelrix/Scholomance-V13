import { stemWord } from '../analysis.pipeline.js';
import {
  MIN_WORDS_FOR_STATS,
  MIN_WORDS_FOR_STABLE_COMPOSITE,
  VOCAB_CEILING,
} from './constants.js';
import { normalizeLyricToken } from './lyricTokens.js';

/** @typedef {import('./types.js').SongStatPillar} SongStatPillar */

/**
 * @param {number} value
 * @returns {number}
 */
function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/**
 * CODEx song-level lexical diversity: unique lemmas per 100 analyzed tokens.
 * Expects canonical tokens from collectSongStatsTokens (already filtered).
 *
 * @param {Array<Record<string, unknown>>} words
 * @returns {SongStatPillar}
 */
export function computeUniqueVocabulary(words) {
  const sourceWords = Array.isArray(words) ? words : [];
  const tokens = sourceWords
    .map((word) => normalizeLyricToken(word))
    .filter((token) => token.length >= 2);

  const tokenCount = tokens.length;
  const surfaceTypeCount = new Set(tokens).size;
  const lemmas = tokens.map((token) => stemWord(token) || token);
  const uniqueLemmaCount = new Set(lemmas).size;
  const value = tokenCount > 0 ? (uniqueLemmaCount / tokenCount) * 100 : 0;

  /** @type {import('./types.js').Diagnostic[]} */
  const diagnostics = tokenCount >= MIN_WORDS_FOR_STATS
    && tokenCount < MIN_WORDS_FOR_STABLE_COMPOSITE
    ? [{
        code: 'vocabulary_sample_small',
        message: 'Vocabulary diversity may be inflated by the short sample.',
        severity: 'warning',
      }]
    : [];

  return {
    id: 'unique_vocabulary',
    value,
    unit: '/100t',
    secondary: {
      uniqueLemmaCount,
      surfaceTypeCount,
      tokenCount,
    },
    normalized01: clamp01(value / VOCAB_CEILING),
    fidelity: 'exact',
    confidence01: 1,
    coverage01: 1,
    diagnostics,
  };
}

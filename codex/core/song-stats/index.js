import {
  CALIBRATION_VERSION,
  DEFAULT_BEATS_PER_LINE,
  DEFAULT_BPM,
  DEFAULT_RHYME_WINDOW,
  ENGINE_VERSION,
  MIN_WORDS_FOR_STATS,
} from './constants.js';
import { buildComposite } from './composite.js';
import { buildSourceFingerprint } from './fingerprint.js';
import { computeFlowAlignment } from './flowAlignment.js';
import { collectSongStatsTokens } from './lyricTokens.js';
import { computeRhymeDensity } from './rhymeDensity.js';
import { computeUniqueVocabulary } from './uniqueVocabulary.js';

/** @typedef {import('./types.js').AnalyzedDocument} AnalyzedDocument */
/** @typedef {import('./types.js').ComputeSongStatsOptions} ComputeSongStatsOptions */
/** @typedef {import('./types.js').Diagnostic} Diagnostic */
/** @typedef {import('./types.js').SongStatPillar} SongStatPillar */
/** @typedef {import('./types.js').SongStatsMeta} SongStatsMeta */
/** @typedef {import('./types.js').SongStatsResult} SongStatsResult */

/**
 * @param {Diagnostic[]} [extraDiagnostics]
 * @returns {SongStatPillar}
 */
function stubRhymeDensityPillar(extraDiagnostics = []) {
  return {
    id: 'rhyme_density',
    value: 0,
    unit: 'rd',
    normalized01: 0,
    fidelity: 'exact',
    confidence01: 0,
    coverage01: 0,
    diagnostics: extraDiagnostics,
  };
}

/**
 * @returns {SongStatPillar}
 */
function stubUniqueVocabularyPillar() {
  return {
    id: 'unique_vocabulary',
    value: 0,
    unit: '/100t',
    normalized01: 0,
    fidelity: 'exact',
    confidence01: 0,
    coverage01: 0,
    diagnostics: [],
  };
}

/**
 * @returns {SongStatPillar}
 */
function stubFlowAlignmentPillar() {
  return {
    id: 'flow_alignment',
    value: 0,
    unit: 'sps',
    normalized01: 0,
    fidelity: 'estimated',
    confidence01: 0,
    coverage01: 0,
    diagnostics: [],
  };
}

/**
 * @param {AnalyzedDocument} doc
 * @param {ComputeSongStatsOptions} [options]
 * @returns {SongStatsResult}
 */
export function computeSongStats(doc, options = {}) {
  const rhymeWindow = options.rhymeWindow ?? DEFAULT_RHYME_WINDOW;
  const bpm = Number.isFinite(options.bpm) && options.bpm > 0
    ? options.bpm
    : DEFAULT_BPM;
  const beatsPerLine = Number.isFinite(options.beatsPerLine) && options.beatsPerLine > 0
    ? options.beatsPerLine
    : DEFAULT_BEATS_PER_LINE;

  const {
    rawWordCount,
    analyzedTokens,
    analyzedTokenCount,
    excludedTokenCount,
  } = collectSongStatsTokens(doc);

  // Canonical denominator for gates, composite, and UI — analyzed lyric tokens.
  const wordCount = analyzedTokenCount;

  const sourceFingerprint = buildSourceFingerprint({
    raw: doc.raw ?? '',
    rhymeWindow,
    bpm,
    beatsPerLine,
    alignmentFingerprint: options.alignment?.fingerprint ?? options.alignment?.id ?? null,
    beatGridFingerprint: options.beatGrid?.fingerprint ?? options.beatGrid?.id ?? null,
  });

  /** @type {SongStatsMeta} */
  const meta = {
    engineVersion: ENGINE_VERSION,
    calibrationVersion: CALIBRATION_VERSION,
    sourceFingerprint,
    rhymeWindow,
    fidelitySummary: 'estimated',
    rawWordCount,
    analyzedTokenCount,
    excludedTokenCount,
    assumptions: {
      estimatedBpm: bpm,
      beatsPerLine,
      lineRepresentsBar: true,
    },
  };

  if (wordCount < MIN_WORDS_FOR_STATS) {
    /** @type {Diagnostic} */
    const needMoreLyrics = {
      code: 'need_more_lyrics',
      message: `At least ${MIN_WORDS_FOR_STATS} analyzed lyric tokens are required for song stats.`,
      severity: 'warning',
    };

    const shortTextPillars = {
      rhymeDensity: stubRhymeDensityPillar([needMoreLyrics]),
      uniqueVocabulary: stubUniqueVocabularyPillar(),
      flowAlignment: stubFlowAlignmentPillar(),
    };
    return {
      wordCount,
      pillars: shortTextPillars,
      composite: buildComposite(shortTextPillars, {
        wordCount,
        flowFidelity: shortTextPillars.flowAlignment.fidelity,
      }),
      meta,
    };
  }

  const pillars = {
    rhymeDensity: computeRhymeDensity(analyzedTokens, { rhymeWindow }),
    uniqueVocabulary: computeUniqueVocabulary(analyzedTokens),
    flowAlignment: computeFlowAlignment(doc, {
      ...options,
      bpm,
      beatsPerLine,
    }),
  };
  meta.fidelitySummary = pillars.flowAlignment.fidelity;

  return {
    wordCount,
    pillars,
    composite: buildComposite(pillars, {
      wordCount,
      flowFidelity: pillars.flowAlignment.fidelity,
    }),
    meta,
  };
}

export { buildComposite } from './composite.js';
export { buildSourceFingerprint } from './fingerprint.js';
export { computeFlowAlignment } from './flowAlignment.js';
export {
  collectSongStatsTokens,
  isSectionHeadingLine,
  normalizeLyricToken,
} from './lyricTokens.js';
export { computeRhymeDensity, longestVowelMatchLength } from './rhymeDensity.js';
export { computeUniqueVocabulary } from './uniqueVocabulary.js';
export * from './constants.js';

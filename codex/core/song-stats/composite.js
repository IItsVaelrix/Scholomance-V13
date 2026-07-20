import {
  MIN_WORDS_FOR_STABLE_COMPOSITE,
  MIN_WORDS_FOR_STATS,
  WEIGHTS,
} from './constants.js';

/**
 * @param {number} total
 * @returns {import('./types.js').TechnicalDensityBand}
 */
function technicalDensityBand(total) {
  if (total >= 90) return 'Godlike';
  if (total >= 75) return 'Master';
  if (total >= 60) return 'Adept';
  return 'Neophyte';
}

/**
 * @param {import('./types.js').SongStatsResult['pillars']} pillars
 * @param {{
 *   wordCount: number,
 *   flowFidelity: import('./types.js').SongStatFidelity,
 * }} context
 * @returns {import('./types.js').SongStatsComposite}
 */
export function buildComposite(pillars, { wordCount, flowFidelity }) {
  const normalizedValues = [
    pillars?.rhymeDensity?.normalized01,
    pillars?.uniqueVocabulary?.normalized01,
    pillars?.flowAlignment?.normalized01,
  ];
  const canScore = (
    wordCount >= MIN_WORDS_FOR_STATS
    && normalizedValues.every(Number.isFinite)
  );
  const total0to100 = canScore
    ? 100 * (
      WEIGHTS.rhymeDensity * normalizedValues[0]
      + WEIGHTS.uniqueVocabulary * normalizedValues[1]
      + WEIGHTS.flowAlignment * normalizedValues[2]
    )
    : null;

  return {
    label: 'technical_density',
    total0to100,
    band: total0to100 === null ? null : technicalDensityBand(total0to100),
    provisional: (
      wordCount < MIN_WORDS_FOR_STABLE_COMPOSITE
      || flowFidelity === 'estimated'
    ),
    weights: { ...WEIGHTS },
  };
}

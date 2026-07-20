import { isVowelPhoneme, stripStress } from '../rhyme-astrology/signatures.js';
import { DEFAULT_RHYME_WINDOW, RD_C_CEILING } from './constants.js';

/** @typedef {import('./types.js').SongStatPillar} SongStatPillar */

/**
 * @param {number} value
 * @returns {number}
 */
function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/**
 * @param {unknown} phonemes
 * @returns {string[]}
 */
function vowelIdentities(phonemes) {
  if (!Array.isArray(phonemes)) return [];
  return phonemes
    .filter(isVowelPhoneme)
    .map(stripStress);
}

/**
 * Returns the number of equal trailing vowel identities in two phoneme arrays.
 * Stress digits are ignored.
 *
 * @param {unknown} leftPhonemes
 * @param {unknown} rightPhonemes
 * @returns {number}
 */
export function longestVowelMatchLength(leftPhonemes, rightPhonemes) {
  const left = vowelIdentities(leftPhonemes);
  const right = vowelIdentities(rightPhonemes);
  const limit = Math.min(left.length, right.length);
  let length = 0;

  while (
    length < limit
    && left[left.length - 1 - length] === right[right.length - 1 - length]
  ) {
    length += 1;
  }

  return length;
}

/**
 * @param {Record<string, unknown>} word
 * @returns {unknown[]}
 */
function phonemesOf(word) {
  const phonetics = /** @type {{ phonemes?: unknown[] } | undefined} */ (word?.phonetics);
  if (Array.isArray(phonetics?.phonemes) && phonetics.phonemes.length > 0) {
    return phonetics.phonemes;
  }

  const deepPhonetics = /** @type {{ phonemes?: unknown[] } | undefined} */ (word?.deepPhonetics);
  return Array.isArray(deepPhonetics?.phonemes) ? deepPhonetics.phonemes : [];
}

/**
 * @param {Array<Record<string, unknown>>} words
 * @param {{ rhymeWindow?: number }} [options]
 * @returns {SongStatPillar}
 */
export function computeRhymeDensity(words, options = {}) {
  const sourceWords = Array.isArray(words) ? words : [];
  const wordCount = sourceWords.length;
  const requestedWindow = options.rhymeWindow ?? DEFAULT_RHYME_WINDOW;
  const rhymeWindow = Number.isFinite(requestedWindow)
    ? Math.max(0, Math.floor(requestedWindow))
    : DEFAULT_RHYME_WINDOW;
  const phonemeSequences = sourceWords.map(phonemesOf);
  const coveredWords = phonemeSequences.filter((phonemes) => phonemes.length > 0).length;
  const phonemeCoverage = wordCount > 0 ? coveredWords / wordCount : 0;

  let totalLSum = 0;
  let totalLSquaredSum = 0;
  let repetitionLSum = 0;
  let longestChain = 0;

  for (let index = 0; index < wordCount; index += 1) {
    let maxLength = 0;
    let maxIncludesRepetition = false;
    let maxIncludesNonRepetition = false;
    const currentToken = String(sourceWords[index]?.normalized ?? '');
    const windowStart = Math.max(0, index - rhymeWindow);

    for (let priorIndex = windowStart; priorIndex < index; priorIndex += 1) {
      const matchLength = longestVowelMatchLength(
        phonemeSequences[index],
        phonemeSequences[priorIndex],
      );
      const isRepetition = currentToken === String(sourceWords[priorIndex]?.normalized ?? '');

      if (matchLength > maxLength) {
        maxLength = matchLength;
        maxIncludesRepetition = isRepetition;
        maxIncludesNonRepetition = !isRepetition;
      } else if (matchLength === maxLength && matchLength > 0) {
        if (isRepetition) {
          maxIncludesRepetition = true;
        } else {
          maxIncludesNonRepetition = true;
        }
      }
    }

    totalLSum += maxLength;
    totalLSquaredSum += maxLength * maxLength;
    longestChain = Math.max(longestChain, maxLength);
    if (maxIncludesRepetition && !maxIncludesNonRepetition) repetitionLSum += maxLength;
  }

  const malmiDensity = wordCount > 0 ? totalLSum / wordCount : 0;
  const codexDensity = wordCount > 0 ? totalLSquaredSum / wordCount : 0;
  const repetitionContribution = totalLSum > 0 ? repetitionLSum / totalLSum : 0;
  const diagnostics = repetitionContribution > 0.5
    ? [{
        code: 'rhyme_repetition_heavy',
        message: 'More than half of rhyme density comes from repeated tokens.',
        severity: 'info',
      }]
    : [];

  return {
    id: 'rhyme_density',
    value: codexDensity,
    unit: 'rd',
    secondary: {
      malmiDensity,
      longestChain,
      phonemeCoverage,
      repetitionContribution,
    },
    normalized01: clamp01(codexDensity / RD_C_CEILING),
    fidelity: 'exact',
    confidence01: phonemeCoverage,
    coverage01: phonemeCoverage,
    diagnostics,
  };
}

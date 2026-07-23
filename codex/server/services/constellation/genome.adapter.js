import { VOWEL_FAMILY_TO_SCHOOL } from '../../../core/constants/schools.js';
import { detectPhraseDevices } from '../../../core/constellation/phraseAnalysis.js';

export const GENOME_ADAPTER_VERSION = 'genome-adapter-2';

/** ARPABET vowels carry a stress digit (0|1|2); one per syllable. */
export function syllablesFromPhonemes(phonemes) {
  if (!Array.isArray(phonemes)) return 0;
  return phonemes.filter((p) => /[0-2]$/.test(String(p))).length;
}

/**
 * @param {{ phonemes: string[], dominantVowelFamily: string|null }|null} rhyme
 * @param {object} identity  resolveQueryIdentity output
 */
export function analyzeGenome(rhyme, identity) {
  const phonemes = rhyme?.phonemes || [];
  const family = rhyme?.dominantVowelFamily || null;

  // Use the core phrase-analysis device detector (alliteration, assonance,
  // consonance, sibilance, imagery-candidate) instead of the old
  // alliteration-only inline check.
  const devicesHint = detectPhraseDevices(identity);

  return {
    syllables: syllablesFromPhonemes(phonemes),
    devicesHint,
    schoolHint: (family && VOWEL_FAMILY_TO_SCHOOL[family]) || null,
  };
}

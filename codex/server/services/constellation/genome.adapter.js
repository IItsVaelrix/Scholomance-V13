import { VOWEL_FAMILY_TO_SCHOOL } from '../../../core/constants/schools.js';
import { STOPWORDS } from '../../../core/constellation/stopwords.js';

export const GENOME_ADAPTER_VERSION = 'genome-adapter-1';

/** ARPABET vowels carry a stress digit (0|1|2); one per syllable. */
export function syllablesFromPhonemes(phonemes) {
  if (!Array.isArray(phonemes)) return 0;
  return phonemes.filter((p) => /[0-2]$/.test(String(p))).length;
}

function alliterationHint(tokens) {
  const content = tokens.filter((t) => !STOPWORDS.has(t) && t.length > 0);
  const firsts = content.map((t) => t[0]);
  const hasRepeat = firsts.some((c, i) => firsts.indexOf(c) !== i);
  return hasRepeat ? ['alliteration-candidate'] : [];
}

/**
 * @param {{ phonemes: string[], dominantVowelFamily: string|null }|null} rhyme
 * @param {object} identity  resolveQueryIdentity output
 */
export function analyzeGenome(rhyme, identity) {
  const phonemes = rhyme?.phonemes || [];
  const family = rhyme?.dominantVowelFamily || null;
  return {
    syllables: syllablesFromPhonemes(phonemes),
    devicesHint: alliterationHint(identity.tokens || []),
    schoolHint: (family && VOWEL_FAMILY_TO_SCHOOL[family]) || null,
  };
}

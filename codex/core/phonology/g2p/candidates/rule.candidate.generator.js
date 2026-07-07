import { generateCandidateId, CANDIDATE_SOURCES, MAX_CANDIDATES } from '../schemas.js';

const VOWEL_MAP = Object.freeze({
  A: 'AE',
  E: 'EH',
  I: 'IH',
  O: 'AA',
  U: 'AH',
  Y: 'IH',
  W: 'W',
});

const CONSONANT_MAP = Object.freeze({
  B: 'B',
  C: 'K',
  D: 'D',
  F: 'F',
  G: 'G',
  H: 'HH',
  J: 'JH',
  K: 'K',
  L: 'L',
  M: 'M',
  N: 'N',
  P: 'P',
  Q: 'K',
  R: 'R',
  S: 'S',
  T: 'T',
  V: 'V',
  X: ['K', 'S'],
  Z: 'Z',
});

const MAGIC_MAP = Object.freeze({
  A: 'EY',
  E: 'IY',
  I: 'AY',
  O: 'OW',
  U: 'UW',
});

const DIGRAPH_MAP = Object.freeze({
  CH: ['CH'],
  SH: ['SH'],
  TH: ['TH'],
  PH: ['F'],
  WH: ['W'],
  CK: ['K'],
  QU: ['K', 'W'],
  X: ['K', 'S'],
});

const SUFFIX_RULES = Object.freeze([
  { suffix: 'ING', phonemes: ['IH0', 'NG'], confidenceBoost: 0.1 },
  { suffix: 'TION', phonemes: ['SH', 'AH0', 'N'], confidenceBoost: 0.1 },
  { suffix: 'SION', phonemes: ['ZH', 'AH0', 'N'], confidenceBoost: 0.05 },
  { suffix: 'NESS', phonemes: ['N', 'AH0', 'S'], confidenceBoost: 0.05 },
  { suffix: 'MENT', phonemes: ['M', 'AH0', 'N', 'T'], confidenceBoost: 0.05 },
  { suffix: 'ABLE', phonemes: ['EY1', 'B', 'AH0', 'L'], confidenceBoost: 0.05 },
  { suffix: 'IBLE', phonemes: ['IH0', 'B', 'AH0', 'L'], confidenceBoost: 0.05 },
  { suffix: 'FUL', phonemes: ['F', 'UH0', 'L'], confidenceBoost: 0.05 },
  { suffix: 'LESS', phonemes: ['L', 'EH0', 'S'], confidenceBoost: 0.05 },
  { suffix: 'OUS', phonemes: ['AH0', 'S'], confidenceBoost: 0.05 },
  { suffix: 'IVE', phonemes: ['IH0', 'V'], confidenceBoost: 0.05 },
  { suffix: 'ED', phonemes: ['EH1', 'D'], confidenceBoost: 0.05 },
  { suffix: 'ER', phonemes: ['ER0'], confidenceBoost: 0.05 },
  { suffix: 'OR', phonemes: ['ER0'], confidenceBoost: 0.05 },
  { suffix: 'LY', phonemes: ['L', 'IY0'], confidenceBoost: 0.05 },
]);

function applyDigraph(char, nextChar) {
  const digraph = char + nextChar;
  if (DIGRAPH_MAP[digraph]) {
    return { phonemes: DIGRAPH_MAP[digraph], advance: 2 };
  }
  return null;
}

function applyMagicE(char, remainingWord, position) {
  if (!remainingWord.endsWith('E')) return null;
  const consonantCount = remainingWord.length - 2;
  if (consonantCount < 1) return null;

  const vowelPhoneme = MAGIC_MAP[char];
  if (!vowelPhoneme) return null;

  const consonantPhoneme = remainingWord[remainingWord.length - 2] || 'K';
  return {
    phonemes: [consonantPhoneme, vowelPhoneme + '1'],
    advance: remainingWord.length - position,
  };
}

export function generateRuleCandidates(word) {
  const upper = String(word || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!upper) return [];

  const results = [];
  const seenPhonemes = new Set();

  const baseCandidate = convertWordToPhonemes(upper);
  addUniqueCandidate(results, seenPhonemes, {
    word: upper,
    phonemes: baseCandidate.phonemes,
    source: CANDIDATE_SOURCES.RULE,
    generatedBy: 'rule-v1',
    confidence: 0.6,
  });

  const digraphCandidate = convertWithDigraphs(upper);
  if (digraphCandidate) {
    addUniqueCandidate(results, seenPhonemes, {
      word: upper,
      phonemes: digraphCandidate.phonemes,
      source: CANDIDATE_SOURCES.RULE,
      generatedBy: 'rule-v1-digraph',
      confidence: 0.55,
    });
  }

  const magicECandidate = convertWithMagicE(upper);
  if (magicECandidate) {
    addUniqueCandidate(results, seenPhonemes, {
      word: upper,
      phonemes: magicECandidate.phonemes,
      source: CANDIDATE_SOURCES.RULE,
      generatedBy: 'rule-v1-magic-e',
      confidence: 0.5,
    });
  }

  const suffixCandidate = convertWithSuffixRules(upper);
  if (suffixCandidate) {
    addUniqueCandidate(results, seenPhonemes, {
      word: upper,
      phonemes: suffixCandidate.phonemes,
      source: CANDIDATE_SOURCES.RULE,
      generatedBy: 'rule-v1-suffix',
      confidence: 0.45,
    });
  }

  const vowelCandidate = convertVowelFamilies(upper);
  if (vowelCandidate) {
    addUniqueCandidate(results, seenPhonemes, {
      word: upper,
      phonemes: vowelCandidate.phonemes,
      source: CANDIDATE_SOURCES.RULE,
      generatedBy: 'rule-v1-vowel-family',
      confidence: 0.4,
    });
  }

  return results.slice(0, MAX_CANDIDATES);
}

function addUniqueCandidate(results, seen, candidate) {
  const key = candidate.phonemes.join(' ');
  if (seen.has(key)) return;
  seen.add(key);

  const id = generateCandidateId(candidate.word, candidate.phonemes, candidate.source, results.length);
  results.push({
    id,
    word: candidate.word,
    phonemes: candidate.phonemes,
    source: candidate.source,
    generatedBy: candidate.generatedBy,
    confidence: candidate.confidence || 0,
  });
}

function convertWordToPhonemes(word) {
  const phonemes = [];
  let i = 0;
  while (i < word.length) {
    const char = word[i];
    const nextChar = word[i + 1];

    const digraphResult = applyDigraph(char, nextChar);
    if (digraphResult) {
      phonemes.push(...digraphResult.phonemes);
      i += digraphResult.advance;
      continue;
    }

    if ('AEIOU'.includes(char)) {
      phonemes.push(VOWEL_MAP[char] || 'AH');
      i += 1;
    } else {
      const mapped = CONSONANT_MAP[char] || char;
      phonemes.push(...(Array.isArray(mapped) ? mapped : [mapped]));
      i += 1;
    }
  }

  return { phonemes, confidence: 0.6 };
}

function convertWithDigraphs(word) {
  const phonemes = [];
  let i = 0;
  while (i < word.length) {
    const char = word[i];
    const nextChar = word[i + 1];

    const digraphResult = applyDigraph(char, nextChar);
    if (digraphResult) {
      phonemes.push(...digraphResult.phonemes);
      i += digraphResult.advance;
      continue;
    }

    if ('AEIOU'.includes(char)) {
      phonemes.push(VOWEL_MAP[char] || 'AH');
      i += 1;
    } else {
      const mapped = CONSONANT_MAP[char] || char;
      phonemes.push(...(Array.isArray(mapped) ? mapped : [mapped]));
      i += 1;
    }
  }
  return { phonemes, confidence: 0.55 };
}

function convertWithMagicE(word) {
  const upper = word.toUpperCase();
  if (!upper.endsWith('E')) return null;

  const lastVowel = upper.slice(0, -1).match(/[AEIOU](?=[^AEIOU]+E$)/)?.[0];
  if (!lastVowel) return null;

  const magE = MAGIC_MAP[lastVowel];
  if (!magE) return null;

  const stem = upper.slice(0, upper.lastIndexOf(lastVowel));
  const phonemes = [];

  for (const char of stem) {
    if ('AEIOU'.includes(char)) {
      phonemes.push(VOWEL_MAP[char] || 'AH');
    } else {
      const mapped = CONSONANT_MAP[char] || char;
      phonemes.push(...(Array.isArray(mapped) ? mapped : [mapped]));
    }
  }

  phonemes.push(magE + '1');
  return { phonemes, confidence: 0.5 };
}

function convertWithSuffixRules(word) {
  let matchedSuffix = null;
  let suffixPhonemes = null;

  for (const rule of SUFFIX_RULES) {
    if (word.endsWith(rule.suffix)) {
      matchedSuffix = rule.suffix;
      suffixPhonemes = rule.phonemes;
      break;
    }
  }

  if (!matchedSuffix) return null;

  const stem = word.slice(0, -matchedSuffix.length);
  const phonemes = [];

  for (const char of stem) {
    if ('AEIOU'.includes(char)) {
      phonemes.push(VOWEL_MAP[char] || 'AH');
    } else {
      const mapped = CONSONANT_MAP[char] || char;
      phonemes.push(...(Array.isArray(mapped) ? mapped : [mapped]));
    }
  }

  phonemes.push(...suffixPhonemes);
  return { phonemes, confidence: 0.45 };
}

function convertVowelFamilies(word) {
  const transformed = [];
  for (const char of word) {
    const mapped = VOWEL_MAP[char] || CONSONANT_MAP[char] || char;
    transformed.push(...(Array.isArray(mapped) ? mapped : [mapped]));
  }
  return { phonemes: transformed, confidence: 0.4 };
}

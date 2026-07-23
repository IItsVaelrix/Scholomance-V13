/**
 * PHONOTOPOGRAPHY ENGINE — TurboQuant Dimensional Topography Word Map
 *
 * Replaces the character-level mock in vector.utils.js with real phoneme-level
 * analysis. Uses the CMU Pronouncing Dictionary (via CmuPhonemeEngine) and a
 * deterministic heuristic G2P fallback to resolve ARPAbet phoneme sequences,
 * then maps them into a 256-dimensional topographic vector space where:
 *
 *   Band 0 (dims   0– 63): Phoneme unigram distribution
 *   Band 1 (dims  64–127): Phoneme bigram transitions (sonority-weighted)
 *   Band 2 (dims 128–191): Stress & syllable topology
 *   Band 3 (dims 192–255): Rhyme-domain signature
 *
 * Key property: "knight" and "night" produce IDENTICAL vectors (same phonemes
 * /N AY T/), while "through" /TH R UW/ and "tough" /T AH F/ produce DISTANT
 * vectors despite similar spelling.
 *
 * Pure, deterministic, zero I/O. PDR §18 Core-law compliant.
 */

import {
  ARPABET_VOWELS,
  ARPABET_CONSONANTS,
  PHONOLOGICAL_FEATURES_V1,
  SONORITY_HIERARCHY,
} from '../phonology/phoneme.constants.js';
import { CmuPhonemeEngine } from '../phonology/cmu.phoneme.engine.js';
import { quantizeVectorJS, estimateInnerProduct } from '../quantization/turboquant.js';

// ── Canonical ARPAbet inventory (41 phonemes) ────────────────────────────────

const ARPABET_INVENTORY = Object.freeze([
  // Vowels (17)
  'AA', 'AE', 'AH', 'AO', 'AW', 'AX', 'AY', 'EH', 'ER', 'EY',
  'IH', 'IY', 'OW', 'OY', 'UH', 'UW', 'UR',
  // Consonants (24)
  'B', 'CH', 'D', 'DH', 'F', 'G', 'HH', 'JH', 'K', 'L',
  'M', 'N', 'NG', 'P', 'R', 'S', 'SH', 'T', 'TH', 'V',
  'W', 'Y', 'Z', 'ZH',
]);

const PHONEME_INDEX = new Map(ARPABET_INVENTORY.map((p, i) => [p, i]));

// ── Deterministic heuristic G2P fallback ─────────────────────────────────────
// Used when CmuPhonemeEngine is not initialized (browser, cold start, OOV).
// Not perfect — just deterministic and reasonable.

const DIGRAPH_RULES = Object.freeze([
  ['tion', ['SH', 'AH0', 'N']],
  ['sion', ['ZH', 'AH0', 'N']],
  ['tious', ['SH', 'AH0', 'S']],
  ['cious', ['SH', 'AH0', 'S']],
  ['ight', ['AY1', 'T']],
  ['ough', ['AH1', 'F']],
  ['augh', ['AO1', 'T']],
  ['eigh', ['EY1']],
  ['ough', ['OW1']],
  ['th', ['TH']],
  ['sh', ['SH']],
  ['ch', ['CH']],
  ['ph', ['F']],
  ['wh', ['W']],
  ['ck', ['K']],
  ['ng', ['NG']],
  ['qu', ['K', 'W']],
  ['gh', []],  // silent in most positions
  ['kn', ['N']],
  ['wr', ['R']],
  ['mb', ['M']],
]);

const VOWEL_DIGRAPH_RULES = Object.freeze([
  ['ee', ['IY1']],
  ['ea', ['IY1']],
  ['oo', ['UW1']],
  ['ou', ['AW1']],
  ['ow', ['AW1']],
  ['oi', ['OY1']],
  ['oy', ['OY1']],
  ['ai', ['EY1']],
  ['ay', ['EY1']],
  ['au', ['AO1']],
  ['aw', ['AO1']],
  ['ei', ['EY1']],
  ['ey', ['IY1']],
  ['ie', ['AY1']],
  ['ue', ['UW1']],
  ['ew', ['UW1']],
  ['ar', ['AA1', 'R']],
  ['er', ['ER1']],
  ['ir', ['ER1']],
  ['or', ['AO1', 'R']],
  ['ur', ['ER1']],
]);

const SINGLE_LETTER_MAP = Object.freeze({
  a: ['AE1'], b: ['B'], c: ['K'], d: ['D'], e: ['EH1'],
  f: ['F'], g: ['G'], h: ['HH'], i: ['IH1'], j: ['JH'],
  k: ['K'], l: ['L'], m: ['M'], n: ['N'], o: ['AA1'],
  p: ['P'], q: ['K'], r: ['R'], s: ['S'], t: ['T'],
  u: ['AH1'], v: ['V'], w: ['W'], x: ['K', 'S'],
  y: ['Y'], z: ['Z'],
});

/**
 * Deterministic heuristic G2P for a single word.
 * Returns an array of ARPAbet phonemes (with stress markers).
 */
export function heuristicG2P(word) {
  const lower = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!lower) return [];

  const phonemes = [];
  let i = 0;

  while (i < lower.length) {
    let matched = false;

    // Try consonant digraphs (longest first)
    for (const [pattern, phones] of DIGRAPH_RULES) {
      if (lower.startsWith(pattern, i) && phones.length > 0) {
        phonemes.push(...phones);
        i += pattern.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Try vowel digraphs
    for (const [pattern, phones] of VOWEL_DIGRAPH_RULES) {
      if (lower.startsWith(pattern, i)) {
        phonemes.push(...phones);
        i += pattern.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Silent gh
    if (lower.startsWith('gh', i)) {
      i += 2;
      continue;
    }

    // Single letter
    const letter = lower[i];
    const phones = SINGLE_LETTER_MAP[letter];
    if (phones) {
      phonemes.push(...phones);
    }
    i += 1;
  }

  return phonemes;
}

// ── Phoneme resolution ───────────────────────────────────────────────────────

/**
 * Resolve a word to its ARPAbet phoneme sequence.
 * Tries CmuPhonemeEngine first (sync, if initialized), falls back to heuristic.
 *
 * @param {string} word
 * @returns {string[]} ARPAbet phonemes with stress markers
 */
export function resolvePhonemes(word) {
  const upper = String(word || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (!upper) return [];

  // Try CMU dictionary (sync, works if already initialized)
  if (CmuPhonemeEngine._available) {
    const analysis = CmuPhonemeEngine.analyzeWord(upper);
    if (analysis && Array.isArray(analysis.phonemes) && analysis.phonemes.length > 0) {
      return analysis.phonemes;
    }
  }

  // Deterministic heuristic fallback
  return heuristicG2P(upper);
}

/**
 * Resolve all words in a text to phoneme sequences.
 *
 * @param {string} text
 * @returns {{ word: string, phonemes: string[] }[]}
 */
export function resolveTextPhonemes(text) {
  const words = String(text || '').toLowerCase().match(/[a-z']+/g) || [];
  return words.map((word) => ({
    word,
    phonemes: resolvePhonemes(word),
  }));
}

// ── Phoneme n-gram extraction ────────────────────────────────────────────────

/**
 * Strip stress markers from a phoneme.
 * @param {string} phoneme
 * @returns {string}
 */
export function stripStress(phoneme) {
  return String(phoneme || '').replace(/[0-9]/g, '');
}

/**
 * Extract phoneme unigrams from a phoneme sequence.
 * @param {string[]} phonemes
 * @returns {Map<string, number>}
 */
export function extractUnigrams(phonemes) {
  const counts = new Map();
  for (const p of phonemes) {
    const base = stripStress(p);
    counts.set(base, (counts.get(base) || 0) + 1);
  }
  return counts;
}

/**
 * Extract phoneme bigrams from a phoneme sequence.
 * @param {string[]} phonemes
 * @returns {Map<string, number>}
 */
export function extractBigrams(phonemes) {
  const counts = new Map();
  for (let i = 0; i < phonemes.length - 1; i++) {
    const a = stripStress(phonemes[i]);
    const b = stripStress(phonemes[i + 1]);
    const key = `${a}+${b}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/**
 * Extract phoneme trigrams from a phoneme sequence.
 * @param {string[]} phonemes
 * @returns {Map<string, number>}
 */
export function extractTrigrams(phonemes) {
  const counts = new Map();
  for (let i = 0; i < phonemes.length - 2; i++) {
    const a = stripStress(phonemes[i]);
    const b = stripStress(phonemes[i + 1]);
    const c = stripStress(phonemes[i + 2]);
    const key = `${a}+${b}+${c}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

// ── Sonority helpers ─────────────────────────────────────────────────────────

function getSonority(phoneme) {
  return SONORITY_HIERARCHY[stripStress(phoneme)] || 0;
}

function isVowel(phoneme) {
  return ARPABET_VOWELS.has(stripStress(phoneme));
}

function getStress(phoneme) {
  const match = String(phoneme || '').match(/[0-9]/);
  return match ? parseInt(match[0], 10) : 0;
}

// ── Deterministic hash for n-gram keys ───────────────────────────────────────

function fnv1aHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

// ── The 256-dim topographic vector generator ─────────────────────────────────

/**
 * Generate a 256-dimensional phonotopographic vector from pre-resolved
 * phoneme sequences. This is the pure core function — no I/O, no dictionary
 * lookups. Accepts an array of { word, phonemes } objects.
 *
 * @param {{ word: string, phonemes: string[] }[]} wordPhonemes
 * @param {number} [dim=256]
 * @returns {Float32Array}
 */
export function generatePhonotopographicVectorFromPhonemes(wordPhonemes, dim = 256) {
  const vec = new Float32Array(dim);
  if (!Array.isArray(wordPhonemes) || wordPhonemes.length === 0) return vec;

  // Flatten all phonemes across all words
  const allPhonemes = [];
  for (const entry of wordPhonemes) {
    if (Array.isArray(entry.phonemes)) {
      allPhonemes.push(...entry.phonemes);
    }
  }
  if (allPhonemes.length === 0) return vec;

  // ── Band 0 (dims 0–63): Phoneme unigram distribution ──────────────────
  // Each of the 41 ARPAbet phonemes maps to a unique dimension.
  // Weighted by phonological feature salience.
  const unigrams = extractUnigrams(allPhonemes);
  for (const [phoneme, count] of unigrams) {
    const idx = PHONEME_INDEX.get(phoneme);
    if (idx === undefined) continue;
    // Map 41 phonemes into 64 dims with feature-weighted activation
    const dimIdx = idx % 64;
    const features = PHONOLOGICAL_FEATURES_V1[phoneme];
    // Weight by feature complexity: more distinctive phonemes get higher weight
    const featureWeight = features
      ? 1.0 + (features.sibilance || 0) * 0.5 + (features.nasality || 0) * 0.3
      : 1.0;
    vec[dimIdx] += count * featureWeight;
  }

  // ── Band 1 (dims 64–127): Phoneme bigram transitions ──────────────────
  // Hash each bigram pair into the 64-dim band.
  // Weight by sonority transition: rising (onset-like) vs falling (coda-like).
  const bigrams = extractBigrams(allPhonemes);
  for (const [key, count] of bigrams) {
    const [a, b] = key.split('+');
    const hash = fnv1aHash(key) % 64;
    const sonA = SONORITY_HIERARCHY[a] || 0;
    const sonB = SONORITY_HIERARCHY[b] || 0;
    // Sonority transition weight: rising transitions (onsets) get positive
    // weight, falling transitions (codas) get different activation
    const transition = sonB - sonA;
    const weight = count * (1.0 + Math.abs(transition) * 0.1);
    vec[64 + hash] += weight;
  }

  // ── Band 2 (dims 128–191): Stress & syllable topology ─────────────────
  // Captures rhythmic shape: syllable count, stress pattern, V/C ratio.
  let totalSyllables = 0;
  let stressedSyllables = 0;
  let vowelCount = 0;
  let consonantCount = 0;

  for (const entry of wordPhonemes) {
    if (!Array.isArray(entry.phonemes)) continue;
    const phonemes = entry.phonemes;

    // Count vowels and consonants
    for (const p of phonemes) {
      if (isVowel(p)) {
        vowelCount++;
        const stress = getStress(p);
        if (stress === 1) stressedSyllables++;
        totalSyllables++;
      } else {
        consonantCount++;
      }
    }

    // Stress pattern encoding: each stressed vowel activates a dim
    // based on its position in the word
    let vowelIdx = 0;
    for (const p of phonemes) {
      if (isVowel(p)) {
        const stress = getStress(p);
        if (stress > 0) {
          const stressDim = 128 + ((vowelIdx * 7 + stress * 13) % 64);
          vec[stressDim] += stress === 1 ? 3.0 : 1.5;
        }
        vowelIdx++;
      }
    }
  }

  // Global rhythmic features
  if (totalSyllables > 0) {
    vec[128] += Math.min(totalSyllables, 20) * 0.5;  // syllable count
    vec[129] += (stressedSyllables / totalSyllables) * 5.0;  // stress density
    vec[130] += (vowelCount / (vowelCount + consonantCount + 1)) * 5.0;  // V/C ratio
    vec[131] += Math.min(wordPhonemes.length, 15) * 0.3;  // word count
  }

  // ── Band 3 (dims 192–255): Rhyme-domain signature ─────────────────────
  // Captures the final vowel + coda pattern of each word.
  for (const entry of wordPhonemes) {
    if (!Array.isArray(entry.phonemes) || entry.phonemes.length === 0) continue;
    const phonemes = entry.phonemes;

    // Find last vowel
    let lastVowelIdx = -1;
    for (let i = phonemes.length - 1; i >= 0; i--) {
      if (isVowel(phonemes[i])) {
        lastVowelIdx = i;
        break;
      }
    }
    if (lastVowelIdx < 0) continue;

    // Final vowel family
    const lastVowel = stripStress(phonemes[lastVowelIdx]);
    const vowelIdx = PHONEME_INDEX.get(lastVowel);
    if (vowelIdx !== undefined) {
      vec[192 + (vowelIdx % 32)] += 2.0;
    }

    // Coda (consonants after last vowel)
    const coda = phonemes.slice(lastVowelIdx + 1).map(stripStress);
    if (coda.length > 0) {
      const codaKey = coda.join('+');
      const codaHash = fnv1aHash(codaKey) % 32;
      vec[224 + codaHash] += 2.0;
    } else {
      // Open syllable (no coda)
      vec[224] += 1.0;
    }

    // Onset complexity (consonants before first vowel)
    let firstVowelIdx = -1;
    for (let i = 0; i < phonemes.length; i++) {
      if (isVowel(phonemes[i])) {
        firstVowelIdx = i;
        break;
      }
    }
    if (firstVowelIdx > 0) {
      const onsetSize = Math.min(firstVowelIdx, 4);
      vec[192 + 32 + onsetSize] += 1.0;
    }
  }

  return vec;
}

/**
 * Generate a 256-dimensional phonotopographic vector from raw text.
 * Resolves phonemes via CmuPhonemeEngine (if available) or heuristic G2P.
 *
 * This is the drop-in replacement for generatePhonosemanticVector.
 *
 * @param {string} input - Raw text
 * @param {number} [dim=256]
 * @returns {Float32Array}
 */
export function generatePhonotopographicVector(input, dim = 256) {
  const text = String(input || '').toLowerCase().trim();
  if (!text) return new Float32Array(dim);

  const wordPhonemes = resolveTextPhonemes(text);
  return generatePhonotopographicVectorFromPhonemes(wordPhonemes, dim);
}

// ── TurboQuant signature pipeline ────────────────────────────────────────────

export const PHONOTOPOGRAPHIC_EMBEDDING = Object.freeze({
  kind: 'phonotopographic',
  version: 'tq-phoneme-v1',
  dimensions: 256,
  seed: 42,
  bands: Object.freeze({
    unigram: Object.freeze({ start: 0, end: 63, label: 'phoneme-unigram' }),
    bigram: Object.freeze({ start: 64, end: 127, label: 'phoneme-bigram-transition' }),
    topology: Object.freeze({ start: 128, end: 191, label: 'stress-syllable-topology' }),
    rhyme: Object.freeze({ start: 192, end: 255, label: 'rhyme-domain-signature' }),
  }),
});

/**
 * Create a TurboQuant-compressed phonotopographic signature from text.
 *
 * @param {string} text
 * @returns {{ kind: string, version: string, dimensions: number, data: Uint8Array, norm: number }}
 */
export function createTopographicSignature(text) {
  const vector = generatePhonotopographicVector(text, PHONOTOPOGRAPHIC_EMBEDDING.dimensions);
  const { data, norm } = quantizeVectorJS(vector, PHONOTOPOGRAPHIC_EMBEDDING.seed);
  return Object.freeze({
    ...PHONOTOPOGRAPHIC_EMBEDDING,
    data,
    norm,
  });
}

/**
 * Compare two phonotopographic signatures via TurboQuant inner-product estimation.
 *
 * @param {{ data: Uint8Array, kind: string, version: string, dimensions: number }} sig1
 * @param {{ data: Uint8Array, kind: string, version: string, dimensions: number }} sig2
 * @returns {{ cosine: number, topographicScore: number } | { degradation: object }}
 */
export function compareTopographicSignatures(sig1, sig2) {
  const compatible = sig1 && sig2
    && sig1.kind === sig2.kind
    && sig1.version === sig2.version
    && sig1.dimensions === sig2.dimensions
    && sig1.data?.length === sig2.data?.length;

  if (!compatible) {
    return Object.freeze({
      degradation: Object.freeze({
        code: 'embedding_metadata_mismatch',
        channel: 'phonotopography',
        reason: 'Signatures do not share kind, version, and dimensions.',
      }),
    });
  }

  const cosine = estimateInnerProduct(sig1.data, sig2.data, 1, 1);
  return Object.freeze({
    cosine,
    topographicScore: Math.max(0, Math.min(1, (cosine + 1) / 2)),
  });
}

/**
 * Compute the phonotopographic distance between two raw texts.
 * Returns a score in [0, 1] where 1 = identical sound, 0 = maximally distant.
 *
 * @param {string} text1
 * @param {string} text2
 * @returns {number}
 */
export function phonotopographicSimilarity(text1, text2) {
  const sig1 = createTopographicSignature(text1);
  const sig2 = createTopographicSignature(text2);
  const result = compareTopographicSignatures(sig1, sig2);
  return result.topographicScore ?? 0;
}

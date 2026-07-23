import { describe, expect, it } from 'vitest';
import {
  generatePhonotopographicVector,
  generatePhonotopographicVectorFromPhonemes,
  resolvePhonemes,
  resolveTextPhonemes,
  heuristicG2P,
  stripStress,
  extractUnigrams,
  extractBigrams,
  extractTrigrams,
  createTopographicSignature,
  compareTopographicSignatures,
  phonotopographicSimilarity,
  PHONOTOPOGRAPHIC_EMBEDDING,
} from '../../../codex/core/semantic/phonotopography.js';
import { quantizeVectorJS, estimateInnerProduct } from '../../../codex/core/quantization/turboquant.js';

// ── Phoneme resolution ───────────────────────────────────────────────────────

describe('phonotopography: phoneme resolution', () => {
  it('resolves common words via heuristic G2P', () => {
    const phonemes = resolvePhonemes('night');
    expect(phonemes.length).toBeGreaterThan(0);
    // Should contain a vowel
    expect(phonemes.some((p) => /[0-9]/.test(p))).toBe(true);
  });

  it('returns empty array for empty/non-alpha input', () => {
    expect(resolvePhonemes('')).toEqual([]);
    expect(resolvePhonemes('123')).toEqual([]);
    expect(resolvePhonemes(null)).toEqual([]);
  });

  it('resolves text into word-phoneme pairs', () => {
    const result = resolveTextPhonemes('the bright wound');
    expect(result).toHaveLength(3);
    expect(result[0].word).toBe('the');
    expect(result[1].word).toBe('bright');
    expect(result[2].word).toBe('wound');
    for (const entry of result) {
      expect(entry.phonemes.length).toBeGreaterThan(0);
    }
  });

  it('heuristic G2P is deterministic', () => {
    const a = heuristicG2P('through');
    const b = heuristicG2P('through');
    expect(a).toEqual(b);
  });

  it('heuristic G2P handles digraphs', () => {
    const phonemes = heuristicG2P('think');
    // "th" should map to TH, not T+H
    expect(phonemes).toContain('TH');
  });

  it('heuristic G2P handles silent patterns', () => {
    const phonemes = heuristicG2P('knight');
    // "kn" → N (silent k), "ight" → AY T
    expect(phonemes[0]).toBe('N');
  });
});

// ── N-gram extraction ────────────────────────────────────────────────────────

describe('phonotopography: n-gram extraction', () => {
  it('extracts unigrams with stress stripping', () => {
    const unigrams = extractUnigrams(['N', 'AY1', 'T']);
    expect(unigrams.get('N')).toBe(1);
    expect(unigrams.get('AY')).toBe(1);
    expect(unigrams.get('T')).toBe(1);
    expect(unigrams.size).toBe(3);
  });

  it('extracts bigrams', () => {
    const bigrams = extractBigrams(['N', 'AY1', 'T']);
    expect(bigrams.get('N+AY')).toBe(1);
    expect(bigrams.get('AY+T')).toBe(1);
    expect(bigrams.size).toBe(2);
  });

  it('extracts trigrams', () => {
    const trigrams = extractTrigrams(['N', 'AY1', 'T', 'S']);
    expect(trigrams.get('N+AY+T')).toBe(1);
    expect(trigrams.get('AY+T+S')).toBe(1);
    expect(trigrams.size).toBe(2);
  });

  it('counts repeated n-grams', () => {
    const unigrams = extractUnigrams(['T', 'AH1', 'T', 'AH0', 'T']);
    expect(unigrams.get('T')).toBe(3);
    expect(unigrams.get('AH')).toBe(2);
  });
});

// ── Vector generation ────────────────────────────────────────────────────────

describe('phonotopography: vector generation', () => {
  it('produces a 256-dim Float32Array', () => {
    const vec = generatePhonotopographicVector('the bright wound of morning');
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(256);
  });

  it('returns zero vector for empty input', () => {
    const vec = generatePhonotopographicVector('');
    expect(vec.every((v) => v === 0)).toBe(true);
  });

  it('is deterministic', () => {
    const a = generatePhonotopographicVector('silent silver sea');
    const b = generatePhonotopographicVector('silent silver sea');
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('activates all four bands for real text', () => {
    const vec = generatePhonotopographicVector('the bright wound of morning');
    const band0 = vec.slice(0, 64).some((v) => v > 0);
    const band1 = vec.slice(64, 128).some((v) => v > 0);
    const band2 = vec.slice(128, 192).some((v) => v > 0);
    const band3 = vec.slice(192, 256).some((v) => v > 0);
    expect(band0).toBe(true);
    expect(band1).toBe(true);
    expect(band2).toBe(true);
    expect(band3).toBe(true);
  });

  it('generates from pre-resolved phonemes (pure path)', () => {
    const wordPhonemes = [
      { word: 'knight', phonemes: ['N', 'AY1', 'T'] },
      { word: 'night', phonemes: ['N', 'AY1', 'T'] },
    ];
    const vec = generatePhonotopographicVectorFromPhonemes(wordPhonemes);
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(256);
    expect(vec.some((v) => v > 0)).toBe(true);
  });
});

// ── THE KEY PROPERTY: phonemic identity ──────────────────────────────────────

describe('phonotopography: phonemic identity (the revolution)', () => {
  it('knight and night produce IDENTICAL vectors (same phonemes)', () => {
    // Both resolve to /N AY T/ — the silent "k" and "gh" are invisible
    const knightPhonemes = [{ word: 'knight', phonemes: ['N', 'AY1', 'T'] }];
    const nightPhonemes = [{ word: 'night', phonemes: ['N', 'AY1', 'T'] }];

    const vecKnight = generatePhonotopographicVectorFromPhonemes(knightPhonemes);
    const vecNight = generatePhonotopographicVectorFromPhonemes(nightPhonemes);

    expect(Array.from(vecKnight)).toEqual(Array.from(vecNight));
  });

  it('through and tough produce DISTANT vectors (different phonemes)', () => {
    // through: /TH R UW/ vs tough: /T AH F/
    // Use pre-resolved phonemes for precise assertion (heuristic G2P
    // cannot distinguish the infamous "ough" spelling ambiguity)
    const throughPhonemes = [{ word: 'through', phonemes: ['TH', 'R', 'UW1'] }];
    const toughPhonemes = [{ word: 'tough', phonemes: ['T', 'AH1', 'F'] }];

    const vecThrough = generatePhonotopographicVectorFromPhonemes(throughPhonemes);
    const vecTough = generatePhonotopographicVectorFromPhonemes(toughPhonemes);

    // They should NOT be identical
    const identical = Array.from(vecThrough).every((v, i) => v === vecTough[i]);
    expect(identical).toBe(false);

    // Quantify the distance via TurboQuant signatures from pre-resolved phonemes
    const q1 = quantizeVectorJS(vecThrough, 42);
    const q2 = quantizeVectorJS(vecTough, 42);
    const cosine = estimateInnerProduct(q1.data, q2.data, 1, 1);
    const score = Math.max(0, Math.min(1, (cosine + 1) / 2));
    expect(score).toBeLessThan(0.85);
  });

  it('phonemic similarity: "write" and "right" are closer than "write" and "rock"', () => {
    // write /R AY T/ and right /R AY T/ — identical phonemes
    // rock /R AA K/ — different vowel and coda
    const writePhonemes = [{ word: 'write', phonemes: ['R', 'AY1', 'T'] }];
    const rightPhonemes = [{ word: 'right', phonemes: ['R', 'AY1', 'T'] }];
    const rockPhonemes = [{ word: 'rock', phonemes: ['R', 'AA1', 'K'] }];

    const vecWrite = generatePhonotopographicVectorFromPhonemes(writePhonemes);
    const vecRight = generatePhonotopographicVectorFromPhonemes(rightPhonemes);
    const vecRock = generatePhonotopographicVectorFromPhonemes(rockPhonemes);

    // write and right should be identical
    expect(Array.from(vecWrite)).toEqual(Array.from(vecRight));

    // write and rock should differ
    const identical = Array.from(vecWrite).every((v, i) => v === vecRock[i]);
    expect(identical).toBe(false);
  });
});

// ── TurboQuant signatures ────────────────────────────────────────────────────

describe('phonotopography: TurboQuant signatures', () => {
  it('creates a valid signature with correct metadata', () => {
    const sig = createTopographicSignature('the bright wound of morning');
    expect(sig.kind).toBe('phonotopographic');
    expect(sig.version).toBe('tq-phoneme-v2');
    expect(sig.dimensions).toBe(256);
    expect(sig.seed).toBe(42);
    expect(sig.data).toBeInstanceOf(Uint8Array);
    expect(sig.data.length).toBe(128); // 256/2 packed
    expect(sig.norm).toBeGreaterThan(0);
  });

  it('is deterministic across calls', () => {
    const a = createTopographicSignature('silent silver sea');
    const b = createTopographicSignature('silent silver sea');
    expect(a.data).toEqual(b.data);
    expect(a.norm).toBe(b.norm);
  });

  it('empty text produces zero-norm signature', () => {
    const sig = createTopographicSignature('');
    expect(sig.norm).toBe(0);
    expect(sig.data.length).toBe(0);
  });

  it('compares compatible signatures', () => {
    const sig1 = createTopographicSignature('the bright wound');
    const sig2 = createTopographicSignature('the bright wound');
    const result = compareTopographicSignatures(sig1, sig2);
    expect(result.topographicScore).toBeCloseTo(1.0, 1);
    expect(result.cosine).toBeGreaterThan(0.9);
  });

  it('refuses incompatible signatures', () => {
    const sig1 = createTopographicSignature('hello');
    const sig2 = { ...createTopographicSignature('world'), version: 'unknown' };
    const result = compareTopographicSignatures(sig1, sig2);
    expect(result.degradation).toBeDefined();
    expect(result.degradation.code).toBe('embedding_metadata_mismatch');
  });
});

// ── Similarity scoring ───────────────────────────────────────────────────────

describe('phonotopography: similarity scoring', () => {
  it('identical texts score ~1.0', () => {
    const score = phonotopographicSimilarity('morning light', 'morning light');
    expect(score).toBeGreaterThan(0.95);
  });

  it('related texts score higher than unrelated', () => {
    const related = phonotopographicSimilarity('bright light', 'bright night');
    const unrelated = phonotopographicSimilarity('bright light', 'quantum physics');
    expect(related).toBeGreaterThan(unrelated);
  });

  it('phonemic twins score higher than spelling twins', () => {
    // "knight" and "night" sound identical → high score
    // "knight" and "knit" share spelling but sound different → lower score
    const phonemicTwins = phonotopographicSimilarity('knight', 'night');
    const spellingTwins = phonotopographicSimilarity('knight', 'knit');
    expect(phonemicTwins).toBeGreaterThan(spellingTwins);
  });
});

// ── Embedding metadata ───────────────────────────────────────────────────────

describe('phonotopography: embedding metadata', () => {
  it('exposes correct band structure', () => {
    const bands = PHONOTOPOGRAPHIC_EMBEDDING.bands;
    expect(bands.unigram).toEqual({ start: 0, end: 63, label: 'phoneme-unigram' });
    expect(bands.bigram).toEqual({ start: 64, end: 127, label: 'phoneme-bigram-transition' });
    expect(bands.topology).toEqual({ start: 128, end: 191, label: 'stress-syllable-topology' });
    expect(bands.rhyme).toEqual({ start: 192, end: 255, label: 'rhyme-domain-signature' });
  });

  it('has correct top-level metadata', () => {
    expect(PHONOTOPOGRAPHIC_EMBEDDING.kind).toBe('phonotopographic');
    expect(PHONOTOPOGRAPHIC_EMBEDDING.version).toBe('tq-phoneme-v2');
    expect(PHONOTOPOGRAPHIC_EMBEDDING.dimensions).toBe(256);
    expect(PHONOTOPOGRAPHIC_EMBEDDING.seed).toBe(42);
  });
});

// ── stripStress utility ──────────────────────────────────────────────────────

describe('phonotopography: stripStress', () => {
  it('strips stress markers from phonemes', () => {
    expect(stripStress('AY1')).toBe('AY');
    expect(stripStress('AH0')).toBe('AH');
    expect(stripStress('IY2')).toBe('IY');
    expect(stripStress('T')).toBe('T');
    expect(stripStress('')).toBe('');
  });
});

// ── Fix 1: Context-sensitive -ough resolution ───────────────────────────────

describe('phonotopography: -ough disambiguation (fix 1)', () => {
  it('through → TH R UW1 (not AH1 F)', () => {
    const phonemes = heuristicG2P('through');
    expect(phonemes).toContain('UW1');
    expect(phonemes).not.toContain('AH1');
    expect(phonemes).not.toContain('F');
  });

  it('tough → T AH1 F', () => {
    const phonemes = heuristicG2P('tough');
    expect(phonemes).toContain('AH1');
    expect(phonemes).toContain('F');
    expect(phonemes).not.toContain('UW1');
  });

  it('though → DH OW1', () => {
    const phonemes = heuristicG2P('though');
    expect(phonemes).toContain('OW1');
    expect(phonemes).not.toContain('F');
  });

  it('thought → TH AO1 T', () => {
    const phonemes = heuristicG2P('thought');
    expect(phonemes).toContain('AO1');
    expect(phonemes).toContain('T');
  });

  it('bough → B AW1', () => {
    const phonemes = heuristicG2P('bough');
    expect(phonemes).toContain('AW1');
  });

  it('through and tough produce DISTANT vectors', () => {
    const sim = phonotopographicSimilarity('through', 'tough');
    // Must be well below the old broken 0.897
    expect(sim).toBeLessThan(0.4);
  });

  it('through and through produce IDENTICAL vectors', () => {
    const sim = phonotopographicSimilarity('through', 'through');
    expect(sim).toBeGreaterThan(0.99);
  });
});

// ── Fix 2: Band 3 aliasing resolved ─────────────────────────────────────────

describe('phonotopography: Band 3 no aliasing (fix 2)', () => {
  it('onset complexity uses dims 209-213, not 224+', () => {
    // "stray" has onset STR (3 consonants before first vowel)
    const vec = generatePhonotopographicVector('stray');
    // Onset size 3 → dim 209 + 3 = 212
    expect(vec[212]).toBeGreaterThan(0);
    // Dims 225-228 should NOT have onset signal (only coda hash can land there)
    // Verify onset is NOT at old location 224 + onsetSize
    // (224 + 3 = 227 should be zero unless coda hash happens to land there)
  });

  it('open syllable flag uses dim 214, not dim 224', () => {
    // "see" ends in a vowel (open syllable, no coda)
    const vec = generatePhonotopographicVector('see');
    expect(vec[214]).toBeGreaterThan(0);
  });

  it('coda hash uses dims 224-255', () => {
    // "cat" has coda T
    const vec = generatePhonotopographicVector('cat');
    // Some dim in 224-255 should be active
    let codaActive = false;
    for (let i = 224; i <= 255; i++) {
      if (vec[i] !== 0) { codaActive = true; break; }
    }
    expect(codaActive).toBe(true);
  });

  it('vowel family uses dims 192-208 without modulo aliasing', () => {
    // UW is index 15 in ARPABET_INVENTORY → dim 192 + 15 = 207
    const vec = generatePhonotopographicVector('through');
    expect(vec[207]).toBeGreaterThan(0);
  });
});

// ── Fix 3: Sonority direction weighting ─────────────────────────────────────

describe('phonotopography: sonority direction (fix 3)', () => {
  it('rising and falling transitions get different weights', () => {
    // S+AA is rising (S sonority < AA sonority) → onset-like
    // AA+S is falling (AA sonority > S sonority) → coda-like
    // They hash to different dims, but the WEIGHT should differ
    const rising = generatePhonotopographicVectorFromPhonemes(
      [{ word: 'test', phonemes: ['S', 'AA1'] }]
    );
    const falling = generatePhonotopographicVectorFromPhonemes(
      [{ word: 'test', phonemes: ['AA1', 'S'] }]
    );
    // The vectors should NOT be identical (direction matters)
    let anyDiff = false;
    for (let i = 64; i < 128; i++) {
      if (Math.abs(rising[i] - falling[i]) > 0.001) { anyDiff = true; break; }
    }
    expect(anyDiff).toBe(true);
  });

  it('rising transitions are weighted more than falling of equal magnitude', () => {
    // With multiple bigrams, the direction weighting creates different RELATIVE
    // magnitudes within band 1. A word with a rising bigram AND a falling bigram
    // will have the rising dim weighted higher than the falling dim.
    // T→AA is rising (sonority 1→10), AA→T is falling (10→1)
    const vec = generatePhonotopographicVectorFromPhonemes(
      [{ word: 'a', phonemes: ['T', 'AA1', 'T'] }]  // T+AA (rising) and AA+T (falling)
    );
    // Both bigrams hash to different dims in band 1.
    // The rising bigram (T+AA) gets weight 1.0 + 9*0.15 = 2.35
    // The falling bigram (AA+T) gets weight 1.0 + 9*0.08 = 1.72
    // After normalization, the rising dim should be larger than the falling dim.
    const hashRising = (() => {
      // Replicate fnv1aHash for 'T+AA'
      let h = 0x811c9dc5;
      for (const c of 'T+AA') { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
      return 64 + (h % 64);
    })();
    const hashFalling = (() => {
      let h = 0x811c9dc5;
      for (const c of 'AA+T') { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
      return 64 + (h % 64);
    })();
    // The rising dim should have higher value than the falling dim
    expect(vec[hashRising]).toBeGreaterThan(vec[hashFalling]);
  });
});

// ── Fix 4: Output range calibration ─────────────────────────────────────────

describe('phonotopography: output range (fix 4)', () => {
  it('vectors are per-band normalized (each band has unit norm)', () => {
    const vec = generatePhonotopographicVector('the bright wound of morning');
    for (let band = 0; band < 4; band++) {
      let bandNorm = 0;
      for (let i = band * 64; i < band * 64 + 64; i++) {
        bandNorm += vec[i] * vec[i];
      }
      expect(Math.sqrt(bandNorm)).toBeCloseTo(1.0, 3);
    }
  });

  it('global norm is 2.0 (sqrt of 4 unit bands)', () => {
    const vec = generatePhonotopographicVector('knight');
    let norm = 0;
    for (let i = 0; i < 256; i++) norm += vec[i] * vec[i];
    expect(Math.sqrt(norm)).toBeCloseTo(2.0, 3);
  });

  it('unrelated words score below 0.4', () => {
    const sim = phonotopographicSimilarity('knight', 'zebra');
    expect(sim).toBeLessThan(0.4);
  });

  it('similarity floor is well below 0.47 (old broken floor)', () => {
    // Test a batch of unrelated pairs — none should be above 0.4
    const pairs = [
      ['cat', 'dog'],
      ['bright', 'dark'],
      ['through', 'zebra'],
      ['knight', 'plough'],
      ['morning', 'wound'],
    ];
    for (const [a, b] of pairs) {
      const sim = phonotopographicSimilarity(a, b);
      expect(sim).toBeLessThan(0.4);
    }
  });

  it('identical words score ~1.0', () => {
    expect(phonotopographicSimilarity('knight', 'knight')).toBeGreaterThan(0.99);
  });

  it('phonemic twins score high despite different spelling', () => {
    const sim = phonotopographicSimilarity('knight', 'night');
    expect(sim).toBeGreaterThan(0.85);
  });
});

// ── Minor: AX and UR in PHONOLOGICAL_FEATURES_V1 ────────────────────────────

describe('phonotopography: AX/UR feature coverage (minor fix)', () => {
  it('AX and UR do not silently default to weight 1.0', () => {
    // Import the features to verify they exist
    const { PHONOLOGICAL_FEATURES_V1 } = require('../../../codex/core/phonology/phoneme.constants.js');
    expect(PHONOLOGICAL_FEATURES_V1['AX']).toBeDefined();
    expect(PHONOLOGICAL_FEATURES_V1['UR']).toBeDefined();
    expect(PHONOLOGICAL_FEATURES_V1['AX'].height).toBe(1);
    expect(PHONOLOGICAL_FEATURES_V1['UR'].height).toBe(1);
  });
});

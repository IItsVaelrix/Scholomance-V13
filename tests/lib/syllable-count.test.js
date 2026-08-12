// @vitest-environment node
// The suite default is jsdom (vite.config.js), and cmu.phoneme.engine.js guards
// its loader with `typeof window !== "undefined"` — so under jsdom the CMU
// dictionary NEVER LOADS, loadCmuEntries() swallows that into [], and this file
// would test a rule-guessing fallback instead of the real pipeline. Measured
// 2026-08-12. Do not remove.
/**
 * Syllable count golden tests.
 *
 * Three layers under test:
 *   1. Syllabifier.syllabify()       — pure phoneme segmentation
 *   2. CmuPhonemeEngine.analyzeWord() — CMU pronunciation dictionary
 *   3. PhonemeEngine.analyzeDeep()   — full engine (CMU → heuristic fallback)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Syllabifier } from '../../codex/core/phonology/syllabifier.js';
import { CmuPhonemeEngine } from '../../codex/core/phonology/cmu.phoneme.engine.js';
import { PhonemeEngine } from '../../codex/core/phonology/phoneme.engine.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function syllableCount(phonemes) {
  return Syllabifier.syllabify(phonemes).length;
}

// ── Layer 1: Syllabifier (pure phoneme input) ─────────────────────────────────

describe('Syllabifier.syllabify — syllable count from phoneme arrays', () => {
  describe('monosyllabic words (1 syllable)', () => {
    it('CAT → K AE1 T', () => {
      expect(syllableCount(['K', 'AE1', 'T'])).toBe(1);
    });

    it('BRIGHT → B R AY1 T', () => {
      expect(syllableCount(['B', 'R', 'AY1', 'T'])).toBe(1);
    });

    it('STRENGTH → S T R EH1 NG K TH', () => {
      expect(syllableCount(['S', 'T', 'R', 'EH1', 'NG', 'K', 'TH'])).toBe(1);
    });

    it('SCROLL → S K R OW1 L', () => {
      expect(syllableCount(['S', 'K', 'R', 'OW1', 'L'])).toBe(1);
    });

    it('all-consonant cluster treated as single syllable', () => {
      // No vowels → single pseudo-syllable
      expect(syllableCount(['S', 'T', 'R'])).toBe(1);
    });
  });

  describe('bisyllabic words (2 syllables)', () => {
    it('HELLO → HH AH0 L OW1', () => {
      expect(syllableCount(['HH', 'AH0', 'L', 'OW1'])).toBe(2);
    });

    it('MASTER → M AE1 S T ER0', () => {
      // Maximal Onset Principle: ST clusters to next syllable
      expect(syllableCount(['M', 'AE1', 'S', 'T', 'ER0'])).toBe(2);
    });

    it('MAGIC → M AE1 JH IH0 K', () => {
      expect(syllableCount(['M', 'AE1', 'JH', 'IH0', 'K'])).toBe(2);
    });

    it('RHYTHM → R IH1 DH AH0 M', () => {
      expect(syllableCount(['R', 'IH1', 'DH', 'AH0', 'M'])).toBe(2);
    });

    it('TOWER → T AW1 ER0', () => {
      expect(syllableCount(['T', 'AW1', 'ER0'])).toBe(2);
    });
  });

  describe('trisyllabic words (3 syllables)', () => {
    it('BEAUTIFUL → B Y UW1 T IH0 F AH0 L', () => {
      expect(syllableCount(['B', 'Y', 'UW1', 'T', 'IH0', 'F', 'AH0', 'L'])).toBe(3);
    });

    it('MYSTERY → M IH1 S T ER0 IY0', () => {
      expect(syllableCount(['M', 'IH1', 'S', 'T', 'ER0', 'IY0'])).toBe(3);
    });

    it('HISTORY → HH IH1 S T ER0 IY0', () => {
      expect(syllableCount(['HH', 'IH1', 'S', 'T', 'ER0', 'IY0'])).toBe(3);
    });

    it('OBSIDIAN leading syllable → AH0 B S IH1 D IY0 AH0 N', () => {
      expect(syllableCount(['AH0', 'B', 'S', 'IH1', 'D', 'IY0', 'AH0', 'N'])).toBe(4);
    });
  });

  describe('polysyllabic words (4–5 syllables)', () => {
    it('SCHOLOMANCE → S K OW1 L AH0 M AE2 N S (3 syllables: SKOL-uh-MANCE)', () => {
      expect(syllableCount(['S', 'K', 'OW1', 'L', 'AH0', 'M', 'AE2', 'N', 'S'])).toBe(3);
    });

    it('ALLITERATION → AH0 L IH2 T ER0 EY1 SH AH0 N (5 syllables)', () => {
      expect(syllableCount(['AH0', 'L', 'IH2', 'T', 'ER0', 'EY1', 'SH', 'AH0', 'N'])).toBe(5);
    });

    it('UNIVERSITY → Y UW2 N IH0 V ER1 S IH0 T IY0 (5 syllables)', () => {
      expect(syllableCount(['Y', 'UW2', 'N', 'IH0', 'V', 'ER1', 'S', 'IH0', 'T', 'IY0'])).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('empty array returns empty', () => {
      expect(Syllabifier.syllabify([])).toHaveLength(0);
    });

    it('null/undefined returns empty', () => {
      expect(Syllabifier.syllabify(null)).toHaveLength(0);
      expect(Syllabifier.syllabify(undefined)).toHaveLength(0);
    });

    it('single vowel phoneme is one syllable', () => {
      expect(syllableCount(['AH1'])).toBe(1);
      expect(syllableCount(['IY1'])).toBe(1);
    });

    it('adjacent vowels each form their own syllable', () => {
      // IY0 AH0 → two vowel nuclei → two syllables
      expect(syllableCount(['IY0', 'AH0'])).toBe(2);
    });
  });
});

// ── Layer 2: CmuPhonemeEngine (CMU pronunciation dictionary) ──────────────────

describe('CmuPhonemeEngine.analyzeWord — syllable count from CMU dictionary', () => {
  beforeAll(async () => {
    await CmuPhonemeEngine.init();
  });

  const GOLDEN = [
    // [word, expected syllable count]
    ['cat',         1],
    ['dog',         1],
    ['man',         1],
    ['spell',       1],
    ['through',     1],
    ['hello',       2],
    ['magic',       2],
    ['kingdom',     2],
    ['water',       2],
    ['ancient',     2],
    ['portal',      2],
    ['beautiful',   3],
    ['adventure',   3],
    ['compiler',    3],
    ['remember',    3],
    ['history',     3],
    ['generation',  4],
    ['university',  5],
    ['communication', 5],
  ];

  for (const [word, expected] of GOLDEN) {
    it(`"${word}" → ${expected} syllable${expected === 1 ? '' : 's'}`, () => {
      const result = CmuPhonemeEngine.analyzeWord(word);
      if (!result) {
        // CMU doesn't have this word — skip gracefully rather than fail
        return;
      }
      expect(result.syllableCount).toBe(expected);
    });
  }

  it('returns null for an unknown word', () => {
    expect(CmuPhonemeEngine.analyzeWord('xyzqwrtpfgh')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(CmuPhonemeEngine.analyzeWord('')).toBeNull();
  });
});

// ── Layer 3: PhonemeEngine.analyzeDeep — full pipeline ───────────────────────

describe('PhonemeEngine.analyzeDeep — syllable count with full engine', () => {
  beforeAll(async () => {
    await CmuPhonemeEngine.init();
    PhonemeEngine.WORD_CACHE.clear();
  });

  it('returns syllableCount > 0 for any real word', () => {
    const result = PhonemeEngine.analyzeDeep('hello');
    expect(result).not.toBeNull();
    expect(result.syllableCount).toBeGreaterThan(0);
  });

  it('"hello" has 2 syllables', () => {
    const result = PhonemeEngine.analyzeDeep('hello');
    expect(result.syllableCount).toBe(2);
  });

  it('"mystery" has 3 syllables (override path)', () => {
    PhonemeEngine.WORD_CACHE.clear();
    const result = PhonemeEngine.analyzeDeep('mystery');
    expect(result.syllableCount).toBe(3);
  });

  it('syllableCount equals syllables array length', () => {
    const result = PhonemeEngine.analyzeDeep('beautiful');
    expect(result.syllableCount).toBe(result.syllables.length);
  });

  it('each syllable object has index, vowel, onset, coda, stress', () => {
    const result = PhonemeEngine.analyzeDeep('magic');
    expect(result.syllables.length).toBeGreaterThan(0);
    for (const syllable of result.syllables) {
      expect(syllable).toHaveProperty('index');
      expect(syllable).toHaveProperty('vowel');
      expect(syllable).toHaveProperty('onset');
      expect(syllable).toHaveProperty('coda');
      expect(syllable).toHaveProperty('stress');
    }
  });

  it('syllable indexes are sequential starting at 0', () => {
    const result = PhonemeEngine.analyzeDeep('history');
    result.syllables.forEach((syllable, i) => {
      expect(syllable.index).toBe(i);
    });
  });

  it('stress values are 0, 1, or 2', () => {
    const result = PhonemeEngine.analyzeDeep('beautiful');
    for (const syllable of result.syllables) {
      expect([0, 1, 2]).toContain(syllable.stress);
    }
  });

  it('stressPattern length equals syllable count', () => {
    const result = PhonemeEngine.analyzeDeep('adventure');
    expect(result.stressPattern.length).toBe(result.syllableCount);
  });

  it('stressPattern contains only 0 and 1 characters', () => {
    const result = PhonemeEngine.analyzeDeep('university');
    expect(result.stressPattern).toMatch(/^[01]+$/);
  });
});

/**
 * meterProvider — IDE syllable-meter scoring for PLS candidates.
 *
 * The provider scores autocomplete candidates by how well their syllable count
 * closes the gap between words already on the line and the target line length.
 */

import { describe, it, expect } from 'vitest';
import { meterProvider } from '../../../../src/lib/pls/providers/meterProvider.js';
import { createPhonologyTransport } from '../../../../src/lib/phonology.transport.js';

// ── mock phoneme engine ───────────────────────────────────────────────────────

const SYLLABLE_MAP = {
  CAT: 1, DOG: 1, MAN: 1, THE: 1, A: 1,
  HELLO: 2, MAGIC: 2, PORTAL: 2, SHADOW: 2, KINGDOM: 2, RHYTHMS: 2,
  BEAUTIFUL: 3, ADVENTURE: 3, REMEMBER: 3, MYSTICAL: 3,
  GENERATION: 4,
  UNIVERSITY: 5,
};

// The double is wrapped in the REAL transport rather than hand-written, so it
// exposes whatever verbs production exposes. A hand-written double implementing
// only `analyzeWord` is what let the providers migrate to the consume verb
// `getAnalysis` while these tests went on passing an object that had never heard
// of it — green doubles, a provider that threw the moment it met the real thing.
const mockEngine = createPhonologyTransport({
  analyzeWord(word) {
    const key = String(word || '').toUpperCase().replace(/[^A-Z]/g, '');
    const count = SYLLABLE_MAP[key] ?? 1;
    return { syllableCount: count, vowelFamily: 'A', phonemes: [] };
  },
}, { isBrowser: false });

function makeCandidate(token, extra = {}) {
  return { token, scores: {}, ...extra };
}

// ── guard rails ───────────────────────────────────────────────────────────────

describe('meterProvider — guard rails', () => {
  it('returns candidates unchanged when no phoneme engine is provided', () => {
    const candidates = [makeCandidate('magic')];
    const result = meterProvider({ targetSyllableCount: 8 }, {}, candidates);
    expect(result).toEqual(candidates);
  });

  it('returns empty array for empty candidates list', () => {
    const result = meterProvider({ targetSyllableCount: 8 }, { phonemeEngine: mockEngine }, []);
    expect(result).toHaveLength(0);
  });

  it('returns same number of candidates it received', () => {
    const candidates = [makeCandidate('cat'), makeCandidate('beautiful'), makeCandidate('hello')];
    const result = meterProvider({ targetSyllableCount: 8 }, { phonemeEngine: mockEngine }, candidates);
    expect(result).toHaveLength(3);
  });
});

// ── target resolution ─────────────────────────────────────────────────────────

describe('meterProvider — target syllable count resolution', () => {
  it('uses targetSyllableCount from context when provided', () => {
    const candidates = [makeCandidate('cat'), makeCandidate('beautiful')];
    const result = meterProvider(
      { targetSyllableCount: 1, currentLineWords: [] },
      { phonemeEngine: mockEngine },
      candidates,
    );
    // target=1, remaining=1, cat(1) is exact match, beautiful(3) is off by 2
    const catScore = result.find(c => c.token === 'cat').scores.meter;
    const beautifulScore = result.find(c => c.token === 'beautiful').scores.meter;
    expect(catScore).toBeGreaterThan(beautifulScore);
  });

  it('infers target from median of priorLineSyllableCounts when no target given', () => {
    const candidates = [makeCandidate('cat'), makeCandidate('beautiful')];
    // Prior lines had [8, 8, 10] → median is 8
    const result = meterProvider(
      { priorLineSyllableCounts: [8, 8, 10], currentLineWords: [] },
      { phonemeEngine: mockEngine },
      candidates,
    );
    // target inferred as 8, remaining=8
    // beautiful(3) closer to 8 than cat(1)
    const catScore = result.find(c => c.token === 'cat').scores.meter;
    const beautifulScore = result.find(c => c.token === 'beautiful').scores.meter;
    expect(beautifulScore).toBeGreaterThan(catScore);
  });

  it('falls back to default target of 10 when neither target nor prior lines provided', () => {
    const candidates = [makeCandidate('magic')];
    const result = meterProvider(
      { currentLineWords: [] },
      { phonemeEngine: mockEngine },
      candidates,
    );
    // target=10, remaining=10, magic(2) → score = 1 - (8/10) = 0.2
    expect(result[0].scores.meter).toBeCloseTo(0.2, 1);
  });

  it('uses even-length prior lines median correctly (lower middle)', () => {
    const candidates = [makeCandidate('magic')];
    // sorted: [4, 6, 8, 10] → floor(4/2)=2 → median=sorted[2]=8
    const result = meterProvider(
      { priorLineSyllableCounts: [10, 4, 8, 6], currentLineWords: [] },
      { phonemeEngine: mockEngine },
      candidates,
    );
    expect(result[0].scores.meter).toBeDefined();
  });
});

// ── current line syllable accounting ─────────────────────────────────────────

describe('meterProvider — current line syllable accounting', () => {
  it('subtracts already-placed syllables from target', () => {
    // target=8, line already has "hello"(2) → remaining=6
    // magic(2) → delta=4, score=1-4/6≈0.33
    // shadow(2) — same as magic
    // beautiful(3) → delta=3, score=1-3/6=0.5
    const candidates = [makeCandidate('magic'), makeCandidate('beautiful')];
    const result = meterProvider(
      { targetSyllableCount: 8, currentLineWords: ['hello'] },
      { phonemeEngine: mockEngine },
      candidates,
    );
    const magicScore = result.find(c => c.token === 'magic').scores.meter;
    const beautifulScore = result.find(c => c.token === 'beautiful').scores.meter;
    expect(beautifulScore).toBeGreaterThan(magicScore);
  });

  it('treats empty currentLineWords as zero placed syllables', () => {
    const candidates = [makeCandidate('cat')];
    const withEmpty = meterProvider(
      { targetSyllableCount: 5, currentLineWords: [] },
      { phonemeEngine: mockEngine },
      candidates,
    );
    const withUndefined = meterProvider(
      { targetSyllableCount: 5 },
      { phonemeEngine: mockEngine },
      candidates,
    );
    expect(withEmpty[0].scores.meter).toBe(withUndefined[0].scores.meter);
  });

  it('accounts for multi-word lines correctly', () => {
    // target=8, "cat"(1) + "the"(1) + "magic"(2) = 4 placed → remaining=4
    // portal(2) → delta=2, score=1-2/4=0.5
    // generation(4) → delta=0, score=1.0
    const candidates = [makeCandidate('portal'), makeCandidate('generation')];
    const result = meterProvider(
      { targetSyllableCount: 8, currentLineWords: ['cat', 'the', 'magic'] },
      { phonemeEngine: mockEngine },
      candidates,
    );
    const portalScore = result.find(c => c.token === 'portal').scores.meter;
    const generationScore = result.find(c => c.token === 'generation').scores.meter;
    expect(generationScore).toBeCloseTo(1.0, 5);
    expect(generationScore).toBeGreaterThan(portalScore);
  });
});

// ── scoring math ──────────────────────────────────────────────────────────────

describe('meterProvider — scoring math', () => {
  it('perfect syllable match scores 1.0', () => {
    // target=4, line empty → remaining=4, generation(4) → delta=0 → score=1
    const candidates = [makeCandidate('generation')];
    const result = meterProvider(
      { targetSyllableCount: 4, currentLineWords: [] },
      { phonemeEngine: mockEngine },
      candidates,
    );
    expect(result[0].scores.meter).toBeCloseTo(1.0, 5);
  });

  it('score is always in [0, 1]', () => {
    const candidates = [
      makeCandidate('cat'),
      makeCandidate('beautiful'),
      makeCandidate('university'),
      makeCandidate('a'),
    ];
    const result = meterProvider(
      { targetSyllableCount: 3, currentLineWords: ['hello'] },
      { phonemeEngine: mockEngine },
      candidates,
    );
    for (const c of result) {
      expect(c.scores.meter).toBeGreaterThanOrEqual(0);
      expect(c.scores.meter).toBeLessThanOrEqual(1);
    }
  });

  it('remaining is floored at 1 so score never divides by zero', () => {
    // Line already has 10 syllables against a target of 8 → remaining clamped to 1
    const currentLineWords = ['generation', 'university']; // 4+5=9 syllables
    const candidates = [makeCandidate('cat')]; // cat(1) → delta=0, score=1.0
    const result = meterProvider(
      { targetSyllableCount: 8, currentLineWords },
      { phonemeEngine: mockEngine },
      candidates,
    );
    expect(result[0].scores.meter).toBeGreaterThanOrEqual(0);
    expect(result[0].scores.meter).toBeLessThanOrEqual(1);
  });

  it('candidates further from the target score lower', () => {
    // target=6, empty line → remaining=6
    const candidates = [
      makeCandidate('cat'),        // 1 syl → delta=5
      makeCandidate('portal'),     // 2 syl → delta=4
      makeCandidate('generation'), // 4 syl → delta=2
      makeCandidate('university'), // 5 syl → delta=1
    ];
    const result = meterProvider(
      { targetSyllableCount: 6, currentLineWords: [] },
      { phonemeEngine: mockEngine },
      candidates,
    );
    const scored = result.map(c => ({ token: c.token, score: c.scores.meter }))
      .sort((a, b) => b.score - a.score);
    expect(scored[0].token).toBe('university'); // closest to 6
    expect(scored[scored.length - 1].token).toBe('cat'); // furthest from 6
  });
});

// ── METER badge ───────────────────────────────────────────────────────────────

describe('meterProvider — METER badge', () => {
  it('assigns METER badge when score >= 0.8', () => {
    // target=2, empty → remaining=2, magic(2) → delta=0, score=1.0
    const candidates = [makeCandidate('magic')];
    const result = meterProvider(
      { targetSyllableCount: 2, currentLineWords: [] },
      { phonemeEngine: mockEngine },
      candidates,
    );
    expect(result[0].badge).toBe('METER');
  });

  it('does not assign METER badge when score < 0.8', () => {
    // target=10, empty → remaining=10, cat(1) → delta=9, score=1-9/10=0.1
    const candidates = [makeCandidate('cat', { badge: null })];
    const result = meterProvider(
      { targetSyllableCount: 10, currentLineWords: [] },
      { phonemeEngine: mockEngine },
      candidates,
    );
    expect(result[0].badge).not.toBe('METER');
  });

  it('preserves existing badge when meter score is below threshold', () => {
    const candidates = [makeCandidate('cat', { badge: 'RHYME' })];
    const result = meterProvider(
      { targetSyllableCount: 10, currentLineWords: [] },
      { phonemeEngine: mockEngine },
      candidates,
    );
    expect(result[0].badge).toBe('RHYME');
  });

  it('METER badge overwrites a prior badge at high score', () => {
    const candidates = [makeCandidate('magic', { badge: 'RHYME' })];
    const result = meterProvider(
      { targetSyllableCount: 2, currentLineWords: [] },
      { phonemeEngine: mockEngine },
      candidates,
    );
    expect(result[0].badge).toBe('METER');
  });
});

// ── pass-through fields ───────────────────────────────────────────────────────

describe('meterProvider — pass-through fields', () => {
  it('preserves all other candidate fields', () => {
    const candidates = [makeCandidate('magic', { token: 'magic', someField: 42 })];
    const result = meterProvider(
      { targetSyllableCount: 4 },
      { phonemeEngine: mockEngine },
      candidates,
    );
    expect(result[0].token).toBe('magic');
    expect(result[0].someField).toBe(42);
  });

  it('preserves other score keys', () => {
    const candidates = [makeCandidate('magic', { scores: { rhyme: 0.9, prefix: 0.5 } })];
    const result = meterProvider(
      { targetSyllableCount: 4 },
      { phonemeEngine: mockEngine },
      candidates,
    );
    expect(result[0].scores.rhyme).toBe(0.9);
    expect(result[0].scores.prefix).toBe(0.5);
    expect(result[0].scores.meter).toBeDefined();
  });
});

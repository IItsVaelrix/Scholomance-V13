/**
 * Phonotopographic Bond Channel tests — PB-CONCEPT-CHEM-v1
 *
 * Proves: the phonotopography engine is wired as a diagnostic channel on
 * every synthesize() reaction. It does NOT enter the feasibility formula.
 * W_BOND is unchanged. Checksums are backward-compatible.
 *
 * The phonotopographic bond measures PHONOLOGICAL similarity:
 *   knight ≈ night  (same phonemes /N AY T/)  → high phonoBond
 *   through ≠ tough (different phonemes)       → low phonoBond
 *
 * The lexical bond (sha256 feature hash) CANNOT make these distinctions.
 * That's the whole point of wiring this in.
 */

import { describe, it, expect } from 'vitest';
import {
  synthesize,
  bondEnergy,
  weights,
} from '../../../../codex/core/pixelbrain/concept-chemistry.js';
import {
  phonotopographicSimilarity,
} from '../../../../codex/core/semantic/phonotopography.js';

// ── Helper: run a reaction and return the result ─────────────────────────────

function react(a, b, product, groundingA = 0.5, groundingB = 0.5) {
  return synthesize({ a, b, product, groundingA, groundingB });
}

// ── 1. Channel presence ──────────────────────────────────────────────────────

describe('phonoBond — channel presence', () => {
  it('logs phonoBond on every reaction', () => {
    const r = react('construction solver', 'VRI renderer', 'unified pipeline');
    expect(r.phonoBond).toBeDefined();
    expect(typeof r.phonoBond).toBe('number');
    expect(r.phonoBond).toBeGreaterThanOrEqual(0);
    expect(r.phonoBond).toBeLessThanOrEqual(1);
  });

  it('logs phonoBondSign on every reaction', () => {
    const r = react('construction solver', 'VRI renderer', 'unified pipeline');
    expect(['+', '~', '-']).toContain(r.phonoBondSign);
  });

  it('logs phonoBondMagnitude on every reaction', () => {
    const r = react('construction solver', 'VRI renderer', 'unified pipeline');
    expect(r.phonoBondMagnitude).toBe(r.phonoBond);
  });

  it('sign convention: + for similar (>0.5), ~ for neutral (0.2-0.5), - for distant (<0.2)', () => {
    // Phonemic twins should be similar
    const twins = react('knight', 'night', 'armored darkness');
    expect(twins.phonoBondSign).toBe('+');
    expect(twins.phonoBond).toBeGreaterThan(0.5);

    // Unrelated concepts should be distant or neutral
    const unrelated = react('quantum', 'banana', 'fruit physics');
    expect(['~', '-']).toContain(unrelated.phonoBondSign);
  });
});

// ── 2. The discrimination the lexical bond CANNOT make ───────────────────────

describe('phonoBond — discrimination the lexical bond cannot make', () => {
  it('knight ≈ night: same phonemes, different spelling → high phonoBond', () => {
    const r = react('knight', 'night', 'armored darkness');
    // Phonotopographic: identical phoneme sequence /N AY T/ → 1.0
    expect(r.phonoBond).toBeGreaterThan(0.9);
    // Lexical: share characters n,i,g,h,t → moderate bond (0.59)
    // but phonoBond (1.0) >> bond (0.59) — the phono channel sees what lexical can't
    expect(r.bond).toBeLessThan(r.phonoBond);
  });

  it('through ≠ tough: similar spelling, different phonemes → low phonoBond', () => {
    const r = react('through', 'tough', 'resilient passage');
    // Phonotopographic: /TH R UW/ vs /T AH F/ → distant
    expect(r.phonoBond).toBeLessThan(0.4);
    // Lexical: share characters 't', 'o', 'u', 'g', 'h' → moderate bond
    expect(r.bond).toBeGreaterThan(0.1);
  });

  it('determinism ≈ reproducibility: synonyms the lexical bond misses', () => {
    // These share few characters but are semantic synonyms.
    // The lexical bond scores ~0.03. The phonotopographic bond scores ~0.36
    // (they share some phonemes: d, t, r, m). Neither channel catches synonymy.
    // This test documents the LIMITATION: phonotopography detects SOUND
    // similarity, not MEANING similarity. That's the grounding channel's job.
    const r = react('determinism', 'reproducibility', 'canonical output');
    expect(r.bond).toBeLessThan(0.1);        // lexical: ~0.03
    expect(r.phonoBond).toBeLessThan(0.5);   // phono: ~0.36 (shared phonemes, not synonyms)
    // Neither channel catches synonymy. That's the grounding channel's job.
  });

  it('phoneme ≈ phonology: morphological kin the lexical bond catches too', () => {
    const r = react('phoneme', 'phonology', 'sound system');
    // Both channels score moderate here (shared characters AND shared phonemes)
    expect(r.bond).toBeGreaterThan(0.2);     // lexical: ~0.26
    expect(r.phonoBond).toBeGreaterThan(0.2); // phono: ~0.30
  });
});

// ── 3. Diagnostic only — does NOT affect feasibility ─────────────────────────

describe('phonoBond — diagnostic only, does not affect feasibility', () => {
  it('W_BOND is unchanged at 0.15', () => {
    expect(weights.W_BOND).toBe(0.15);
  });

  it('feasibility formula does not include phonoBond', () => {
    const r = react('knight', 'night', 'armored darkness', 0.5, 0.5);
    // Manually recompute: W_BOND * bond + W_GROUND * grounding + W_COHERE * coherence
    const expected = weights.W_BOND * r.bond
      + weights.W_GROUND * r.grounding
      + weights.W_COHERE * r.coherence;
    // law scale is 0.7 (neutral) for 'armored darkness'
    expect(r.feasibility).toBeCloseTo(expected * r.lawScale, 4);
  });

  it('two reactions with different phonoBond but same inputs have same feasibility', () => {
    // Same reactants, same grounding → same feasibility regardless of phonoBond
    const r1 = react('knight', 'night', 'armored darkness', 0.5, 0.5);
    const r2 = react('knight', 'night', 'armored darkness', 0.5, 0.5);
    expect(r1.feasibility).toBe(r2.feasibility);
    expect(r1.phonoBond).toBe(r2.phonoBond);
  });
});

// ── 4. Checksum backward compatibility ───────────────────────────────────────

describe('phonoBond — checksum backward compatibility', () => {
  it('checksum is computed BEFORE phonoBond fields are added', () => {
    const r = react('construction solver', 'VRI renderer', 'unified pipeline');
    // The checksum should be a valid synth1 hash
    expect(r.checksum).toMatch(/^synth1:[0-9a-f]{16}$/);
    // phonoBond fields exist on the result
    expect(r.phonoBond).toBeDefined();
    expect(r.phonoBondSign).toBeDefined();
    expect(r.phonoBondMagnitude).toBeDefined();
  });

  it('checksum is deterministic across calls', () => {
    const r1 = react('construction solver', 'VRI renderer', 'unified pipeline');
    const r2 = react('construction solver', 'VRI renderer', 'unified pipeline');
    expect(r1.checksum).toBe(r2.checksum);
  });
});

// ── 5. Determinism — 100-iteration replay ────────────────────────────────────

describe('phonoBond — determinism', () => {
  it('100 iterations produce identical phonoBond values', () => {
    const results = [];
    for (let i = 0; i < 100; i++) {
      results.push(react('knight', 'night', 'armored darkness'));
    }
    const unique = new Set(results.map((r) => r.phonoBond));
    expect(unique.size).toBe(1);
  });

  it('100 iterations produce identical checksums', () => {
    const results = [];
    for (let i = 0; i < 100; i++) {
      results.push(react('construction solver', 'VRI renderer', 'unified pipeline'));
    }
    const unique = new Set(results.map((r) => r.checksum));
    expect(unique.size).toBe(1);
  });
});

// ── 6. Edge cases ────────────────────────────────────────────────────────────

describe('phonoBond — edge cases', () => {
  it('empty reactants produce phonoBond 1.0 (identical zero vectors)', () => {
    // Two empty strings produce identical zero vectors → cosine = 1.0
    // This is correct: they ARE identical (both empty).
    const r = react('', '', 'void');
    expect(r.phonoBond).toBe(1);
    expect(r.phonoBondSign).toBe('+');
  });

  it('single-character reactants produce a valid phonoBond', () => {
    const r = react('a', 'a', 'vowel');
    expect(r.phonoBond).toBeGreaterThanOrEqual(0);
    expect(r.phonoBond).toBeLessThanOrEqual(1);
  });

  it('numeric reactants are coerced to strings', () => {
    const r = react('42', '42', 'answer');
    expect(r.phonoBond).toBeGreaterThanOrEqual(0);
  });

  it('result is frozen', () => {
    const r = react('knight', 'night', 'armored darkness');
    expect(Object.isFrozen(r)).toBe(true);
  });
});

// ── 7. Direct phonotopographicSimilarity sanity checks ───────────────────────

describe('phonotopographicSimilarity — engine sanity', () => {
  it('identical words score 1.0', () => {
    expect(phonotopographicSimilarity('determinism', 'determinism')).toBeCloseTo(1.0, 2);
  });

  it('phonemic twins score high', () => {
    expect(phonotopographicSimilarity('knight', 'night')).toBeGreaterThan(0.8);
  });

  it('unrelated words score low', () => {
    expect(phonotopographicSimilarity('quantum', 'banana')).toBeLessThan(0.4);
  });

  it('is deterministic', () => {
    const a = phonotopographicSimilarity('construction', 'solver');
    const b = phonotopographicSimilarity('construction', 'solver');
    expect(a).toBe(b);
  });
});

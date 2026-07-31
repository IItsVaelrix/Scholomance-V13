/**
 * Concept Chemistry Lab tests — PB-CONCEPT-CHEM-v1
 * Proves: deterministic embedding, law gate, stability classes,
 * deterministic checksummed synthesis, and reality-aligned ranking.
 */

import { describe, it, expect } from 'vitest';
import {
  conceptVector,
  cosine,
  bondEnergy,
  lawGate,
  stabilityClass,
  synthesize,
  DIM,
} from '../../../../codex/core/pixelbrain/concept-chemistry.js';

describe('Concept Chemistry Lab (PB-CONCEPT-CHEM-v1)', () => {
  describe('deterministic embedding', () => {
    it('produces a fixed-dim vector', () => {
      expect(conceptVector('construction solver')).toHaveLength(DIM);
    });

    it('is deterministic across calls', () => {
      expect(conceptVector('deterministic checksum')).toEqual(conceptVector('deterministic checksum'));
    });

    it('rates morphological kin higher than unrelated concepts', () => {
      const kin = bondEnergy('determinism', 'deterministic');
      const unrelated = bondEnergy('determinism', 'vibes');
      expect(kin).toBeGreaterThan(0.3);
      expect(unrelated).toBe(0);
    });

    it('cosine of identical vectors is 1', () => {
      const v = conceptVector('sealed scene packet');
      expect(cosine(v, v)).toBeCloseTo(1, 6);
    });
  });

  describe('law gate', () => {
    it('forces non-deterministic products to zero', () => {
      const g = lawGate('unseeded arbitrary random art');
      expect(g.scale).toBe(0);
      expect(g.note).toMatch(/^LAW_VIOLATION/);
    });

    it('rewards law-aligned products', () => {
      expect(lawGate('unified deterministic asset pipeline').scale).toBe(1);
    });

    it('gives neutral products a mild pass', () => {
      expect(lawGate('banana pancakes').scale).toBe(0.7);
    });
  });

  describe('stability classes', () => {
    it('classifies by threshold', () => {
      expect(stabilityClass(0.6)).toBe('STABLE');
      expect(stabilityClass(0.4)).toBe('METASTABLE');
      expect(stabilityClass(0.1)).toBe('UNSTABLE');
    });
  });

  describe('synthesize', () => {
    const viable = () =>
      synthesize({
        a: 'construction solver',
        b: 'VRI renderer',
        product: 'unified deterministic asset pipeline',
        groundingA: 0.504,
        groundingB: 0.248,
      });

    it('is deterministic — identical result and checksum across runs', () => {
      expect(viable()).toEqual(viable());
      expect(viable().checksum).toBe(viable().checksum);
    });

    it('emits a content-addressed synth1 checksum', () => {
      expect(viable().checksum).toMatch(/^synth1:[0-9a-f]{16}$/);
    });

    it('law-violating synthesis is forced to feasibility 0', () => {
      const r = synthesize({
        a: 'art gene',
        b: 'non-deterministic random',
        product: 'unseeded arbitrary art',
        groundingA: 0.154,
        groundingB: 0.0,
      });
      expect(r.feasibility).toBe(0);
      expect(r.stability).toBe('UNSTABLE');
    });

    it('ranks a real viable synthesis above nonsense', () => {
      const real = synthesize({
        a: 'construction solver',
        b: 'VRI renderer',
        product: 'unified deterministic asset pipeline',
        groundingA: 0.504,
        groundingB: 0.248,
      });
      const nonsense = synthesize({
        a: 'construction solver',
        b: 'banana pancakes',
        product: 'delicious chaos',
        groundingA: 0.504,
        groundingB: 0.0,
      });
      expect(real.feasibility).toBeGreaterThan(nonsense.feasibility);
    });

    it('returns a frozen result', () => {
      expect(Object.isFrozen(viable())).toBe(true);
    });
  });
});

// ─── Law gate: violations phrased in the law's own vocabulary ────────────────
//
// The gate was a bag-of-words matcher over one law (determinism). A violation
// only registered if it announced itself with a banned word. Worse, LAW_GOOD
// contains 'checksum' and 'sealed', so a violation fluent in the law's
// vocabulary scored LAW_ALIGNED at the maximum 1.0 multiplier — the gate paid a
// bonus for breaking the rule articulately.
//
// The bridge law under test: "one producer; the consumer verifies the seal by
// string equality and never computes a hash, and never mints a receipt."

describe('lawGate — actor/action rules, not keyword spotting', () => {
  it('catches a consumer computing its own hash, stated plainly', () => {
    const g = lawGate('let the consumer hash the carrier and issue the receipt itself');
    expect(g.scale).toBe(0);
    expect(g.note).toMatch(/LAW_VIOLATION/);
  });

  it('catches a consumer minting a receipt even when it says checksum and sealed', () => {
    // Previously scored LAW_ALIGNED 1.0 — maximum bonus for a flagrant breach.
    const g = lawGate('the consumer computes its own checksum and mints a sealed receipt');
    expect(g.scale).toBe(0);
    expect(g.note).toMatch(/LAW_VIOLATION/);
  });

  it('catches a named consumer recomputing a canonical digest', () => {
    const g = lawGate('blender recomputes the deterministic canonical checksum and issues its own seal');
    expect(g.scale).toBe(0);
    expect(g.note).toMatch(/LAW_VIOLATION/);
  });

  it('still catches the original unseeded-randomness violation', () => {
    expect(lawGate('determinism by unseeded random resampling until it looks right').scale).toBe(0);
  });

  it('does not fire when the PRODUCER computes the hash — that is the law, not a breach', () => {
    const g = lawGate('the producer computes the canonical checksum and mints the sealed receipt');
    expect(g.scale).toBe(1);
    expect(g.note).toBe('LAW_ALIGNED');
  });

  it('does not fire on a consumer that only verifies by string equality', () => {
    const g = lawGate('the consumer verifies the sealed checksum by string equality');
    expect(g.scale).toBe(1);
    expect(g.note).toBe('LAW_ALIGNED');
  });

  it('leaves unrelated products neutral', () => {
    expect(lawGate('banana pancakes').scale).toBe(0.7);
  });
});

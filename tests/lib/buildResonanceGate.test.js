import { describe, it, expect } from 'vitest';
import {
  buildResonanceGate,
  DEFAULT_ASSONANCE_MIN_SCORE,
  DEFAULT_MULTI_MIN_SCORE,
} from '../../src/lib/truesight/buildResonanceGate.js';

const conn = (aCS, bCS, type, score) => ({
  wordA: { charStart: aCS },
  wordB: { charStart: bCS },
  type,
  score,
});

describe('buildResonanceGate', () => {
  it('returns a Map (so .has/.size still work for existing consumers)', () => {
    const gate = buildResonanceGate([]);
    expect(gate).toBeInstanceOf(Map);
    expect(gate.size).toBe(0);
  });

  it('assigns the rhyme tier to a high-scoring non-assonance connection', () => {
    const gate = buildResonanceGate([conn(0, 10, 'perfect', 0.97)]);
    expect(gate.get(0)).toBe('rhyme');
    expect(gate.get(10)).toBe('rhyme');
    expect(gate.has(0)).toBe(true);
  });

  it('assigns the assonance tier to a type:assonance connection (below the rhyme bar)', () => {
    const gate = buildResonanceGate([conn(0, 10, 'assonance', 0.62)]);
    expect(gate.get(0)).toBe('assonance');
    expect(gate.get(10)).toBe('assonance');
  });

  it('does NOT color a sub-threshold non-assonance connection (slant stays grey)', () => {
    const gate = buildResonanceGate([conn(0, 10, 'slant', 0.6)]);
    expect(gate.has(0)).toBe(false);
    expect(gate.has(10)).toBe(false);
  });

  it('does NOT admit phrase_compound to the rhyme tier even above the score bar', () => {
    // Phrase-window connections are not word rhymes; they flood the gate and
    // colored ~68% of the document. They belong to the highlight overlay, not
    // the per-word color gate.
    const gate = buildResonanceGate([conn(0, 10, 'phrase_compound', 0.96)]);
    expect(gate.has(0)).toBe(false);
    expect(gate.has(10)).toBe(false);
  });

  // ── MULTIS ─────────────────────────────────────────────────────────────────
  // Multis arrive SEPARATELY (opts.multis), never inside `connections`. They come
  // from multiRhyme.engine already structurally proven — a chain of >= 2 syllables,
  // stressed anchor, every slant link earned — so they are judged on their own floor,
  // not the word tier's 0.95 trust proxy.
  const multi = (charStartsA, charStartsB, score) => ({
    type: 'multi',
    score,
    a: { charStarts: charStartsA },
    b: { charStarts: charStartsB },
  });

  it('lights EVERY word a multi chain touches, not just the first', () => {
    // "a zero copy" ~ "a hero sloppy" spans three words a side. Lighting only the
    // window start would show a multi-word rhyme as a single word.
    const gate = buildResonanceGate([], { multis: [multi([29, 31, 36], [66, 68, 73], 0.93)] });

    for (const cs of [29, 31, 36, 66, 68, 73]) {
      expect(gate.get(cs)).toBe('rhyme');
    }
    expect(gate.size).toBe(6);
  });

  it('judges a multi on its own floor, not the word tier bar', () => {
    // At the multi floor a chain still colours even though it is far below the
    // word-tier 0.95 trust proxy — mean link strength is ordering, not verdict.
    const gate = buildResonanceGate([], { multis: [multi([0], [10], DEFAULT_MULTI_MIN_SCORE)] });
    expect(gate.get(0)).toBe('rhyme');

    // Just under the multi floor stays grey.
    const justUnder = buildResonanceGate([], {
      multis: [multi([0], [10], DEFAULT_MULTI_MIN_SCORE - 0.01)],
    });
    expect(justUnder.has(0)).toBe(false);

    // ...and a clearly weak chain still does not colour.
    const weak = buildResonanceGate([], { multis: [multi([0], [10], 0.55)] });
    expect(weak.has(0)).toBe(false);
  });

  it('renders no multi when the dictionary authority is unavailable', () => {
    // Same law as the word tier: without authoritative phonemes the chain is built on
    // spelling guesses, and colouring from that is a confident lie.
    const gate = buildResonanceGate([], {
      authorityUnavailable: true,
      multis: [multi([0], [10], 0.99)],
    });
    expect(gate.size).toBe(0);
  });

  it('does NOT admit consonance to the rhyme tier', () => {
    const gate = buildResonanceGate([conn(0, 10, 'consonance', 0.97)]);
    expect(gate.has(0)).toBe(false);
  });

  it('rhyme wins when a charStart is in both a rhyme and an assonance connection', () => {
    // assonance first, then rhyme
    const a = buildResonanceGate([conn(5, 9, 'assonance', 0.62), conn(5, 20, 'perfect', 0.98)]);
    expect(a.get(5)).toBe('rhyme');
    // rhyme first, then assonance — order must not matter
    const b = buildResonanceGate([conn(5, 20, 'perfect', 0.98), conn(5, 9, 'assonance', 0.62)]);
    expect(b.get(5)).toBe('rhyme');
  });

  it('leaves a weak assonance echo (below the floor) grey', () => {
    // Incidental same-vowel pairs below the assonance floor are noise, not
    // resonance — they must not tint. Floor sits on STRESSED_ASSONANCE_SCORE
    // (0.62); anything under that (e.g. 0.611) stays grey.
    const gate = buildResonanceGate([conn(0, 10, 'assonance', 0.55)]);
    expect(gate.has(0)).toBe(false);
    expect(gate.has(10)).toBe(false);

    const justUnder = buildResonanceGate([conn(0, 10, 'assonance', DEFAULT_ASSONANCE_MIN_SCORE - 0.01)]);
    expect(justUnder.has(0)).toBe(false);
  });

  it('respects a custom assonanceMinScore', () => {
    const conns = [conn(0, 10, 'assonance', 0.62)];
    expect(buildResonanceGate(conns, { assonanceMinScore: 0.7 }).has(0)).toBe(false);
    expect(buildResonanceGate(conns, { assonanceMinScore: 0.6 }).get(0)).toBe('assonance');
  });

  it('ignores non-array input and malformed charStarts', () => {
    expect(buildResonanceGate(null).size).toBe(0);
    expect(buildResonanceGate([conn(undefined, NaN, 'assonance', 0.62)]).size).toBe(0);
  });

  // Tuned ~18% denser-gate cut vs the prior (0.60 / 0.70) floors on baked
  // TrueSight artifacts — keep incidental vowel noise and weak multi tails grey.
  it('defaults sit on the denser-gate floors (asso 0.62 / multi 0.87)', () => {
    expect(DEFAULT_ASSONANCE_MIN_SCORE).toBe(0.62);
    expect(DEFAULT_MULTI_MIN_SCORE).toBe(0.87);
  });
});

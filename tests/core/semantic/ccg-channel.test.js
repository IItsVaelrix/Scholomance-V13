import { describe, expect, it } from 'vitest';
import {
  CCG_CHANNEL_CONTRACT,
  ccgChannel,
  deriveGloss,
  glossGenus,
  ofComplementHeads,
} from '../../../codex/core/semantic/ccg-channel.js';

describe('CCG derivation over WordNet glosses', () => {
  it('declares its contract', () => {
    expect(CCG_CHANNEL_CONTRACT).toBe('PB-CCG-CHANNEL-v1');
  });

  describe('genus extraction — the head of the leading NP', () => {
    it('takes the head through a chain of N/N modifiers', () => {
      // a=NP/N  small=N/N  domesticated=N/N  carnivorous=N/N  mammal=N
      expect(glossGenus('a small domesticated carnivorous mammal that has retractile claws'))
        .toBe('mammal');
    });

    it('stops at a relative clause boundary', () => {
      expect(glossGenus('a person who is skilled in a craft')).toBe('person');
    });

    it('stops at a prepositional postmodifier', () => {
      expect(glossGenus('any of numerous fishes of the family cyprinidae')).toBe('any');
    });

    it('handles a bare noun gloss with no determiner', () => {
      expect(glossGenus('customary practice among a people')).toBe('practice');
    });

    it('returns null when the gloss has no nominal head', () => {
      expect(glossGenus('not present')).toBeNull();
    });

    it('is empty-safe', () => {
      expect(glossGenus('')).toBeNull();
      expect(glossGenus('   ')).toBeNull();
    });
  });

  describe('derivation structure', () => {
    it('reports the combinators it used, not just the head', () => {
      const derived = deriveGloss('a small mammal');
      expect(derived.head).toBe('mammal');
      expect(derived.category).toBe('NP');
      expect(derived.combinators).toContain('>'); // forward application
    });

    it('never claims a derivation it did not build', () => {
      const derived = deriveGloss('not present');
      expect(derived.head).toBeNull();
      expect(derived.category).toBeNull();
    });
  });

  describe('of-complement heads — the meronymy seam', () => {
    it('finds the holonym inside an of-PP', () => {
      expect(ofComplementHeads('any of the terminal members of the hand'))
        .toContain('hand');
    });

    it('returns an empty list when there is no of-PP', () => {
      expect(ofComplementHeads('a small domesticated mammal')).toEqual([]);
    });
  });
});

describe('ccgChannel — relation-aware scoring in 0..1', () => {
  const src = (lemma, definition, pos = 'n') => ({ lemma, definition, pos });

  it('scores a true hypernym at the top when it is the genus head', () => {
    const source = src('cat', 'a small domesticated carnivorous mammal with retractile claws');
    const target = src('mammal', 'any warm-blooded vertebrate having the skin covered with hair');
    expect(ccgChannel(source, target, 'hypernym')).toBeGreaterThan(0.9);
  });

  it('scores an unrelated candidate low for hypernym', () => {
    const source = src('cat', 'a small domesticated carnivorous mammal with retractile claws');
    const target = src('democracy', 'a political system in which citizens vote');
    expect(ccgChannel(source, target, 'hypernym')).toBeLessThan(0.5);
  });

  it('rewards a shared genus for similar', () => {
    const source = src('cat', 'a small domesticated carnivorous mammal with claws');
    const target = src('dog', 'a loyal domesticated carnivorous mammal with fur');
    expect(ccgChannel(source, target, 'similar')).toBeGreaterThan(0.8);
  });

  it('rewards the of-complement holonym for mero_part', () => {
    const source = src('finger', 'any of the terminal members of the hand');
    const target = src('hand', 'the terminal part of the human arm');
    expect(ccgChannel(source, target, 'mero_part')).toBeGreaterThan(0.8);
  });

  it('always returns a finite number in 0..1', () => {
    const weird = [
      src('', ''),
      src('x', '   '),
      src('a_b_c', 'of of of of'),
      src('q', 'not'),
    ];
    for (const a of weird) {
      for (const b of weird) {
        for (const relation of ['hypernym', 'antonym', 'mero_part', 'similar']) {
          const value = ccgChannel(a, b, relation);
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('is deterministic', () => {
    const a = src('cat', 'a small domesticated mammal');
    const b = src('mammal', 'a warm-blooded vertebrate');
    const first = ccgChannel(a, b, 'hypernym');
    for (let i = 0; i < 50; i += 1) expect(ccgChannel(a, b, 'hypernym')).toBe(first);
  });

  it('is directional: cat->mammal is not the same as mammal->cat', () => {
    const cat = src('cat', 'a small domesticated carnivorous mammal with retractile claws');
    const mammal = src('mammal', 'any warm-blooded vertebrate having hair');
    expect(ccgChannel(cat, mammal, 'hypernym')).toBeGreaterThan(ccgChannel(mammal, cat, 'hypernym'));
  });
});

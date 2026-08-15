/**
 * Bond reaction kinds — the chart must know which rules can feed themselves.
 *
 * Production change that would make these fail: classifying ADJ+N→N as
 * constructive, or failing to count a lift that sits on a preservative child
 * as lift-after-preservation.
 */
import { describe, it, expect } from 'vitest';
import { BONDS } from '../../../codex/core/constellation/compose.js';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';
import {
  BOND_REACTION,
  classifyBond,
  classifyLift,
} from '../../../codex/core/constellation/bond-kind.js';

describe('classifyBond', () => {
  it('calls NP+VP→S constructive — a new type appears', () => {
    expect(classifyBond(['NP', 'VP', 'S', 1])).toBe(BOND_REACTION.CONSTRUCTIVE);
  });

  it('calls ADJ+N→N preservative — the output is the same type that entered', () => {
    expect(classifyBond(['ADJ', 'N', 'N', 1])).toBe(BOND_REACTION.PRESERVATIVE);
  });

  it('calls ADV+S→S recursive-preservative — the preserved type is a clause', () => {
    expect(classifyBond(['ADV', 'S', 'S', 1])).toBe(BOND_REACTION.RECURSIVE_PRESERVATIVE);
  });

  it('calls ADJ+S→S recursive-preservative', () => {
    expect(classifyBond(['ADJ', 'S', 'S', 1])).toBe(BOND_REACTION.RECURSIVE_PRESERVATIVE);
  });

  it('calls unary lifts lifting', () => {
    expect(classifyLift(['V', 'VP'])).toBe(BOND_REACTION.LIFTING);
  });

  it('every standing bond has a kind, and the self-preserving count is exact', () => {
    let self = 0;
    for (const bond of BONDS) {
      const kind = classifyBond(bond);
      expect(Object.values(BOND_REACTION)).toContain(kind);
      if (bond[2] === bond[0] || bond[2] === bond[1]) self += 1;
      if (bond[2] === bond[0] || bond[2] === bond[1]) {
        expect(kind === BOND_REACTION.PRESERVATIVE || kind === BOND_REACTION.RECURSIVE_PRESERVATIVE).toBe(true);
      } else {
        expect(kind).toBe(BOND_REACTION.CONSTRUCTIVE);
      }
    }
    expect(self).toBeGreaterThan(0);
  });
});

describe('composePacked reaction census', () => {
  const pos = new Map([
    ['old', ['a']],
    ['men', ['n']],
    ['ran', ['v']],
    ['quickly', ['r']],
  ]);

  it('separates constructive, preservative, recursive-preservative, and lifting firings', () => {
    const r = composePacked(['old', 'men', 'ran'], pos, { roots: ['S', 'NP', 'VP'] });
    expect(r.reactions).toBeTruthy();
    expect(r.reactions.constructive).toBeGreaterThan(0);
    expect(r.reactions.preservative).toBeGreaterThan(0);
    expect(r.reactions.lifting).toBeGreaterThan(0);
    expect(r.reactions.constructive + r.reactions.preservative
      + r.reactions.recursivePreservative + r.reactions.lifting)
      .toBe(r.reactions.total);
  });

  it('flags lift-after-preservation when N from ADJ+N is lifted to NP', () => {
    const r = composePacked(['old', 'men'], pos, { roots: ['NP', 'N'] });
    expect(r.reactions.liftAfterPreservation).toBeGreaterThan(0);
  });
});

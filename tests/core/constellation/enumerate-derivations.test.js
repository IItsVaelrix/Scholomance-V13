/**
 * Unpacked enumeration is an explicit, budgeted operation — not the default parser.
 *
 * Production change that would make these fail: leaving compose() as an
 * unbounded tree enumerator with no cap, or making enumerateDerivations a
 * different function from the classic chart.
 */
import { describe, it, expect } from 'vitest';
import {
  compose,
  enumerateDerivations,
} from '../../../codex/core/constellation/compose.js';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';

const pos = new Map([
  ['round', ['n', 'v', 'a', 'r']],
  ['old', ['a']],
  ['men', ['n']],
  ['ran', ['v']],
]);

describe('enumerateDerivations is the named dangerous API', () => {
  it('is the same function as the classic compose export', () => {
    expect(enumerateDerivations).toBe(compose);
  });

  it('is not the production packed parser', () => {
    expect(enumerateDerivations).not.toBe(composePacked);
  });

  it('refuses a token string longer than maxEnumerationDepth before building a forest', () => {
    expect(() => enumerateDerivations(
      ['round', 'round', 'round'],
      pos,
      { maxEnumerationDepth: 2 },
    )).toThrow(/maxEnumerationDepth/);
  });

  it('refuses when the unpacked forest exceeds maxDerivations', () => {
    expect(() => enumerateDerivations(
      ['round', 'round', 'round', 'round'],
      pos,
      { maxDerivations: 20 },
    )).toThrow(/maxDerivations/);
  });

  it('refuses when a single cell exceeds maxForestWidth', () => {
    expect(() => enumerateDerivations(
      ['old', 'men', 'ran'],
      pos,
      { maxForestWidth: 1 },
    )).toThrow(/maxForestWidth/);
  });

  it('still enumerates a short unambiguous clause under generous budgets', () => {
    const r = enumerateDerivations(['old', 'men', 'ran'], pos, {
      maxEnumerationDepth: 8,
      maxDerivations: 10_000,
      maxForestWidth: 10_000,
    });
    expect(r.stable.some((m) => m.type === 'S')).toBe(true);
  });
});

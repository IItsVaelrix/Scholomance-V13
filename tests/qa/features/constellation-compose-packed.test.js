import { describe, it, expect } from 'vitest';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';
import { compose } from '../../../codex/core/constellation/compose.js';

const pos = new Map([
  ['stars', ['n']], ['burn', ['n', 'v']], ['bright', ['a', 'r']],
  ['dog', ['n']], ['chased', ['v']], ['cat', ['n']], ['garden', ['n']],
  ['barn', ['n']], ['road', ['n']], ['river', ['n']],
  ['horse', ['n', 'v']], ['raced', ['v']], ['past', ['a', 'n', 'r']], ['fell', ['a', 'n', 'v']],
  ['old', ['a']], ['man', ['n']], ['men', ['n']],
]);
const T = (s) => s.split(' ');

/** Four stacked PPs. Catalan says 42 parses; packing must not need 42 nodes. */
const STACKED = T('the dog chased the cat through the garden past the barn across the road by the river');

describe('composePacked — the packing invariant', () => {
  it('holds at most one node per (span, category)', () => {
    const r = composePacked(STACKED, pos);
    const seen = new Set();
    for (const m of r.molecules) {
      const key = `${m.from}:${m.to}:${m.type}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  /**
   * The 42 readings are not discarded — they become derivations on one node
   * instead of 42 nodes. If this ever reads 1, packing turned lossy.
   */
  it('keeps the alternatives as derivations rather than as nodes', () => {
    const r = composePacked(STACKED, pos);
    const totalDerivations = r.molecules.reduce((sum, m) => sum + m.derivations.length, 0);
    expect(totalDerivations).toBeGreaterThan(r.molecules.length);
  });

  it('enqueues each (span, category) exactly once', () => {
    const r = composePacked(STACKED, pos);
    expect(r.events).toBe(r.molecules.length);
  });

  /**
   * THE BOUND. n(n+1)/2 spans x 39 categories. Exceeding it means the wake
   * rule is leaking and a cell is re-broadcasting on a category it already had.
   */
  it('stays under the span x category bound', () => {
    const n = STACKED.length;
    const r = composePacked(STACKED, pos);
    expect(r.events).toBeLessThanOrEqual((n * (n + 1)) / 2 * 39);
  });
});

describe('composePacked — agreement with the classic chart', () => {
  const CASES = [
    'stars burn',
    'stars burn bright',
    'the dog chased the cat',
    'the old man fell',
    'old men fell',
    'the horse raced past the barn fell',
    'the dog chased the cat through the garden',
  ];

  it.each(CASES)('finds a spanning S exactly when the classic chart does: "%s"', (text) => {
    const tokens = T(text);
    const classic = compose(tokens, pos);
    const packed = composePacked(tokens, pos);
    expect(packed.stable.length > 0).toBe(classic.stable.length > 0);
  });

  it.each(CASES)('reaches exactly the same spans and categories: "%s"', (text) => {
    const tokens = T(text);
    const key = (m) => `${m.from}:${m.to}:${m.type}`;
    const classic = new Set(compose(tokens, pos).molecules.map(key));
    const packed = new Set(composePacked(tokens, pos).molecules.map(key));
    expect([...packed].sort()).toEqual([...classic].sort());
  });
});

describe('composePacked — edges', () => {
  it('returns empty structures for no tokens', () => {
    const r = composePacked([], pos);
    expect(r).toMatchObject({ atoms: [], molecules: [], spanning: [], stable: [], events: 0 });
  });

  it('returns empty structures with no posMap', () => {
    expect(composePacked(T('stars burn'), null).molecules).toEqual([]);
  });

  it('honours a declared root other than S', () => {
    const r = composePacked(T('the old man'), pos, { roots: ['NP'] });
    expect(r.stable.map((m) => m.type)).toContain('NP');
  });
});

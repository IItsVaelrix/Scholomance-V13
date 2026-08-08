import { describe, it, expect } from 'vitest';
import { composePacked, headsOf, projectAnswers } from '../../../codex/core/constellation/compose-packed.js';
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
   * THE BOUND. n(n+1)/2 spans x 40 categories. Exceeding it means the wake
   * rule is leaking and a cell is re-broadcasting on a category it already had.
   */
  it('stays under the span x category bound', () => {
    const n = STACKED.length;
    const r = composePacked(STACKED, pos);
    expect(r.events).toBeLessThanOrEqual((n * (n + 1)) / 2 * 40);
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

const answerKey = (a) => `${a.subject || ''}|${a.verb || ''}`;

describe('headsOf / projectAnswers', () => {
  it('reads an atom head as its own token', () => {
    const r = composePacked(T('stars burn'), pos);
    const atom = r.atoms.find((a) => a.from === 0 && a.type === 'N');
    expect([...headsOf(atom)]).toEqual(['stars']);
  });

  /**
   * REPRODUCING A BUG ON PURPOSE. `headOf` in compose.js takes parts[0], and
   * `ADJ + N -> N` puts the adjective there, so the head of `the old man` is
   * `old`. That is wrong — the head is `man` — and it understates containment
   * on every prenominal-adjective subject. It is fixed in compose.js, where
   * both charts get it, NOT here: this module's contract is to be equivalent
   * to the classic chart, and a unilateral improvement would make the
   * equivalence harness unable to tell a real packing bug from this.
   */
  it('reproduces the classic chart, adjective-head bug included', () => {
    const r = composePacked(T('the old man fell'), pos);
    const np = r.molecules.find((m) => m.type === 'NP' && m.from === 0 && m.to === 2);
    expect([...headsOf(np)]).toEqual(['old']);
  });

  /**
   * THE POINT OF THE MODULE. Four stacked PPs are 42 readings in the classic
   * chart and one answer. Packed, the 42 are never built — the answer set is
   * read straight off the forest.
   */
  it('collapses the stacked-PP forest to a single answer', () => {
    const r = composePacked(STACKED, pos);
    const answers = projectAnswers(r.stable[0]);
    expect(answers.map(answerKey)).toEqual(['dog|chased']);
  });

  it('projects an imperative with a null subject', () => {
    const r = composePacked(T('chased the cat'), pos, { roots: ['S'] });
    const answers = projectAnswers(r.stable[0]);
    expect(answers.some((a) => a.subject === null && a.verb === 'chased')).toBe(true);
  });

  it('returns no answers for a node that is not there', () => {
    expect(projectAnswers(undefined)).toEqual([]);
  });

  /**
   * A node built two ways with two different heads must report BOTH. Taking
   * derivations[0] would pass every other test in this file and silently
   * answer about one arbitrary tree.
   */
  it('unions heads across derivations rather than taking the first', () => {
    const left = { type: 'N', from: 0, to: 0, derivations: [], token: 'alpha' };
    const right = { type: 'N', from: 1, to: 1, derivations: [], token: 'beta' };
    const twoWays = {
      type: 'NP', from: 0, to: 1, token: null,
      derivations: [
        { bond: ['N', 'N', 'NP'], left, right },
        { bond: ['DET', 'N', 'NP'], left: { ...left, type: 'DET' }, right },
      ],
    };
    expect([...headsOf(twoWays)].sort()).toEqual(['alpha', 'beta']);
  });
});

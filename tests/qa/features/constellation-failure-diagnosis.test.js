import { describe, it, expect } from 'vitest';
import { diagnose, frontierSignature, OUTCOME } from '../../../codex/core/constellation/failure-diagnosis.js';

/** `the dog barked` — det(dog<-the), nsubj(barked<-dog), root(barked). */
const DOG = {
  tokens: [
    { id: 1, form: 'the', lemma: 'the', upos: 'DET', head: 2, deprel: 'det' },
    { id: 2, form: 'dog', lemma: 'dog', upos: 'NOUN', head: 3, deprel: 'nsubj' },
    { id: 3, form: 'barked', lemma: 'bark', upos: 'VERB', head: 0, deprel: 'root' },
  ],
};

const molecule = (type, from, to) => ({ type, from, to, parts: [] });
const result = (molecules, spanning = [], stable = []) => ({
  atoms: [], molecules, spanning, stable,
});

describe('diagnose', () => {
  it('reports PARSED when a spanning S exists', () => {
    const r = result([molecule('S', 0, 2)], [molecule('S', 0, 2)], [molecule('S', 0, 2)]);
    expect(diagnose(DOG, r)).toMatchObject({ outcome: OUTCOME.PARSED, categories: [] });
  });

  /**
   * The 2x2's top-right cell: the parse exists only because the POS table was
   * vague. Coverage counts it as a clean win, so it has to be flagged.
   */
  it('flags a parse that gold POS forbids as overGenerated', () => {
    const real = result([molecule('S', 0, 2)], [molecule('S', 0, 2)], [molecule('S', 0, 2)]);
    const gold = result([], [], []);
    expect(diagnose(DOG, real, gold).overGenerated).toBe(true);
  });

  it('reports LEXICAL when gold POS parses what the real table could not', () => {
    const real = result([molecule('N', 1, 1)], [], []);
    const gold = result([molecule('S', 0, 2)], [molecule('S', 0, 2)], [molecule('S', 0, 2)]);
    expect(diagnose(DOG, real, gold).outcome).toBe(OUTCOME.LEXICAL);
  });

  /**
   * The `(end)` blocker shape: the chart reached the top and failed a type
   * check. That is not a missing construction and must not be counted as one.
   */
  it('reports ROOT_TYPE_MISMATCH when the chart spans but the root type is wrong', () => {
    const np = molecule('NP', 0, 2);
    const r = result([np], [np], []);
    expect(diagnose(DOG, r)).toMatchObject({ outcome: OUTCOME.ROOT_TYPE_MISMATCH, categories: [] });
  });

  it('names the minimal unreachable subtree by its deprel and head UPOS', () => {
    // `the dog` composed; `barked` typed; the join to a clause did not happen.
    const r = result([
      molecule('DET', 0, 0), molecule('N', 1, 1), molecule('NP', 0, 1), molecule('V', 2, 2),
    ], [], []);
    const d = diagnose(DOG, r);
    expect(d.outcome).toBe(OUTCOME.GRAMMAR);
    expect(d.categories).toHaveLength(1);
    expect(d.categories[0]).toMatchObject({
      deprel: 'root', label: 'root (VERB -> ROOT)', from: 0, to: 2,
    });
  });

  it('reports only the minimal site, never an ancestor of one', () => {
    // Nothing above the atoms composed: `dog`'s subtree (the dog) is already
    // unreachable, so `barked`'s must not also be reported.
    const r = result([
      molecule('DET', 0, 0), molecule('N', 1, 1), molecule('V', 2, 2),
    ], [], []);
    const d = diagnose(DOG, r);
    expect(d.categories.map((c) => c.deprel)).toEqual(['nsubj']);
  });

  it('locates the site at the subtree of an untyped token', () => {
    // No molecule at 1:1 at all — `dog` received no atom. The reported span is
    // `dog`'s subtree (`the dog`, 0:1), which is the constituent that failed.
    const r = result([molecule('DET', 0, 0), molecule('V', 2, 2)], [], []);
    const d = diagnose(DOG, r);
    expect(d.categories.map((c) => c.deprel)).toEqual(['nsubj']);
    expect(d.categories[0]).toMatchObject({ from: 0, to: 1 });
  });

  /**
   * A discontinuous gold subtree has no single span, so span-based reachability
   * is meaningless for it. Counting it is honest; guessing about it is not.
   *
   * `A hearing is scheduled on the issue today` — `on the issue` modifies
   * `hearing`, which sits at index 1, so `hearing`'s subtree is {0,1,4,5,6}:
   * five tokens across a seven-wide span. The edge crosses `is scheduled`.
   */
  it('counts a non-projective subtree instead of categorising it', () => {
    const nonProjective = {
      tokens: [
        { id: 1, form: 'A', lemma: 'a', upos: 'DET', head: 2, deprel: 'det' },
        { id: 2, form: 'hearing', lemma: 'hearing', upos: 'NOUN', head: 4, deprel: 'nsubj:pass' },
        { id: 3, form: 'is', lemma: 'be', upos: 'AUX', head: 4, deprel: 'aux:pass' },
        { id: 4, form: 'scheduled', lemma: 'schedule', upos: 'VERB', head: 0, deprel: 'root' },
        { id: 5, form: 'on', lemma: 'on', upos: 'ADP', head: 7, deprel: 'case' },
        { id: 6, form: 'the', lemma: 'the', upos: 'DET', head: 7, deprel: 'det' },
        { id: 7, form: 'issue', lemma: 'issue', upos: 'NOUN', head: 2, deprel: 'nmod' },
        { id: 8, form: 'today', lemma: 'today', upos: 'NOUN', head: 4, deprel: 'obl' },
      ],
    };
    const d = diagnose(nonProjective, result([], [], []));
    expect(d.nonProjective).toBe(1);
    // `hearing` is undiagnosable, so `scheduled` above it must not be named.
    expect(d.categories.map((c) => c.deprel)).not.toContain('root');
  });
});

describe('frontierSignature', () => {
  it('tiles the input with the widest molecule starting at each position', () => {
    const r = result([
      molecule('DET', 0, 0), molecule('N', 1, 1), molecule('NP', 0, 1), molecule('V', 2, 2),
    ]);
    expect(frontierSignature(r, 3)).toBe('NP V');
  });

  it('marks a position no molecule starts at, rather than skipping it', () => {
    const r = result([molecule('DET', 0, 0), molecule('V', 2, 2)]);
    expect(frontierSignature(r, 3)).toBe('DET ? V');
  });

  it('is empty for an empty chart over zero tokens', () => {
    expect(frontierSignature(result([]), 0)).toBe('');
  });

  it('breaks ties (same from/to) by first appearance', () => {
    const r = result([molecule('N', 0, 0), molecule('NP', 0, 0)]);
    expect(frontierSignature(r, 2)).toBe('N ?');
  });
});

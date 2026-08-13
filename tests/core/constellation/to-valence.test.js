/**
 * `to` OFFERS BOTH READINGS.
 *
 * English `to` is polyfunctional: `going to Fiji` is adpositional, `going to eat`
 * is infinitival. `atomsFor` emitted only the infinitival marker `TO`, and `to`
 * was in no preposition list, so `P + NP -> PP` could never fire for it.
 *
 * Found by the Grammar Valence Cyclotron (`PB-CONSTELLATION-GRAMMAR-GAP-v1`,
 * docs/superpowers/evidence/2026-08-13-grammar-valence-discovery.md): the gap
 * was `TO+NP` at 99 DEV events, whose gold evidence was 59 oblique links. Its
 * deeper finding is the one these tests guard — seven broad clause-glue bonds
 * looked productive and every one failed the purity bar, because the parser was
 * repairing THIS lexical omission at a later chart frontier. Take the second
 * atom away and the pressure to add impure glue comes back.
 *
 * The four assertions the cyclotron asked for: both atoms emitted, `TO+VP->INF`
 * preserved, `P+NP->PP` exercised, and the treebank gate rerun — the fourth
 * lives in `tests/qa/features/constellation-treebank-gate.test.js`.
 */

import { describe, expect, it } from 'vitest';
import { compose, atomsFor } from '../../../codex/core/constellation/compose.js';
import { PREPOSITION_CUES } from '../../../codex/core/lexical-analysis/closed-class.js';

const typesOf = (result, token) => result.atoms
  .filter(atom => atom.token === token)
  .map(atom => atom.type);

const hasMolecule = (result, type) => result.molecules.some(m => m.type === type);

describe('to is P union TO', () => {
  it('offers both atoms for the same word', () => {
    expect(PREPOSITION_CUES.has('to')).toBe(true);
    expect(atomsFor('to', 2, new Map()).map(a => a.type).sort()).toEqual(['P', 'TO']);
  });

  it('preserves the infinitival reading: TO + VP -> INF', () => {
    const posMap = new Map([['i', []], ['want', ['v']], ['to', []], ['eat', ['v']]]);
    const result = compose(['i', 'want', 'to', 'eat'], posMap);

    expect(typesOf(result, 'to')).toContain('TO');
    expect(hasMolecule(result, 'INF')).toBe(true);
  });

  it('exercises the adpositional reading: P + NP -> PP', () => {
    const posMap = new Map([['going', ['v']], ['to', []], ['the', []], ['island', ['n']]]);
    const result = compose(['going', 'to', 'the', 'island'], posMap);

    expect(typesOf(result, 'to')).toContain('P');
    expect(hasMolecule(result, 'PP')).toBe(true);
  });

  it('lets a clause span on the adpositional reading it could not build before', () => {
    // `to the island` is a prepositional phrase, not an infinitive, and before
    // the second atom existed nothing could attach it — the clause did not span.
    const posMap = new Map([
      ['the', []], ['ship', ['n']], ['sailed', ['v']], ['to', []], ['island', ['n']],
    ]);
    const tokens = ['the', 'ship', 'sailed', 'to', 'the', 'island'];
    expect(compose(tokens, posMap).stable.length).toBeGreaterThan(0);
  });

  it('does not type a sentence-initial To as a proper noun', () => {
    // Closed-class membership is the half that matters at position zero: the
    // unknown-word escape hatch had never heard of `to` either.
    expect(atomsFor('To', 0, new Map()).map(a => a.type)).not.toContain('PROPN');
  });
});

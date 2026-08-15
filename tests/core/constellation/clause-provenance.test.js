/**
 * Imperative VP→S is a valid clause. It is not generic internal S material.
 *
 * Production change that would make these fail:
 *   - suppressing VP→S whenever the token also carries ADJ/ADV (dictionary coupling)
 *   - letting ADJ+S / ADV+S consume an S that exists only as a VP lift
 */
import { describe, it, expect } from 'vitest';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';
import { compose } from '../../../codex/core/constellation/compose.js';
import { atomsFor } from '../../../codex/core/constellation/compose.js';
import { admitBond, isAdjunctEligible } from '../../../codex/core/constellation/bond-admission.js';

function adjunctBonds(chart, leftType) {
  const hits = [];
  for (const m of chart.molecules) {
    for (const d of m.derivations || []) {
      if (!d.bond) continue;
      if (d.bond[0] === leftType && d.bond[1] === 'S' && d.bond[2] === 'S') {
        hits.push(d);
      }
    }
  }
  return hits;
}

function classicAdjunct(chart, leftType) {
  return chart.molecules.filter((m) => (
    m.type === 'S' && m.parts?.length === 2
    && m.parts[0].type === leftType && m.parts[1].type === 'S'
  ));
}

describe('imperative VP→S is still a root', () => {
  it('parses a one-word imperative even when the lexicon also lists it as an adjective', () => {
    const ambiguous = new Map([['round', ['n', 'v', 'a', 'r']]]);
    const verbOnly = new Map([['round', ['v']]]);
    for (const pos of [ambiguous, verbOnly]) {
      const packed = composePacked(['round'], pos);
      const classic = compose(['round'], pos);
      expect(packed.stable.some((m) => m.type === 'S')).toBe(true);
      expect(classic.stable.some((m) => m.type === 'S')).toBe(true);
    }
  });

  it('does not drop the verb atom just because an adjective sense exists', () => {
    const types = atomsFor('round', 0, new Map([['round', ['n', 'v', 'a', 'r']]])).map((a) => a.type);
    expect(types).toContain('V');
    expect(types).toContain('ADJ');
  });
});

describe('embryonic imperatives are not adjunct-eligible', () => {
  it('marks a VP→S lift as not adjunct-eligible', () => {
    const vp = { type: 'VP', from: 0, to: 0, derivations: [] };
    const lifted = { type: 'S', from: 0, to: 0, derivations: [{
      lift: 'S', child: vp, clauseOrigin: 'imperative',
      rootEligible: true, adjunctEligible: false,
    }] };
    expect(isAdjunctEligible(lifted)).toBe(false);
  });

  it('rejects ADJ+S against an imperative-only S', () => {
    const adj = { type: 'ADJ', from: 0, to: 0 };
    const imperative = {
      type: 'S', from: 1, to: 1,
      derivations: [{ lift: 'S', adjunctEligible: false, clauseOrigin: 'imperative' }],
    };
    expect(admitBond(adj, imperative, ['ADJ', 'S', 'S', 1])).toEqual({
      ok: false,
      reason: 'imperative-not-adjunct-eligible',
    });
  });

  it('admits ADJ+S against a subject-predicate S', () => {
    const adj = { type: 'ADJ', from: 0, to: 0 };
    const clause = {
      type: 'S', from: 1, to: 2,
      derivations: [{
        bond: ['NP', 'VP', 'S', 1],
        adjunctEligible: true,
        clauseOrigin: 'subject-predicate',
      }],
    };
    expect(admitBond(adj, clause, ['ADJ', 'S', 'S', 1]).ok).toBe(true);
  });
});

describe('chart: adjuncts cannot eat an embryonic imperative', () => {
  const pos = new Map([
    ['old', ['a']],
    ['round', ['n', 'v', 'a', 'r']],
    ['men', ['n']],
    ['ran', ['v']],
    ['quickly', ['r']],
  ]);

  it('does not build ADJ+S from "old round" — the S is only a VP lift', () => {
    const packed = composePacked(['old', 'round'], pos, { roots: ['S', 'NP', 'VP'] });
    expect(adjunctBonds(packed, 'ADJ')).toEqual([]);
    expect(classicAdjunct(compose(['old', 'round'], pos, { roots: ['S', 'NP', 'VP'] }), 'ADJ')).toEqual([]);
  });

  it('still parses "old men ran" via constructive NP+VP, not by eating an imperative', () => {
    const packed = composePacked(['old', 'men', 'ran'], pos);
    expect(packed.stable.some((m) => m.type === 'S')).toBe(true);
    expect(compose(['old', 'men', 'ran'], pos).stable.some((m) => m.type === 'S')).toBe(true);
  });

  it('still lets a fronted PP attach to a one-word imperative', () => {
    const packed = composePacked(['in', 'town', 'run'], new Map([
      ['in', []], ['town', ['n']], ['run', ['v']],
    ]));
    expect(packed.stable.some((m) => m.type === 'S')).toBe(true);
  });

  it('still lets a fronted adverb attach to a real subject-predicate clause', () => {
    const packed = composePacked(['quickly', 'men', 'ran'], pos);
    expect(packed.stable.some((m) => m.type === 'S')).toBe(true);
    const advS = adjunctBonds(packed, 'ADV');
    expect(advS.length).toBeGreaterThan(0);
    expect(advS.every((d) => isAdjunctEligible(d.right))).toBe(true);
  });
});

/**
 * T3 + T7 — Packed-forest inference and exact role-filler bindings.
 *
 * Production change that would make these fail: scoring projected pairs
 * instead of derivation IDs, disagreeing with bounded enumeration, or
 * treating bindings as an unordered bag.
 */
import { describe, expect, it } from 'vitest';

import { composePacked } from '../../../../codex/core/constellation/compose-packed.js';
import {
  bindingSignature,
  enumerateBounded,
  extractBindings,
  inferForest,
  localFactors,
  nodeId,
} from '../../../../codex/core/constellation/semantic-particles/forest-inference.js';

const pos = new Map([
  ['old', ['a']],
  ['men', ['n']],
  ['ran', ['v']],
  ['the', ['x']],
  ['idea', ['n']],
]);

describe('derivation identity and role binding', () => {
  it('derivation IDs include the rule and child node IDs, not only result+span', () => {
    const chart = composePacked(['old', 'men', 'ran'], pos);
    const s = chart.stable.find((n) => n.type === 'S');
    const ids = s.derivations.map((d, i) => nodeId(s, d, i));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((id) => id.includes('NP+VP->S') || id.includes('lift:S'))).toBe(true);
  });

  it('NP+VP binds subject and predicate from the authored head, not position', () => {
    const left = {
      type: 'NP', from: 0, to: 1,
      nucleus: { lemmas: ['men'], headLemmas: ['men'] },
      derivations: [],
    };
    const right = {
      type: 'VP', from: 2, to: 2,
      nucleus: { lemmas: ['ran'], headLemmas: ['ran'] },
      derivations: [],
    };
    const d = { bond: ['NP', 'VP', 'S', 1], left, right };
    const bindings = extractBindings(d);
    expect(bindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'subject', filler: 'men' }),
      expect.objectContaining({ role: 'predicate', filler: 'ran' }),
    ]));
    expect(bindingSignature(bindings)).not.toBe(bindingSignature(
      bindings.map((b) => ({ role: b.filler, filler: b.role })),
    ));
  });
});

describe('packed forest inference', () => {
  it('Viterbi agrees with bounded explicit enumeration on a short clause', () => {
    const chart = composePacked(['old', 'men', 'ran'], pos);
    const inferred = inferForest(chart);
    const enumerated = enumerateBounded(chart, { maxTrees: 64 });
    expect(enumerated.trees.length).toBeGreaterThan(0);
    const bestEnum = enumerated.trees.reduce((a, b) => (b.score > a.score ? b : a));
    expect(inferred.best.score).toBeCloseTo(bestEnum.score, 6);
    expect(inferred.best.derivationId).toBe(bestEnum.derivationId);
  });

  it('inside and outside are defined over the same derivation IDs', () => {
    const chart = composePacked(['old', 'men', 'ran'], pos);
    const inferred = inferForest(chart);
    expect(inferred.inside.length).toBe(inferred.nodes.length);
    expect(inferred.outside.length).toBe(inferred.nodes.length);
    expect(inferred.inside.every((x) => Number.isFinite(x) || x === -Infinity)).toBe(true);
  });

  it('local factors decompose into named contributions that sum to the local score', () => {
    const chart = composePacked(['old', 'men', 'ran'], pos);
    const s = chart.stable.find((n) => n.type === 'S');
    const d = s.derivations.find((x) => x.bond && x.bond[0] === 'NP');
    const factors = localFactors(s, d, { chart });
    const named = factors.syntax + factors.semantic + factors.provenance;
    expect(factors.total).toBeCloseTo(named, 6);
    expect(factors.contributions.every((c) => typeof c.name === 'string')).toBe(true);
  });

  it('does not mutate the packed forest', () => {
    const chart = composePacked(['old', 'men', 'ran'], pos);
    const before = chart.molecules.map((m) => m.derivations.length).join(',');
    inferForest(chart);
    const after = chart.molecules.map((m) => m.derivations.length).join(',');
    expect(after).toBe(before);
    expect(chart.stable.length).toBeGreaterThan(0);
  });
});

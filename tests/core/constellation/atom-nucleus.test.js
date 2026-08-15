/**
 * Every atom has a nucleus. The aura is the fingerprint of that nucleus.
 *
 * Production change that would make these fail: bonding two silicone readings
 * of the same lemma (round-ADJ + round-S) without an aura collision, or
 * refusing old+men because they do not share a head lemma.
 */
import { describe, it, expect } from 'vitest';
import {
  sealNucleus,
  leafNucleus,
  liftNucleus,
  bondNucleus,
  readNucleus,
  auraCollision,
} from '../../../codex/core/constellation/atom-nucleus.js';
import { admitBond } from '../../../codex/core/constellation/bond-admission.js';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';
import { atomsFor } from '../../../codex/core/constellation/compose.js';

describe('nucleus is self-containing', () => {
  it('seals a leaf from only the token, type, and index', () => {
    const n = leafNucleus('Round', 'ADJ', 3);
    expect(n.kind).toBe('leaf');
    expect(n.lemmas).toEqual(['round']);
    expect(n.headLemmas).toEqual(['round']);
    expect(n.from).toBe(3);
    expect(n.aura).toMatch(/^aura1:[0-9a-f]{8}$/);
  });

  it('gives different spans of the same lemma different auras and the same lemma set', () => {
    const a = leafNucleus('round', 'ADJ', 0);
    const b = leafNucleus('round', 'V', 1);
    expect(a.lemmas).toEqual(b.lemmas);
    expect(a.aura).not.toBe(b.aura);
  });

  it('a lift inherits the child head lemma — the nucleus does not forget who it was', () => {
    const v = leafNucleus('round', 'V', 1);
    const vp = liftNucleus('VP', v);
    const s = liftNucleus('S', vp);
    expect(s.headLemmas).toEqual(['round']);
    expect(s.lemmas).toEqual(['round']);
    expect(s.type).toBe('S');
  });

  it('a bond takes the head child\'s lemma as the nucleus head', () => {
    const adj = leafNucleus('old', 'ADJ', 0);
    const n = leafNucleus('men', 'N', 1);
    const fused = bondNucleus('N', adj, n, ['ADJ', 'N', 'N', 1]);
    expect(fused.headLemmas).toEqual(['men']);
    expect(fused.lemmas).toEqual(['men', 'old']);
  });
});

describe('aura collision is the silicone barrier', () => {
  it('refuses ADJ+S when the adjective lemma is the clause head lemma', () => {
    const adj = { type: 'ADJ', from: 0, to: 0, nucleus: leafNucleus('round', 'ADJ', 0) };
    const s = { type: 'S', from: 1, to: 1, nucleus: liftNucleus('S', liftNucleus('VP', leafNucleus('round', 'V', 1))) };
    expect(auraCollision(adj, s, ['ADJ', 'S', 'S', 1])).toBe('aura-collision');
  });

  it('allows ADJ+S when the adjective is a different lemma from the clause head', () => {
    const adj = { type: 'ADJ', from: 0, to: 0, nucleus: leafNucleus('old', 'ADJ', 0) };
    const s = { type: 'S', from: 1, to: 2, nucleus: bondNucleus(
      'S',
      { nucleus: leafNucleus('men', 'NP', 1) },
      { nucleus: leafNucleus('ran', 'VP', 2) },
      ['NP', 'VP', 'S', 1],
    ) };
    expect(auraCollision(adj, s, ['ADJ', 'S', 'S', 1])).toBe(null);
  });

  it('does not pressure a constructive axiom — NP+VP is not silicone', () => {
    const np = { type: 'NP', nucleus: leafNucleus('round', 'NP', 0) };
    const vp = { type: 'VP', nucleus: leafNucleus('round', 'VP', 1) };
    expect(auraCollision(np, vp, ['NP', 'VP', 'S', 1])).toBe(null);
  });

  it('is silent when a node has no nucleus — absence is not a collision', () => {
    expect(auraCollision(
      { type: 'ADJ', from: 0, to: 0 },
      { type: 'S', from: 1, to: 1 },
      ['ADJ', 'S', 'S', 1],
    )).toBe(null);
  });
});

describe('admitBond consults the aura', () => {
  it('rejects the colliding ADJ+S through the shared gate', () => {
    const adj = { type: 'ADJ', from: 0, to: 0, nucleus: leafNucleus('round', 'ADJ', 0) };
    const s = { type: 'S', from: 1, to: 1, nucleus: liftNucleus('S', leafNucleus('round', 'V', 1)) };
    expect(admitBond(adj, s, ['ADJ', 'S', 'S', 1])).toEqual({
      ok: false,
      reason: 'aura-collision',
    });
  });

  it('can be switched off for the control arm', () => {
    const adj = { type: 'ADJ', from: 0, to: 0, nucleus: leafNucleus('round', 'ADJ', 0) };
    const s = { type: 'S', from: 1, to: 1, nucleus: liftNucleus('S', leafNucleus('round', 'V', 1)) };
    expect(admitBond(adj, s, ['ADJ', 'S', 'S', 1], { disableAura: true }).ok).toBe(true);
  });
});

describe('the chart stamps a nucleus on every atom', () => {
  const pos = new Map([
    ['old', ['a']],
    ['men', ['n']],
    ['ran', ['v']],
    ['round', ['n', 'v', 'a', 'r']],
  ]);

  it('atomsFor carries a nucleus', () => {
    const atoms = atomsFor('Round', 1, pos);
    expect(atoms.length).toBeGreaterThan(0);
    for (const a of atoms) {
      expect(a.nucleus.aura).toMatch(/^aura1:/);
      expect(a.nucleus.lemmas).toEqual(['round']);
    }
  });

  it('every packed node has a sealed nucleus', () => {
    const chart = composePacked(['old', 'men', 'ran'], pos);
    expect(chart.atoms.every((a) => a.nucleus && a.nucleus.aura)).toBe(true);
    expect(chart.molecules.every((m) => m.nucleus && m.nucleus.aura)).toBe(true);
  });

  it('still parses a real clause under aura pressure', () => {
    const chart = composePacked(['old', 'men', 'ran'], pos);
    expect(chart.stable.some((m) => m.type === 'S')).toBe(true);
  });

  it('cuts the uranium recursive-preservative forest without switching the aura off', () => {
    const tokens = Array.from({ length: 8 }, () => 'round');
    const shielded = composePacked(tokens, pos, { roots: ['S', 'NP', 'VP'] });
    const open = composePacked(tokens, pos, { roots: ['S', 'NP', 'VP'], disableAura: true });
    expect(shielded.reactions.recursivePreservative)
      .toBeLessThan(open.reactions.recursivePreservative);
    // Local NP+VP clauses still exist. A spanning S of eight identical
    // lemmas was the cascade, not a sentence.
    expect(shielded.molecules.some((m) => m.type === 'S' && m.to > m.from)).toBe(true);
  });
});

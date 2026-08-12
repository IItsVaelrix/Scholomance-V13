/**
 * Degree-matched configuration null — PB-QUARK-CHAMBER-v1
 *
 * Also pins the design's section 3.2 finding that `shuffleOffersSeeks` is
 * structurally INERT for topology. That is not a defect in it — for the nuclei
 * ablation it is a valid control — but it means it cannot serve as the null
 * here, and a regression test is the only thing that keeps that fact from
 * being forgotten.
 */

import { describe, it, expect } from 'vitest';
import { degreeMatchedShuffle } from '../../../../../codex/core/pixelbrain/quark-chamber/configuration-null.js';
import { generateQuarkCandidates } from '../../../../../codex/core/pixelbrain/quark-chamber/slingshot.js';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from '../../../../../scripts/semantic-valence-cyclotron.mjs';
import { shuffleOffersSeeks, buildDefaultBank } from '../../../../../codex/core/pixelbrain/codebase-nuclei-bank.js';

const { blueprints: FULL_ATOMS, bridges: FULL_BRIDGES } =
  buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});

const portCounts = (blueprints, field) => {
  const counts = new Map();
  for (const atom of blueprints) for (const port of atom[field] ?? []) {
    counts.set(port, (counts.get(port) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
};

describe('degree-matched configuration null', () => {
  it('preserves each atom offer and seek count', () => {
    const shuffled = degreeMatchedShuffle(FULL_ATOMS, 0x51554152);
    expect(shuffled).toHaveLength(FULL_ATOMS.length);
    for (let i = 0; i < FULL_ATOMS.length; i += 1) {
      expect(shuffled[i].id).toBe(FULL_ATOMS[i].id);
      expect(shuffled[i].offers).toHaveLength(FULL_ATOMS[i].offers.length);
      expect(shuffled[i].seeks ?? []).toHaveLength((FULL_ATOMS[i].seeks ?? []).length);
    }
  });

  it('preserves every port global offer and seek frequency', () => {
    const shuffled = degreeMatchedShuffle(FULL_ATOMS, 0x51554152);
    expect(portCounts(shuffled, 'offers')).toEqual(portCounts(FULL_ATOMS, 'offers'));
    expect(portCounts(shuffled, 'seeks')).toEqual(portCounts(FULL_ATOMS, 'seeks'));
  });

  it('never gives an atom the same port twice', () => {
    const shuffled = degreeMatchedShuffle(FULL_ATOMS, 0x7);
    for (const atom of shuffled) {
      expect(new Set(atom.offers).size).toBe(atom.offers.length);
      expect(new Set(atom.seeks ?? []).size).toBe((atom.seeks ?? []).length);
    }
  });

  it('is deterministic for a seed and different across seeds', () => {
    expect(degreeMatchedShuffle(FULL_ATOMS, 11)).toEqual(degreeMatchedShuffle(FULL_ATOMS, 11));
    expect(degreeMatchedShuffle(FULL_ATOMS, 11)).not.toEqual(degreeMatchedShuffle(FULL_ATOMS, 12));
  });

  it('rejects a non-finite seed rather than coercing it', () => {
    expect(() => degreeMatchedShuffle(FULL_ATOMS, Number.NaN)).toThrow(/finite/i);
  });

  it('actually moves topology — unlike shuffleOffersSeeks, which is inert for it', () => {
    const real = generateQuarkCandidates(FULL_ATOMS, FULL_BRIDGES, { confinementMin: 1 }).length;

    // The design's section 3.2: the bundle-preserving shuffle is an isomorphism
    // at the port level, so candidate counts are invariant under it.
    const inertCounts = [1, 2, 3, 4, 5].map((seed) => (
      generateQuarkCandidates(shuffleOffersSeeks(FULL_ATOMS, seed), FULL_BRIDGES, { confinementMin: 1 }).length
    ));
    expect(new Set(inertCounts)).toEqual(new Set([real]));

    // The degree-matched shuffle must not be invariant.
    const liveCounts = [1, 2, 3, 4, 5].map((seed) => (
      generateQuarkCandidates(degreeMatchedShuffle(FULL_ATOMS, seed), FULL_BRIDGES, { confinementMin: 1 }).length
    ));
    expect(new Set(liveCounts).size).toBeGreaterThan(1);
  });
});

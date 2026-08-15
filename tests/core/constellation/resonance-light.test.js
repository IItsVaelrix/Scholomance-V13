/**
 * Light is meaning-agnostic. Chlorophyll reacts. The reaction is the meaning.
 *
 * Production change that would make these fail: putting type/lemma on the
 * photon, or a V reading of `round` absorbing more energy from span 0
 * (`the`) than the N reading does.
 */
import { describe, it, expect } from 'vitest';
import { compose, atomsFor } from '../../../codex/core/constellation/compose.js';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';
import { emitLight, chlorophyll } from '../../../codex/core/constellation/resonance-beacon.js';
import { leafNucleus } from '../../../codex/core/constellation/atom-nucleus.js';

const pos = new Map([
  ['the', []],
  ['round', ['n', 'v', 'a', 'r']],
  ['fell', ['n', 'v']],
]);

const MEANING_KEYS = ['type', 'lemmas', 'headLemmas', 'coresident', 'token', 'adjunctEligible'];

describe('light carries no meaning', () => {
  it('is geometry, identity, and energy — not a type or a lemma', () => {
    const atom = atomsFor('round', 1, pos).find((a) => a.type === 'N');
    atom.nucleus = atom.nucleus || leafNucleus('round', 'N', 1);
    const light = emitLight(atom);
    expect(light.aura).toMatch(/^aura1:/);
    expect(Number.isInteger(light.from)).toBe(true);
    expect(Number.isInteger(light.to)).toBe(true);
    expect(light.energy).toBeGreaterThan(0);
    for (const key of MEANING_KEYS) {
      expect(light, `light must not carry ${key}`).not.toHaveProperty(key);
    }
  });

  it('is the same photon whether the emitter is called N or V — meaning is not on the ray', () => {
    const n = atomsFor('round', 1, pos).find((a) => a.type === 'N');
    const v = atomsFor('round', 1, pos).find((a) => a.type === 'V');
    const a = emitLight(n);
    const b = emitLight(v);
    expect(a.from).toBe(b.from);
    expect(a.to).toBe(b.to);
    expect(a.energy).toBe(b.energy);
    expect(a.aura).not.toBe(b.aura);
  });
});

describe('chlorophyll reacts; the reaction is the informative state', () => {
  it('stamps light and ingested on every leaf after compose', () => {
    const chart = compose(['the', 'round', 'fell'], pos);
    expect(chart.atoms.length).toBeGreaterThan(0);
    for (const atom of chart.atoms) {
      expect(atom.light, `${atom.type}@${atom.from}`).toBeTruthy();
      expect(atom.chlorophyll).toBeTruthy();
      expect(atom.ingested).toBeTruthy();
      expect(Array.isArray(atom.ingested.reactions)).toBe(true);
    }
  });

  it('the same light from span 0 yields more energy in N-chlorophyll than V-chlorophyll', () => {
    const chart = composePacked(['the', 'round', 'fell'], pos);
    const noun = chart.atoms.find((a) => a.from === 1 && a.type === 'N');
    const verb = chart.atoms.find((a) => a.from === 1 && a.type === 'V');
    expect(noun.ingested.energy).toBeGreaterThan(verb.ingested.energy);
    const nounFromThe = noun.ingested.reactions
      .filter((r) => r.from === 0)
      .reduce((n, r) => n + r.energy, 0);
    const verbFromThe = verb.ingested.reactions
      .filter((r) => r.from === 0)
      .reduce((n, r) => n + r.energy, 0);
    expect(nounFromThe).toBeGreaterThan(verbFromThe);
    expect(noun.ingested.reactions[0]).not.toHaveProperty('type');
  });

  it('does not ingest light from its own span', () => {
    const chart = compose(['round'], pos);
    for (const atom of chart.atoms) {
      expect(atom.ingested.reactions.every((r) => r.from !== atom.from)).toBe(true);
    }
  });

  it('does not drop a reading when the field lights up', () => {
    const dark = atomsFor('round', 1, pos).map((a) => a.type).sort();
    const chart = compose(['the', 'round', 'fell'], pos);
    const lit = chart.atoms.filter((a) => a.from === 1).map((a) => a.type).sort();
    expect(lit).toEqual(dark);
  });

  it('chlorophyll is receiver-local — two atoms at one span have different chlorophyll', () => {
    const n = { type: 'N', from: 1, to: 1, nucleus: leafNucleus('round', 'N', 1) };
    const v = { type: 'V', from: 1, to: 1, nucleus: leafNucleus('round', 'V', 1) };
    expect(chlorophyll(n).aura).not.toBe(chlorophyll(v).aura);
  });
});

/**
 * Resonance beacons broadcast atom state. They rank readings. They do not prune.
 *
 * Production change that would make these fail: a DET neighbor failing to
 * prefer the noun reading of `round`, or a beacon field that drops a type
 * `atomsFor` emitted.
 */
import { describe, it, expect } from 'vitest';
import { atomsFor, BONDS, compose } from '../../../codex/core/constellation/compose.js';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';
import {
  buildBeaconField,
  encodeBeacon,
  readingScores,
  rankByResonance,
  pickResonantAnswer,
} from '../../../codex/core/constellation/resonance-beacon.js';

const pos = new Map([
  ['the', []],
  ['round', ['n', 'v', 'a', 'r']],
  ['fell', ['n', 'v']],
  ['old', ['a']],
  ['men', ['n']],
  ['ran', ['v']],
  ['they', []],
  ['can', ['n', 'v']],
]);

describe('encodeBeacon', () => {
  it('encodes nucleus state plus co-resident readings — the whole atom, not one type', () => {
    const atoms = atomsFor('round', 1, pos);
    const coresident = atoms.map((a) => a.type);
    const beacon = encodeBeacon(atoms.find((a) => a.type === 'V'), coresident);
    expect(beacon.aura).toMatch(/^aura1:/);
    expect(beacon.type).toBe('V');
    expect(beacon.coresident).toEqual(expect.arrayContaining(['N', 'V', 'ADJ', 'ADV']));
    expect(beacon.lemmas).toEqual(['round']);
  });
});

describe('the field is instantaneous and complete', () => {
  it('emits one slot per token, carrying every reading atomsFor emitted', () => {
    const field = buildBeaconField(['the', 'round', 'fell'], pos);
    expect(field).toHaveLength(3);
    expect(field[1].types).toEqual(expect.arrayContaining(['N', 'V', 'ADJ']));
    expect(field[0].types).toContain('DET');
  });

  it('does not drop a reading — ranking is not filtering', () => {
    const field = buildBeaconField(['round'], pos);
    const emitted = new Set(atomsFor('round', 0, pos).map((a) => a.type));
    expect(new Set(field[0].types)).toEqual(emitted);
  });
});

describe('resonance prefers the reading a neighbor can found a clause on', () => {
  it('gives `round` after `the` a unique noun win — DET+N is carbon, DET+V is silence', () => {
    const field = buildBeaconField(['the', 'round', 'fell'], pos);
    const scores = readingScores(field, BONDS)[1];
    const noun = scores.find((s) => s.type === 'N');
    const verb = scores.find((s) => s.type === 'V');
    expect(noun.score).toBeGreaterThan(verb.score);
    expect(scores[0].type).toBe('N');
  });

  it('does not invent a preference when the token stands alone', () => {
    const scores = readingScores(buildBeaconField(['round'], pos), BONDS)[0];
    const unique = new Set(scores.map((s) => s.score));
    expect(unique.size).toBe(1);
  });
});

describe('rankByResonance does not change what the chart built', () => {
  it('returns every stable molecule, only the order changes', () => {
    const tokens = ['the', 'round', 'fell'];
    const chart = compose(tokens, pos);
    const ranked = rankByResonance(chart.stable, buildBeaconField(tokens, pos), BONDS);
    expect(ranked.map((r) => r.molecule)).toEqual(expect.arrayContaining(chart.stable));
    expect(ranked).toHaveLength(chart.stable.length);
  });
});

describe('the chart carries the field', () => {
  it('compose stamps beacons on atoms and ranks stables without dropping any', () => {
    const chart = compose(['the', 'round', 'fell'], pos);
    expect(chart.field).toHaveLength(3);
    expect(chart.atoms.every((a) => a.beacon && a.beacon.aura)).toBe(true);
    expect(chart.ranked).toHaveLength(chart.stable.length);
    expect(chart.ranked.map((r) => r.molecule)).toEqual(expect.arrayContaining(chart.stable));
  });

  it('composePacked does the same — one S node, still ranked, still complete', () => {
    const chart = composePacked(['the', 'round', 'fell'], pos);
    expect(chart.field[1].types).toEqual(expect.arrayContaining(['N', 'V']));
    expect(chart.ranked).toHaveLength(chart.stable.length);
    expect(chart.stable.length).toBe(chart.ranked.length);
  });

  it('pickResonantAnswer prefers the noun subject when both answers exist', () => {
    const field = buildBeaconField(['the', 'round', 'fell'], pos);
    const picked = pickResonantAnswer(
      [
        { subject: 'round', verb: 'fell' },
        { subject: 'fell', verb: 'round' },
      ],
      field,
    );
    expect(picked).toEqual({ subject: 'round', verb: 'fell' });
  });
});

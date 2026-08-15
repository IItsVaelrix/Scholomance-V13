/**
 * The chloroplast is a solar-panel *array*. Each incoming light is a cell.
 * Irradiance is agnostic flux on that cell. Voltage is the reaction.
 * The consumer compares cells (winner-take-all), not a summed wattage.
 *
 * Production change that would make these fail: ranking a slot from a
 * scalar voltage sum, or putting a type on a cell.
 */
import { describe, it, expect } from 'vitest';
import { atomsFor, BONDS, compose } from '../../../codex/core/constellation/compose.js';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';
import {
  chloroplast,
  chlorophyll,
  emitLight,
  photosynthesize,
  readingScores,
  pickResonantDerivation,
} from '../../../codex/core/constellation/resonance-beacon.js';
import { leafNucleus } from '../../../codex/core/constellation/atom-nucleus.js';

const pos = new Map([
  ['the', []],
  ['round', ['n', 'v', 'a', 'r']],
  ['fell', ['n', 'v']],
]);

describe('chloroplast is a solar-panel array', () => {
  it('exposes one cell per incoming light — pigment, flux, voltage, no type on the cell', () => {
    const atom = {
      type: 'N',
      from: 1,
      to: 1,
      nucleus: leafNucleus('round', 'N', 1),
      chlorophyll: chlorophyll({ type: 'N', from: 1, to: 1, nucleus: leafNucleus('round', 'N', 1) }),
      ingested: { energy: 0.4, reactions: [{ aura: 'aura1:deadbeef', from: 0, energy: 0.4 }] },
    };
    const lights = [
      { aura: 'aura1:deadbeef', from: 0, to: 0, energy: 1 },
      emitLight(atom),
    ];
    const panel = chloroplast(atom, lights);
    expect(panel.pigment.type).toBe('N');
    expect(Array.isArray(panel.cells)).toBe(true);
    expect(panel.cells).toHaveLength(1);
    expect(panel.cells[0].from).toBe(0);
    expect(panel.cells[0].irradiance).toBe(1);
    expect(panel.cells[0].voltage).toBe(0.4);
    expect(panel.cells[0], 'a cell is a sensor, not a reading').not.toHaveProperty('type');
    expect(panel.irradiance).toBe(1);
    expect(panel.voltage).toBe(0.4);
    expect(panel, 'the array is a sensor, not a reading').not.toHaveProperty('type');
  });

  it('measures the same irradiance on two pigments at one span; voltage is the reaction', () => {
    const n = atomsFor('round', 1, pos).find((a) => a.type === 'N');
    const v = atomsFor('round', 1, pos).find((a) => a.type === 'V');
    const det = atomsFor('the', 0, pos).find((a) => a.type === 'DET');
    const lights = [emitLight(det), emitLight(n), emitLight(v)];
    const emitters = new Map(lights.map((light, i) => [light.aura, [det, n, v][i]]));
    n.ingested = photosynthesize(n, lights, emitters, BONDS);
    v.ingested = photosynthesize(v, lights, emitters, BONDS);
    const nPanel = chloroplast(n, lights);
    const vPanel = chloroplast(v, lights);
    expect(nPanel.irradiance).toBe(vPanel.irradiance);
    expect(nPanel.irradiance).toBeGreaterThan(0);
    expect(nPanel.cells).toHaveLength(vPanel.cells.length);
    expect(nPanel.cells[0].irradiance).toBe(vPanel.cells[0].irradiance);
    expect(nPanel.cells.find((c) => c.from === 0).voltage)
      .toBeGreaterThan(vPanel.cells.find((c) => c.from === 0).voltage);
  });

  it('does not fire a reverse-order bond — V+ADJ is not ADJ reacting to a verb on its right', () => {
    const adj = atomsFor('round', 1, pos).find((a) => a.type === 'ADJ');
    const noun = atomsFor('round', 1, pos).find((a) => a.type === 'N');
    const det = atomsFor('the', 0, pos).find((a) => a.type === 'DET');
    const verb = atomsFor('fell', 2, pos).find((a) => a.type === 'V');
    const lights = [emitLight(det), emitLight(adj), emitLight(noun), emitLight(verb)];
    const emitters = new Map([
      [emitLight(det).aura, det],
      [emitLight(adj).aura, adj],
      [emitLight(noun).aura, noun],
      [emitLight(verb).aura, verb],
    ]);
    adj.ingested = photosynthesize(adj, lights, emitters, BONDS);
    noun.ingested = photosynthesize(noun, lights, emitters, BONDS);
    expect(chloroplast(noun, lights).voltage).toBeGreaterThan(chloroplast(adj, lights).voltage);
  });
});

describe('the consumer reads the array', () => {
  it('stamps a chloroplast array on every leaf after compose', () => {
    const chart = compose(['the', 'round', 'fell'], pos);
    expect(chart.atoms.length).toBeGreaterThan(0);
    for (const atom of chart.atoms) {
      expect(atom.chloroplast, `${atom.type}@${atom.from}`).toBeTruthy();
      expect(Array.isArray(atom.chloroplast.cells)).toBe(true);
      expect(atom.chloroplast.voltage).toBe(atom.ingested.energy);
      expect(atom.chloroplast.irradiance).toBeGreaterThan(0);
    }
  });

  it('ranks a slot by who won each cell, not by summed wattage', () => {
    const chart = composePacked(['the', 'round', 'fell'], pos);
    const noun = chart.atoms.find((a) => a.from === 1 && a.type === 'N');
    const verb = chart.atoms.find((a) => a.from === 1 && a.type === 'V');
    const scores = readingScores(chart.field, BONDS)[1];
    const detCell = noun.chloroplast.cells.find((c) => c.from === 0);
    const verbDet = verb.chloroplast.cells.find((c) => c.from === 0);
    expect(detCell.voltage).toBeGreaterThan(verbDet.voltage);
    expect(scores[0].type).toBe('N');
    expect(scores.find((s) => s.type === 'N').score)
      .toBeGreaterThan(scores.find((s) => s.type === 'V').score);
  });

  it('does not drop a reading when the panels report', () => {
    const dark = atomsFor('round', 1, pos).map((a) => a.type).sort();
    const chart = compose(['the', 'round', 'fell'], pos);
    const lit = readingScores(chart.field, BONDS)[1].map((s) => s.type).sort();
    expect(lit).toEqual(dark);
  });

  it('scores a derivation head from that atom\'s panel, not a string lookup', () => {
    const chart = composePacked(['the', 'round', 'fell'], pos);
    const picked = pickResonantDerivation(chart.stable[0], chart.field, BONDS);
    expect(picked).toBeTruthy();
    const verbAtom = chart.atoms.find((a) => (
      a.from === picked.verbHead.from && a.type === picked.verbHead.type
    ));
    expect(Array.isArray(verbAtom.chloroplast.cells)).toBe(true);
    expect(String(picked.answer.verb).toLowerCase()).toBe('fell');
  });
});

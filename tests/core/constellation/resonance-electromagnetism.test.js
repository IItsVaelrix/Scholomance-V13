/**
 * Voltage is charge. Rivals at one span repel. Complementary cell-winners
 * attract. Molecules self-organize; the chart is not pruned.
 *
 * Production change that would make these fail: same-span N and V attracting,
 * or a complementary DET-noun / object-verb pair repelling, or organize
 * dropping a reading the chart minted.
 */
import { describe, it, expect } from 'vitest';
import { atomsFor, BONDS, compose } from '../../../codex/core/constellation/compose.js';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';
import {
  coulomb,
  stampCharges,
  organizeDerivation,
} from '../../../codex/core/constellation/electromagnetism.js';
import {
  pickResonantDerivation,
  readingScores,
} from '../../../codex/core/constellation/resonance-beacon.js';

const pos = new Map([
  ['the', []],
  ['round', ['n', 'v', 'a', 'r']],
  ['fell', ['n', 'v']],
]);

describe('voltage is charge', () => {
  it('stamps charge from uniquely won cells, not summed wattage', () => {
    const chart = composePacked(['the', 'round', 'fell'], pos);
    stampCharges(chart.field);
    const noun = chart.atoms.find((a) => a.from === 1 && a.type === 'N');
    const verb = chart.atoms.find((a) => a.from === 1 && a.type === 'V');
    expect(noun.charge).toBeGreaterThan(verb.charge);
    expect(Array.isArray(noun.wonCells)).toBe(true);
    expect(noun.wonCells.some((c) => c.from === 0)).toBe(true);
  });
});

describe('electromagnetism organizes, it does not prune', () => {
  it('rivals at one span repel', () => {
    const chart = composePacked(['the', 'round', 'fell'], pos);
    stampCharges(chart.field);
    const noun = chart.atoms.find((a) => a.from === 1 && a.type === 'N');
    const verb = chart.atoms.find((a) => a.from === 1 && a.type === 'V');
    expect(coulomb(noun, verb)).toBeLessThan(0);
  });

  it('complementary cell-winners attract — epistemic correlation, not a type table', () => {
    const chart = composePacked(['the', 'round', 'fell'], pos);
    stampCharges(chart.field);
    const noun = chart.atoms.find((a) => a.from === 1 && a.type === 'N');
    const fell = chart.atoms.find((a) => a.from === 2 && a.type === 'V');
    expect(noun.charge).toBeGreaterThan(0);
    expect(fell.charge).toBeGreaterThan(0);
    expect(coulomb(noun, fell)).toBeGreaterThan(0);
  });

  it('does not drop a reading when the field organizes', () => {
    const dark = atomsFor('round', 1, pos).map((a) => a.type).sort();
    const chart = compose(['the', 'round', 'fell'], pos);
    stampCharges(chart.field);
    const lit = chart.atoms.filter((a) => a.from === 1).map((a) => a.type).sort();
    expect(lit).toEqual(dark);
    expect(chart.ranked).toHaveLength(chart.stable.length);
  });
});

describe('molecules self-organize by net attraction', () => {
  it('prefers the complementary clause over the inverted one', () => {
    const chart = composePacked(['the', 'round', 'fell'], pos);
    stampCharges(chart.field);
    const roundN = chart.atoms.find((a) => a.from === 1 && a.type === 'N');
    const fellV = chart.atoms.find((a) => a.from === 2 && a.type === 'V');
    const fellN = chart.atoms.find((a) => a.from === 2 && a.type === 'N');
    const roundV = chart.atoms.find((a) => a.from === 1 && a.type === 'V');
    const aligned = organizeDerivation([roundN, fellV]);
    const inverted = organizeDerivation([fellN, roundV]);
    expect(aligned).toBeGreaterThan(inverted);
  });

  it('the resonant pick follows the organized field', () => {
    const chart = composePacked(['the', 'round', 'fell'], pos);
    const picked = pickResonantDerivation(chart.stable[0], chart.field, BONDS);
    expect(String(picked.answer.subject).toLowerCase()).toBe('round');
    expect(String(picked.answer.verb).toLowerCase()).toBe('fell');
    expect(readingScores(chart.field, BONDS)[1][0].type).toBe('N');
  });
});

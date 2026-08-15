/**
 * Electrical circuit on the charged field. Zero charge is neutral, not
 * inert: a neutral node still sits in the circuit and can carry induced
 * potential. A sink seated as the feed is a load. POSS/P are impedance.
 *
 * Production change that would make these fail: treating q=0 as "no
 * atom", or picking care/back as the verb because they hold charge.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseConllu } from '../../../codex/core/constellation/treebank.js';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';
import { BONDS } from '../../../codex/core/constellation/compose.js';
import {
  polarity,
  inducedPotential,
  coulomb,
} from '../../../codex/core/constellation/electromagnetism.js';
import { pickResonantDerivation } from '../../../codex/core/constellation/resonance-beacon.js';

const FIXTURES = path.resolve('tests/qa/fixtures/constellation');
const records = parseConllu(readFileSync(path.join(FIXTURES, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(
  readFileSync(path.join(FIXTURES, 'treebank-gate-lexicon.json'), 'utf8'),
)));
const byText = (part) => records.find((r) => (r.text || '').includes(part));

const pos = new Map([
  ['the', []],
  ['round', ['n', 'v', 'a', 'r']],
  ['fell', ['n', 'v']],
]);

describe('zero charge is neutral, not inert', () => {
  it('names q=0 as neutral and still induces potential from charged neighbors', () => {
    const chart = composePacked(['the', 'round', 'fell'], pos);
    const noun = chart.atoms.find((a) => a.from === 1 && a.type === 'N');
    const neutral = { from: 0, charge: 0, wonCells: [] };
    expect(polarity(neutral)).toBe('neutral');
    expect(inducedPotential(neutral, chart.field)).toBeGreaterThan(0);
    expect(coulomb(neutral, noun)).toBe(0);
    expect(chart.atoms.some((atom) => atom.from === 0)).toBe(true);
  });
});

describe('current: the feed is a source, not a load', () => {
  it('picks Take, not care — care is a sink on Take\'s current', () => {
    const rec = byText('Take care.');
    const chart = composePacked(rec.tokens.map((t) => t.form), posMap);
    const picked = pickResonantDerivation(chart.stable[0], chart.field, BONDS);
    expect(String(picked.answer.verb).toLowerCase()).toBe('take');
    expect(picked.answer.subject).toBe(null);
  });

  it('picks moving, not back — back is a load on the prior source', () => {
    const rec = byText('moving back to Calgary');
    const chart = composePacked(rec.tokens.map((t) => t.form), posMap);
    const picked = pickResonantDerivation(chart.stable[0], chart.field, BONDS);
    expect(String(picked.answer.verb).toLowerCase()).toBe('moving');
  });

  it('does not invent a subject across a possessive capacitor', () => {
    const rec = byText("Today's Article");
    const chart = composePacked(rec.tokens.map((t) => t.form), posMap);
    const picked = pickResonantDerivation(chart.stable[0], chart.field, BONDS);
    expect(picked.answer.subject).toBe(null);
  });
});

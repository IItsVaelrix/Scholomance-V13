/**
 * Lawful unknown seeds.
 *
 * Production change that would make these fail: inventing a new bond pair,
 * typing a hole from gold UPOS, or seeding into a slot that already has atoms.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

import { composePacked } from '../../../codex/core/constellation/compose-packed.js';
import {
  LAWFUL_LEAF_SEED,
  lawfulComplementTypes,
  vacancyLockReject,
} from '../../../codex/core/constellation/lawful-unknown-seed.js';

const require = createRequire(import.meta.url);
const src = require('fs').readFileSync(
  require('path').resolve('codex/core/constellation/lawful-unknown-seed.js'),
  'utf8',
);

describe('lawful unknown seed', () => {
  it('does not consult the bond table or admit a pair', () => {
    expect(src).not.toMatch(/from ['"]\.\/compose\.js['"]/);
    expect(src).not.toMatch(/from ['"]\.\/bond-admission\.js['"]/);
  });

  it('names only lexical stand-ins existing carbon already eats', () => {
    expect(LAWFUL_LEAF_SEED.DET).toBe('N');
    expect(LAWFUL_LEAF_SEED.P).toBe('N');
    expect(LAWFUL_LEAF_SEED.POSS).toBe('N');
    expect(LAWFUL_LEAF_SEED.V).toBeUndefined();
  });

  it('seeds N when a left DET seeks right into an empty slot', () => {
    expect(lawfulComplementTypes(1, [
      { type: 'DET', from: 0 },
    ])).toEqual(['N']);
  });

  it('seeds nothing when the only neighbor does not seek', () => {
    expect(lawfulComplementTypes(1, [
      { type: 'N', from: 0 },
    ])).toEqual([]);
  });

  it('lets DET+hole form NP through existing carbon, not a new law', () => {
    const chart = composePacked(['the', 'qzxqzx'], new Map([['the', ['x']]]), {
      seedLawfulUnknowns: true,
    });
    const np = (chart.molecules || []).filter((m) => m.type === 'NP' && m.from === 0 && m.to === 1);
    expect(np.length).toBeGreaterThan(0);
    expect(np.some((m) => m.carbonProduct === true)).toBe(true);
    expect(chart.atoms.some((a) => a.from === 1 && a.type === 'N' && a.unknownSeed)).toBe(true);
  });

  it('locks the seed to its seeker — the free N cannot take a verb as subject', () => {
    const seed = { type: 'N', from: 1, to: 1, unknownSeed: true, soughtBy: { from: 0, to: 0, type: 'DET' } };
    const verb = { type: 'VP', from: 2, to: 2 };
    expect(vacancyLockReject(seed, verb)).toBe('vacancy-lock');
    const det = { type: 'DET', from: 0, to: 0 };
    expect(vacancyLockReject(det, seed)).toBeNull();
  });

  it('stays off unless opted in — the frozen gate must not buy vague coverage', () => {
    const chart = composePacked(['the', 'qzxqzx'], new Map([['the', ['x']]]));
    expect(chart.atoms.some((a) => a.from === 1 && a.type === 'N')).toBe(false);
  });

  it('does not seed a filled slot', () => {
    const chart = composePacked(['the', 'cat'], new Map([
      ['the', ['x']],
      ['cat', ['n']],
    ]), { seedLawfulUnknowns: true });
    const ns = chart.atoms.filter((a) => a.from === 1 && a.type === 'N');
    expect(ns).toHaveLength(1);
  });
});

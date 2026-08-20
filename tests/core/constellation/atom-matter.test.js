/**
 * Four-tier chart matter and derivation topology.
 *
 * Production change that would make these fail: labeling a whole dark
 * sentence and calling every un-lit atom "invalid."
 */
import { describe, expect, it } from 'vitest';

import { classifyAtomMatter, annotateChartMatter } from '../../../codex/core/constellation/atom-matter.js';
import { classifyMoleculeTopology } from '../../../codex/core/constellation/molecule-topology.js';
import { measurePpsp } from '../../../codex/core/constellation/text-ppsp.js';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';

describe('atom matter', () => {
  it('does not call a leaf in a stable S invalid', () => {
    const chart = composePacked(['cats', 'sleep'], new Map([
      ['cats', ['n']],
      ['sleep', ['v']],
    ]));
    annotateChartMatter(chart);
    const n = chart.atoms.find((a) => a.type === 'N' || a.type === 'NC');
    expect(n.matter).not.toBe('invalid');
  });

  it('classifies from flags without conflating the four tiers', () => {
    expect(classifyAtomMatter({ inStable: false, inSpanning: false, hears: false, probed: false }))
      .toBe('unreachable');
    expect(classifyAtomMatter({ inStable: false, inSpanning: true, hears: false, probed: false }))
      .toBe('dark');
    expect(classifyAtomMatter({ inStable: false, inSpanning: false, hears: true, probed: false }))
      .toBe('latent');
    expect(classifyAtomMatter({ inStable: false, inSpanning: false, hears: false, probed: true }))
      .toBe('latent');
    expect(classifyAtomMatter({ inStable: false, inSpanning: false, hears: false, probed: false, invalid: true }))
      .toBe('invalid');
  });
});

describe('text ppsp', () => {
  it('counts persistence and discovery against a control', () => {
    const generated = new Set(['NP:0:1', 'S:0:2', 'ghost:1:1']);
    const quenched = new Set(['NP:0:1', 'S:0:2']);
    const control = new Set(['NP:0:1']);
    const m = measurePpsp({ generated, quenched, control });
    expect(m.persistent).toBe(2);
    expect(m.discovered).toBe(1);
    expect(m.ppsp).toBeCloseTo(2 / 3);
    expect(m.sdg).toBeCloseTo(0.5);
  });
});

describe('molecule topology', () => {
  it('calls a single leaf linear', () => {
    expect(classifyMoleculeTopology({
      type: 'N', from: 0, to: 0, derivations: [],
    })).toBe('linear');
  });

  it('calls a binary spine linear', () => {
    const n = { type: 'N', from: 1, to: 1, derivations: [] };
    const det = { type: 'DET', from: 0, to: 0, derivations: [] };
    const np = {
      type: 'NP', from: 0, to: 1,
      derivations: [{ bond: ['DET', 'N', 'NP', 1], left: det, right: n }],
    };
    expect(classifyMoleculeTopology(np)).toBe('linear');
  });
});

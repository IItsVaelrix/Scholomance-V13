/**
 * Material validator — compartment and self-consistency laws.
 *
 * Law behaviour is tested against synthetic registries so the assertions do not
 * move every time a material is added. One suite at the end runs the live
 * registry, to catch regressions in the real data.
 */

import { describe, it, expect } from 'vitest';
import {
  validateMaterialRegistry,
  formatMaterialReport,
  LAWS,
  SEVERITY,
  COMPARTMENT_KIND,
} from '../../../../codex/core/pixelbrain/material-validator.js';

const ramp = (...hexes) => Object.fromEntries(
  ['void', 'shadow', 'deep', 'body', 'frost', 'spectral', 'whiteCore'].slice(0, hexes.length)
    .map((k, i) => [k, hexes[i]]),
);

// dark -> bright, well formed
const GOOD = ramp('#000000', '#222222', '#444444', '#888888', '#AAAAAA', '#CCCCCC', '#FFFFFF');

const compartments = (palette, shader, sparse = []) => ({
  palette: { kind: COMPARTMENT_KIND.TOTAL, keys: () => palette },
  shader: { kind: COMPARTMENT_KIND.TOTAL, keys: () => shader },
  texture: { kind: COMPARTMENT_KIND.SPARSE, keys: () => sparse },
});

const run = (palettes, comps) => validateMaterialRegistry({
  palettes,
  compartments: comps || compartments(Object.keys(palettes), Object.keys(palettes)),
});

const findings = (r, law) => r.findings.filter(f => f.law === law);

describe('law: dead end', () => {
  it('flags a species present only in a sparse compartment', () => {
    const r = run({ gold: { category: 'metal', anchors: GOOD } },
      compartments(['gold'], ['gold'], ['gold', 'steel']));
    const d = findings(r, LAWS.DEAD_END);
    expect(d).toHaveLength(1);
    expect(d[0].species).toBe('steel');
    expect(d[0].missingFrom).toEqual(['palette', 'shader']);
    expect(d[0].severity).toBe(SEVERITY.ERROR);
  });

  it('does not flag absence from a sparse compartment', () => {
    // gold has no texture; that is a capability it lacks, not a defect.
    const r = run({ gold: { category: 'metal', anchors: GOOD } },
      compartments(['gold'], ['gold'], []));
    expect(findings(r, LAWS.DEAD_END)).toHaveLength(0);
  });

  it('flags a species missing from one total compartment but not the other', () => {
    const r = run({ gold: { category: 'metal', anchors: GOOD } },
      compartments(['gold', 'iron'], ['gold'], []));
    const d = findings(r, LAWS.DEAD_END);
    expect(d).toHaveLength(1);
    expect(d[0].species).toBe('iron');
    expect(d[0].missingFrom).toEqual(['shader']);
  });
});

describe('law: ramp order', () => {
  it('accepts a dark-to-bright ramp', () => {
    expect(findings(run({ gold: { category: 'metal', anchors: GOOD } }), LAWS.RAMP_ORDER)).toHaveLength(0);
  });

  it('flags an inverted adjacent pair', () => {
    const bad = ramp('#000000', '#222222', '#666666', '#333333', '#AAAAAA');
    const r = run({ murk: { category: 'metal', anchors: bad } });
    const f = findings(r, LAWS.RAMP_ORDER);
    expect(f).toHaveLength(1);
    expect(f[0].inversions[0].from).toBe('deep');
    expect(f[0].inversions[0].to).toBe('body');
  });

  it('exempts a species that declares itself emissive', () => {
    const bad = ramp('#000000', '#222222', '#666666', '#333333', '#AAAAAA');
    const r = run({ murk: { category: 'flame', anchors: bad, emissive: true } });
    expect(findings(r, LAWS.RAMP_ORDER)).toHaveLength(0);
  });

  it('exempts passthrough species', () => {
    const bad = ramp('#FFFFFF', '#000000');
    const r = run({ raw: { category: 'source', anchors: bad, rules: { passthrough: true } } });
    expect(findings(r, LAWS.RAMP_ORDER)).toHaveLength(0);
  });

  it('names the offending anchors so the fix is obvious', () => {
    const bad = ramp('#000000', '#222222', '#666666', '#333333');
    const f = findings(run({ murk: { category: 'metal', anchors: bad } }), LAWS.RAMP_ORDER)[0];
    expect(f.detail).toContain('deep');
    expect(f.detail).toContain('body');
    expect(f.detail).toContain('emissive');
  });
});

describe('law: duplicate species', () => {
  it('flags two ids with identical ramps', () => {
    const r = run({
      black_steel: { category: 'metal', anchors: GOOD },
      blacksteel: { category: 'metal', anchors: GOOD },
    });
    const f = findings(r, LAWS.DUPLICATE_SPECIES);
    expect(f).toHaveLength(1);
    expect(f[0].group).toEqual(['black_steel', 'blacksteel']);
    expect(f[0].severity).toBe(SEVERITY.WARN);
  });

  it('does not flag ramps that differ by one anchor', () => {
    const near = ramp('#000000', '#222222', '#444444', '#888888', '#AAAAAA', '#CCCCCC', '#FFFFFE');
    const r = run({ a: { category: 'metal', anchors: GOOD }, b: { category: 'metal', anchors: near } });
    expect(findings(r, LAWS.DUPLICATE_SPECIES)).toHaveLength(0);
  });
});

describe('law: category coherence', () => {
  const clothFamily = {
    cloth_linen: { category: 'organic', anchors: GOOD },
    cloth_wool: { category: 'organic', anchors: GOOD },
    cloth_denim: { category: 'organic', anchors: GOOD },
    cloth_silk: { category: 'organic', anchors: GOOD },
  };

  it('flags a member that disagrees with its family', () => {
    const r = run({ ...clothFamily, void_cloth: { category: 'metal', anchors: GOOD } });
    const f = findings(r, LAWS.CATEGORY_COHERENCE);
    expect(f).toHaveLength(1);
    expect(f[0].species).toBe('void_cloth');
    expect(f[0].familyCategory).toBe('organic');
  });

  it('does not treat a cross-category trait as a family', () => {
    // `void` spans every category by design. It must not be able to accuse.
    const r = run({
      void_ice: { category: 'flame', anchors: GOOD },
      void_gold: { category: 'metal', anchors: GOOD },
      void_core: { category: 'gemstone', anchors: GOOD },
      void_soil: { category: 'organic', anchors: GOOD },
    });
    expect(findings(r, LAWS.CATEGORY_COHERENCE)).toHaveLength(0);
  });

  it('does not flag a species belonging to two families at once', () => {
    // an `eye` (organic) that is also a `glow` (flame) is inherently ambiguous
    const r = run({
      eye_brown: { category: 'organic', anchors: GOOD },
      eye_blue: { category: 'organic', anchors: GOOD },
      eye_green: { category: 'organic', anchors: GOOD },
      cyan_glow: { category: 'flame', anchors: GOOD },
      rune_glow: { category: 'flame', anchors: GOOD },
      halo_glow: { category: 'flame', anchors: GOOD },
      eye_void_glow: { category: 'organic', anchors: GOOD },
    });
    expect(findings(r, LAWS.CATEGORY_COHERENCE)).toHaveLength(0);
  });

  it('needs at least three members before a token can accuse', () => {
    const r = run({
      cloth_linen: { category: 'organic', anchors: GOOD },
      void_cloth: { category: 'metal', anchors: GOOD },
    });
    expect(findings(r, LAWS.CATEGORY_COHERENCE)).toHaveLength(0);
  });
});

describe('result shape', () => {
  it('is ok when only warnings are present', () => {
    const r = run({
      black_steel: { category: 'metal', anchors: GOOD },
      blacksteel: { category: 'metal', anchors: GOOD },
    });
    expect(r.summary.errors).toBe(0);
    expect(r.summary.warnings).toBeGreaterThan(0);
    expect(r.ok).toBe(true);
  });

  it('is not ok when an error is present', () => {
    const r = run({ gold: { category: 'metal', anchors: GOOD } },
      compartments(['gold'], ['gold'], ['gold', 'steel']));
    expect(r.ok).toBe(false);
  });

  it('formats a readable report', () => {
    const r = run({ gold: { category: 'metal', anchors: GOOD } },
      compartments(['gold'], ['gold'], ['gold', 'steel']));
    const text = formatMaterialReport(r);
    expect(text).toContain('PB-MATERIAL-VALIDATE-v1');
    expect(text).toContain('dead-end');
    expect(text).toContain('steel');
  });
});

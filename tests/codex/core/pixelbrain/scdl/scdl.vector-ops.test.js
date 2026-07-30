/**
 * SCDL Vector Op Tests
 */

import { describe, it, expect } from 'vitest';
import { parseSCDL, tokenize } from '../../../../../codex/core/pixelbrain/scdl/scdl.grammar.js';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { rasterizeSphere } from '../../../../../codex/core/pixelbrain/scdl/render/raster-core.js';

function sourceFor(body) {
  return `
asset vector_probe canvas 8x8
palette {
  shine = #FFFFFF
  glow = #CCCCCC
  core = #777777
  rim = #333333
  shadow = #000000
}
part body material source {
${body}
}
export json
`.trim();
}

function coordSet(result) {
  return new Set(result.packet.geometry.coordinates.map(c => `${c.x},${c.y}:${c.color}`));
}

describe('SCDL Vector Ops — parser', () => {
  it('tokenizes signed and decimal numeric literals', () => {
    const tokens = tokenize('sphere 3.5 4 radius 2 light -1 -1 shine glow core rim shadow');
    expect(tokens.some(t => t.type === 'INT' && t.value === '3.5')).toBe(true);
    expect(tokens.filter(t => t.type === 'INT' && t.value === '-1')).toHaveLength(2);
  });

  it('parses explicit negative sphere light vectors', () => {
    const { rawAst, errors } = parseSCDL(sourceFor('  sphere 4 4 radius 2 light -1 -1 shine glow core rim shadow'));
    expect(errors.filter(e => e.severity === 'ERROR')).toHaveLength(0);
    const op = rawAst.parts[0].ops[0];
    expect(op.lx).toBe(-1);
    expect(op.ly).toBe(-1);
  });
});

describe('SCDL Vector Ops — compiler', () => {
  it('lowers circle, ring, rect, polygon, path, and sphere to cells', () => {
    const result = compileSCDL(sourceFor(`
  circle 2 2 radius 1 core
  ring 4 4 radius 2 width 1 rim
  rect 0 6 2 2 glow
  polygon 5 0 7 0 6 2 shine
  path "M 1 1 L 3 1 L 2 3 Z" shadow
  sphere 4 4 radius 2 light -1 -1 shine glow core rim shadow
`));

    expect(result.ok).toBe(true);
    expect(result.ast.parts[0].ops.every(op => !['circle', 'ring', 'rect', 'polygon', 'path', 'sphere'].includes(op.op))).toBe(true);
    expect(result.packet.geometry.coordinates.length).toBeGreaterThan(20);
  });

  it('supports fractional vector coordinates without changing cell authority', () => {
    const result = compileSCDL(sourceFor('  circle 3.5 3.5 radius 1.5 core'));
    expect(result.ok).toBe(true);
    const cells = coordSet(result);
    expect(cells.has('3,3:#777777')).toBe(true);
    expect(cells.has('4,4:#777777')).toBe(true);
  });

  it('shades the sphere centre from a real hemisphere normal, not the darkest tier', () => {
    // The centre's normal points straight at the viewer, so it takes a mid tone.
    // It must never be the darkest tier: that was the signature of computing the
    // normal as dx/d (0/0 at the centre → NaN → every comparison false → tier 4).
    const result = compileSCDL(sourceFor('  sphere 4 4 radius 2 shine glow core rim shadow'));
    expect(result.ok).toBe(true);
    const centre = result.packet.geometry.coordinates.find(c => c.x === 4 && c.y === 4);
    expect(centre?.color).toBe('#777777');
    expect(centre?.color).not.toBe('#000000');
  });

  it('varies tone with distance from the centre, not only with angle around it', () => {
    // A pinwheel is constant along any ray from the centre. A sphere is not.
    const r = 9;
    const result = compileSCDL(`
asset lambert_probe canvas 21x21
palette {
  shine = #FFFFFF
  glow = #CCCCCC
  core = #777777
  rim = #333333
  shadow = #000000
}
part orb material source {
  sphere 10 10 radius ${r} light -1 -1 shine glow core rim shadow
}
export json
`.trim());
    expect(result.ok).toBe(true);
    const at = (x, y) => result.packet.geometry.coordinates.find(c => c.x === x && c.y === y)?.color;

    // Walk toward the light: mid at the centre, brightening into the highlight.
    const towardLight = [0, 1, 2, 3, 4, 5].map(i => at(10 - i, 10 - i));
    expect(new Set(towardLight).size).toBeGreaterThan(1);
    expect(towardLight).toContain('#FFFFFF');

    // Walk away from the light: must darken, and must not be uniform.
    const awayFromLight = [1, 2, 3, 4, 5, 6].map(i => at(10 + i, 10 + i));
    expect(new Set(awayFromLight).size).toBeGreaterThan(1);
    expect(awayFromLight.at(-1)).toBe('#000000');
  });

  it('reaches all five tiers, keeping the highlight small but present', () => {
    const result = compileSCDL(`
asset lambert_probe canvas 21x21
palette {
  shine = #FFFFFF
  glow = #CCCCCC
  core = #777777
  rim = #333333
  shadow = #000000
}
part orb material source {
  sphere 10 10 radius 9 light -1 -1 shine glow core rim shadow
}
export json
`.trim());
    const coords = result.packet.geometry.coordinates;
    const share = hex => coords.filter(c => c.color === hex).length / coords.length;

    for (const hex of ['#FFFFFF', '#CCCCCC', '#777777', '#333333', '#000000']) {
      expect(share(hex), `tier ${hex} unreachable`).toBeGreaterThan(0);
    }
    // A highlight that covers a third of the disc is not a highlight; one that
    // covers a single cell is not visible at pixel-art sizes.
    expect(share('#FFFFFF')).toBeGreaterThan(0.02);
    expect(share('#FFFFFF')).toBeLessThan(0.15);
  });

  it('puts the highlight on the lit side of the centre', () => {
    const result = compileSCDL(`
asset lambert_probe canvas 21x21
palette {
  shine = #FFFFFF
  glow = #CCCCCC
  core = #777777
  rim = #333333
  shadow = #000000
}
part orb material source {
  sphere 10 10 radius 9 light -1 -1 shine glow core rim shadow
}
export json
`.trim());
    const lit = result.packet.geometry.coordinates.filter(c => c.color === '#FFFFFF');
    expect(lit.length).toBeGreaterThan(0);
    // light is (-1,-1) → up and left in screen space, so every highlight cell
    // sits above-left of the centre.
    for (const c of lit) {
      expect(c.x).toBeLessThan(10);
      expect(c.y).toBeLessThan(10);
    }
  });

  it('refuses a zero light vector rather than shading from a degenerate normal', () => {
    const result = compileSCDL(sourceFor('  sphere 4 4 radius 2 light 0 0 shine glow core rim shadow'));
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => /light vector/i.test(e.message))).toBe(true);
  });

  it('emits no NaN-coloured cells when called directly with a zero light vector', () => {
    // rasterizeSphere is exported and reached by scene-graph-renderer, so the
    // 0/0 hazard has to be closed in the rasterizer too, not only in validation.
    const ops = [];
    rasterizeSphere(
      { cx: 4, cy: 4, radius: 3, lx: 0, ly: 0, tierColors: ['#FFFFFF', '#CCCCCC', '#777777', '#333333', '#000000'], loc: {} },
      () => true,
      ops,
    );
    expect(ops.length).toBeGreaterThan(0);
    for (const op of ops) {
      expect(op.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    // head-on light: brightest at the centre, dimmer at the edge
    const at = (x, y) => ops.find(o => o.x === x && o.y === y)?.color;
    expect(at(4, 4)).toBe('#FFFFFF');
    expect(at(1, 4)).toBe(at(7, 4));
    expect(at(1, 4)).not.toBe('#FFFFFF');
  });

  it('applies symmetry after vector rasterization', () => {
    const result = compileSCDL(sourceFor(`
  symmetry xy
  circle 1 1 radius 0.5 core
`));
    expect(result.ok).toBe(true);
    expect(result.ast.parts[0]._symmetryApplied).toBe('radial');
    const cells = coordSet(result);
    expect(cells.has('1,1:#777777')).toBe(true);
    expect(cells.has('6,1:#777777')).toBe(true);
    expect(cells.has('1,6:#777777')).toBe(true);
    expect(cells.has('6,6:#777777')).toBe(true);
  });

  it('flattens cubic and smooth path commands deterministically', () => {
    const src = sourceFor('  path "M 1 6 C 2 1 5 1 6 6 S 7 7 7 3 Z" core');
    const a = compileSCDL(src);
    const b = compileSCDL(src);
    expect(a.ok).toBe(true);
    expect(a.packet.geometry.coordinates.length).toBeGreaterThan(0);
    expect(a.packet.id).toBe(b.packet.id);
  });

  it('reports invalid vector parameters as SCDL-011', () => {
    const result = compileSCDL(sourceFor('  circle 4 4 radius 0 core'));
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.label === 'SCDL-011')).toBe(true);
  });
});

/**
 * SCDL Vector Op Tests
 */

import { describe, it, expect } from 'vitest';
import { parseSCDL, tokenize } from '../../../../../codex/core/pixelbrain/scdl/scdl.grammar.js';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';

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

  it('makes the sphere center tier explicit instead of relying on NaN comparisons', () => {
    const result = compileSCDL(sourceFor('  sphere 4 4 radius 2 shine glow core rim shadow'));
    expect(result.ok).toBe(true);
    const center = result.packet.geometry.coordinates.find(c => c.x === 4 && c.y === 4);
    expect(center?.color).toBe('#000000');
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

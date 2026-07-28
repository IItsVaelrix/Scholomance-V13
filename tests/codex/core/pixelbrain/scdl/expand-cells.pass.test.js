/**
 * SCDL Expand Cells Pass — Tests
 *
 * Covers all 8 compass rim directions, bounds validation,
 * and the south-corner OOB regression (cornerCells y+1 → y=h).
 */

import { describe, it, expect } from 'vitest';
import { expandCellsPass } from '../../../../../codex/core/pixelbrain/scdl/passes/expand-cells.pass.js';
import { SCDL_ERROR_CODES } from '../../../../../codex/core/pixelbrain/scdl/scdl.errors.js';

const W = 24;
const H = 20;

/** Build a minimal AST with a single part containing one rim op at the given compass. */
function rimAst(compass, w = W, h = H) {
  return {
    contract: 'SCDL-AST-v1',
    version: '1.2.0',
    asset: 'test',
    canvas: { width: w, height: h },
    sourceLocation: { line: 1, col: 1 },
    parts: [{
      id: 'body',
      material: 'obsidian',
      ops: [{ op: 'rim', compass, color: '#ffffff', id: 'rim1', loc: { line: 2, col: 3 } }],
    }],
  };
}

/** Run expandCellsPass and return { coords, errors }. */
function expand(compass, w, h) {
  const errors = [];
  const ast = expandCellsPass(rimAst(compass, w, h), errors);
  const coords = ast.parts[0].coordinates;
  return { coords, errors };
}

const ALL_COMPASSES = [
  'north', 'south', 'east', 'west',
  'north west', 'north east', 'south west', 'south east',
];

describe('expandCellsPass — rim compass coverage', () => {
  it.each(ALL_COMPASSES)('rim at "%s" emits zero errors on a %dx%d canvas', (compass) => {
    const { errors } = expand(compass, W, H);
    expect(errors).toHaveLength(0);
  });

  it.each(ALL_COMPASSES)('rim at "%s" emits only in-bounds cells', (compass) => {
    const { coords } = expand(compass, W, H);
    expect(coords.length).toBeGreaterThan(0);
    for (const c of coords) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(W);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(H);
    }
  });

  it('north rim covers the full top row', () => {
    const { coords } = expand('north');
    expect(coords).toHaveLength(W);
    expect(coords.every(c => c.y === 0)).toBe(true);
    const xs = coords.map(c => c.x).sort((a, b) => a - b);
    expect(xs).toEqual(Array.from({ length: W }, (_, i) => i));
  });

  it('south rim covers the full bottom row', () => {
    const { coords } = expand('south');
    expect(coords).toHaveLength(W);
    expect(coords.every(c => c.y === H - 1)).toBe(true);
  });

  it('west rim covers the full left column', () => {
    const { coords } = expand('west');
    expect(coords).toHaveLength(H);
    expect(coords.every(c => c.x === 0)).toBe(true);
  });

  it('east rim covers the full right column', () => {
    const { coords } = expand('east');
    expect(coords).toHaveLength(H);
    expect(coords.every(c => c.x === W - 1)).toBe(true);
  });
});

describe('expandCellsPass — corner cells', () => {
  it('north west emits 3 cells: corner, east neighbour, south neighbour', () => {
    const { coords } = expand('north west');
    expect(coords).toHaveLength(3);
    const set = new Set(coords.map(c => `${c.x},${c.y}`));
    expect(set.has('0,0')).toBe(true);   // corner
    expect(set.has('1,0')).toBe(true);   // east neighbour
    expect(set.has('0,1')).toBe(true);   // south (inward) neighbour
  });

  it('north east emits 3 cells: corner, west neighbour, south neighbour', () => {
    const { coords } = expand('north east');
    expect(coords).toHaveLength(3);
    const set = new Set(coords.map(c => `${c.x},${c.y}`));
    expect(set.has(`${W - 1},0`)).toBe(true);
    expect(set.has(`${W - 2},0`)).toBe(true);
    expect(set.has(`${W - 1},1`)).toBe(true);
  });

  it('south west emits 3 cells: corner, east neighbour, NORTH (inward) neighbour', () => {
    const { coords, errors } = expand('south west');
    expect(errors).toHaveLength(0);
    expect(coords).toHaveLength(3);
    const set = new Set(coords.map(c => `${c.x},${c.y}`));
    expect(set.has(`0,${H - 1}`)).toBe(true);     // corner
    expect(set.has(`1,${H - 1}`)).toBe(true);     // east neighbour
    expect(set.has(`0,${H - 2}`)).toBe(true);     // north (inward) neighbour — NOT y=H
    // Regression: y=H must NOT appear
    expect(set.has(`0,${H}`)).toBe(false);
  });

  it('south east emits 3 cells: corner, west neighbour, NORTH (inward) neighbour', () => {
    const { coords, errors } = expand('south east');
    expect(errors).toHaveLength(0);
    expect(coords).toHaveLength(3);
    const set = new Set(coords.map(c => `${c.x},${c.y}`));
    expect(set.has(`${W - 1},${H - 1}`)).toBe(true);
    expect(set.has(`${W - 2},${H - 1}`)).toBe(true);
    expect(set.has(`${W - 1},${H - 2}`)).toBe(true);
    expect(set.has(`${W - 1},${H}`)).toBe(false);
  });

  it('south corners on a 1-row canvas still stay in bounds', () => {
    // Degenerate: h=1, south row = north row. inwardY = y-1 = -1 → filtered out.
    const { coords, errors } = expand('south west', 8, 1);
    expect(errors).toHaveLength(0);
    for (const c of coords) {
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(1);
    }
  });
});

describe('expandCellsPass — bounds validation', () => {
  it('explicit cell op outside canvas pushes CELL_OUT_OF_BOUNDS error', () => {
    const errors = [];
    const ast = {
      contract: 'SCDL-AST-v1',
      version: '1.2.0',
      asset: 'test',
      canvas: { width: 8, height: 8 },
      sourceLocation: { line: 1, col: 1 },
      parts: [{
        id: 'gem',
        material: 'source',
        ops: [{ op: 'cell', x: 10, y: 3, color: '#ff0000', id: 'c1', loc: { line: 2, col: 3 } }],
      }],
    };
    expandCellsPass(ast, errors);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].code).toBe(SCDL_ERROR_CODES.CELL_OUT_OF_BOUNDS);
  });

  it('explicit cell op at canvas edge is accepted', () => {
    const errors = [];
    const ast = {
      contract: 'SCDL-AST-v1',
      version: '1.2.0',
      asset: 'test',
      canvas: { width: 8, height: 8 },
      sourceLocation: { line: 1, col: 1 },
      parts: [{
        id: 'gem',
        material: 'source',
        ops: [{ op: 'cell', x: 7, y: 7, color: '#ff0000', id: 'c1', loc: { line: 2, col: 3 } }],
      }],
    };
    const result = expandCellsPass(ast, errors);
    expect(errors).toHaveLength(0);
    expect(result.parts[0].coordinates).toHaveLength(1);
  });
});

describe('expandCellsPass — fill and glow intents', () => {
  it('fill op emits a fill-intent coordinate at canvas center', () => {
    const errors = [];
    const ast = {
      contract: 'SCDL-AST-v1',
      version: '1.2.0',
      asset: 'test',
      canvas: { width: 24, height: 20 },
      sourceLocation: { line: 1, col: 1 },
      parts: [{
        id: 'bg',
        material: 'obsidian',
        ops: [{ op: 'fill', color: '#191C2D', id: 'f1' }],
      }],
    };
    const result = expandCellsPass(ast, errors);
    const coords = result.parts[0].coordinates;
    expect(coords).toHaveLength(1);
    expect(coords[0].role).toBe('fill-intent');
    expect(coords[0].x).toBe(12);
    expect(coords[0].y).toBe(10);
    expect(coords[0]._fillIntent).toBe(true);
  });

  it('glow op emits a noise descriptor, no cells', () => {
    const errors = [];
    const ast = {
      contract: 'SCDL-AST-v1',
      version: '1.2.0',
      asset: 'test',
      canvas: { width: 8, height: 8 },
      sourceLocation: { line: 1, col: 1 },
      parts: [{
        id: 'aura',
        material: 'source',
        ops: [{ op: 'glow', radius: 3, id: 'g1' }],
      }],
    };
    const result = expandCellsPass(ast, errors);
    expect(result.parts[0].coordinates).toHaveLength(0);
    expect(result.parts[0].noiseDescriptors).toHaveLength(1);
    expect(result.parts[0].noiseDescriptors[0].contract).toBe('PB-NOISE-v1');
  });
});

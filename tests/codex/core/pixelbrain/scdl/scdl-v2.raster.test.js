import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { rasterizeCircleCenter, rasterizeCircleMidpoint, compositeSCDLV2Layers, rasterizeSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.raster.js';
import { evaluateSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.evaluator.js';
import { parseSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js';
import { analyzeSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.analyzer.js';
import { verifySCDLV2Budget } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.budget.js';
import { lowerSCDLV2Bytecode } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.bytecode.js';
import { makeRational } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js';

describe('SCDL v2 raster kernel', () => {
  function runRasterSubprocess(constructionSource, budgetSource) {
    const script = `
      import { rasterizeSCDLV2 } from './codex/core/pixelbrain/scdl/v2/scdl-v2.raster.js';
      const construction = ${constructionSource};
      const budget = ${budgetSource};
      const result = rasterizeSCDLV2(construction, { width: 1, height: 1 }, budget);
      process.stdout.write(JSON.stringify({ ok: result.ok, code: result.diagnostics[0]?.code }));
    `;
    return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 750,
      maxBuffer: 1024 * 1024,
    });
  }

  it('rasterizes a radius-2 midpoint disc symmetrically', () => {
    const cells = rasterizeCircleMidpoint({ x: 4, y: 4 }, 2);
    const keys = cells.map(({ x, y }) => `${x},${y}`).sort();
    expect(keys).toEqual([
      '2,4', '3,3', '3,4', '3,5', '4,2', '4,3', '4,4', '4,5', '4,6',
      '5,3', '5,4', '5,5', '6,4',
    ]);
    for (const { x, y } of cells) {
      expect(keys).toContain(`${8 - x},${y}`);
      expect(keys).toContain(`${x},${8 - y}`);
    }
  });

  it('matches an independent exact center-inclusion oracle', () => {
    const actual = rasterizeCircleCenter({ x: { numerator: '4', denominator: '1' }, y: { numerator: '4', denominator: '1' } }, { numerator: '2', denominator: '1' });
    const expected = [];
    for (let y = 0; y <= 8; y += 1) for (let x = 0; x <= 8; x += 1) {
      if ((x - 4) ** 2 + (y - 4) ** 2 <= 4) expected.push(`${x},${y}`);
    }
    expect(actual.map(({ x, y }) => `${x},${y}`).sort()).toEqual(expected.sort());
  });

  it('clips and composites by layer order then paint order', () => {
    const result = compositeSCDLV2Layers({ width: 2, height: 2 }, [
      { id: 'top', order: 20, paints: [{ shape: { kind: 'PIXEL', at: { x: 0, y: 0 } }, fill: '#ffffff', raster: 'CENTER' }] },
      { id: 'base', order: 10, paints: [{ shape: { kind: 'PIXEL', at: { x: 0, y: 0 } }, fill: '#000000', raster: 'CENTER' }, { shape: { kind: 'PIXEL', at: { x: 9, y: 9 } }, fill: '#ff0000', raster: 'CENTER' }] },
    ]);
    expect(result.coordinates).toEqual([{ x: 0, y: 0, color: '#ffffff', partId: 'top', role: 'paint' }]);
  });

  it('stops when a forged verified program crosses its runtime instruction limit', () => {
    const program = Object.freeze({
      constants: Object.freeze([{ index: 0, type: 'I32', value: '1' }]),
      instructions: Object.freeze([{ index: 0, opcodeId: 0x8000, mnemonic: 'BC.CONST', result: '%0', type: 'I32', operands: [{ kind: 'constant', index: 0 }] }]),
      verifiedBudget: Object.freeze({ limits: Object.freeze({ instructions: 0, generatedShapes: 0, rasterCells: 0 }) }),
    });
    const result = evaluateSCDLV2(program);
    expect(result.ok).toBe(false);
    expect(result.construction).toBeNull();
    expect(result.diagnostics[0].code).toBe('SCDL-BUDGET-003');
  });

  // --- Additional coverage beyond the brief's baseline ------------------

  describe('MIDPOINT policy edge cases', () => {
    it('a zero-radius circle emits exactly its center cell', () => {
      const cells = rasterizeCircleMidpoint({ x: 5, y: 7 }, 0);
      expect(cells).toEqual([{ x: 5, y: 7 }]);
    });

    it('produces a symmetric radius-3 disc (28 or fewer cells than the naive exact disc, by design)', () => {
      // Hand-derived trace (see scdl-v2.raster.js's module comment): MIDPOINT's
      // octant-symmetry fill picks dx in [-1, 1] at |dy| = 2 for radius 3,
      // where the exact CENTER policy would pick dx in [-2, 2]. This is the
      // documented, intentional divergence between the two named algorithms,
      // not a bug — assert MIDPOINT's actual (smaller) row width directly.
      const cells = rasterizeCircleMidpoint({ x: 10, y: 10 }, 3);
      const row = cells.filter((c) => c.y === 12).map((c) => c.x).sort((a, b) => a - b);
      expect(row).toEqual([9, 10, 11]);
      const centerRow = cells.filter((c) => c.y === 10).map((c) => c.x).sort((a, b) => a - b);
      expect(centerRow).toEqual([7, 8, 9, 10, 11, 12, 13]);
    });

    it('produces exactly one row/column for radius 1', () => {
      const cells = rasterizeCircleMidpoint({ x: 0, y: 0 }, 1);
      const keys = cells.map(({ x, y }) => `${x},${y}`).sort();
      expect(keys).toEqual(['-1,0', '0,-1', '0,0', '0,1', '1,0']);
    });
  });

  describe('CENTER policy with non-integral centers/radii', () => {
    it('accepts a half-integer center and includes cells the exact distance test admits', () => {
      // Center (2.5, 2.5), radius 1.5: (x-2.5)^2 + (y-2.5)^2 <= 2.25.
      const half = makeRational(5n, 2n); // 5/2
      const radius = makeRational(3n, 2n); // 3/2
      const cells = rasterizeCircleCenter({ x: half, y: half }, radius);
      const expected = [];
      for (let y = 0; y <= 5; y += 1) for (let x = 0; x <= 5; x += 1) {
        if ((x - 2.5) ** 2 + (y - 2.5) ** 2 <= 2.25 + 1e-9) expected.push(`${x},${y}`);
      }
      expect(cells.map(({ x, y }) => `${x},${y}`).sort()).toEqual(expected.sort());
    });

    it('a zero-radius circle at a non-integral center admits no cells (no integer point is exactly at distance 0)', () => {
      const half = makeRational(5n, 2n);
      const cells = rasterizeCircleCenter({ x: half, y: half }, makeRational(0n));
      expect(cells).toEqual([]);
    });

    it('a zero-radius circle at an integral center admits exactly that cell', () => {
      const cells = rasterizeCircleCenter({ x: makeRational(4n), y: makeRational(4n) }, makeRational(0n));
      expect(cells).toEqual([{ x: 4, y: 4 }]);
    });

    it('accepts a non-integral radius (e.g. sqrt-adjacent 5/2) and matches brute-force inclusion', () => {
      const center = { x: makeRational(0n), y: makeRational(0n) };
      const radius = makeRational(5n, 2n); // 2.5
      const cells = rasterizeCircleCenter(center, radius);
      const expected = [];
      for (let y = -3; y <= 3; y += 1) for (let x = -3; x <= 3; x += 1) {
        if (x * x + y * y <= 6.25 + 1e-9) expected.push(`${x},${y}`);
      }
      expect(cells.map(({ x, y }) => `${x},${y}`).sort()).toEqual(expected.sort());
    });
  });

  describe('raster policy rejection (SCDL-GEOM-001)', () => {
    it.each([
      ['missing', undefined],
      ['unknown', 'BOGUS'],
    ])('rejects a PIXEL with a %s raster policy without partial output', (_label, raster) => {
      const result = compositeSCDLV2Layers({ width: 8, height: 8 }, [
        { id: 'l', order: 0, paints: [{ shape: { kind: 'PIXEL', at: { x: 1, y: 1 } }, fill: '#fff', raster }] },
      ]);
      expect(result.ok).toBe(false);
      expect(result.coordinates).toBeNull();
      expect(result.layers).toBeNull();
      expect(result.diagnostics[0].code).toBe('SCDL-GEOM-001');
    });

    it('rejects a PIXEL with a non-integral coordinate', () => {
      const result = compositeSCDLV2Layers({ width: 8, height: 8 }, [
        { id: 'l', order: 0, paints: [{ shape: { kind: 'PIXEL', at: { x: makeRational(5n, 2n), y: 0 } }, fill: '#fff', raster: 'CENTER' }] },
      ]);
      expect(result.ok).toBe(false);
      expect(result.diagnostics[0].code).toBe('SCDL-GEOM-001');
    });

    it('rejects a MIDPOINT circle with a non-integral center', () => {
      const result = compositeSCDLV2Layers({ width: 8, height: 8 }, [
        { id: 'l', order: 0, paints: [{ shape: { kind: 'CIRCLE', center: { x: makeRational(5n, 2n), y: makeRational(4n) }, radius: makeRational(2n) }, fill: '#fff', raster: 'MIDPOINT' }] },
      ]);
      expect(result.ok).toBe(false);
      expect(result.diagnostics[0].code).toBe('SCDL-GEOM-001');
      expect(result.diagnostics[0].relatedSymbols).toContain('MIDPOINT');
    });

    it('rejects a MIDPOINT circle with a non-integral radius, naming exact received values', () => {
      const result = compositeSCDLV2Layers({ width: 8, height: 8 }, [
        { id: 'l', order: 0, paints: [{ shape: { kind: 'CIRCLE', center: { x: makeRational(4n), y: makeRational(4n) }, radius: makeRational(5n, 2n) }, fill: '#fff', raster: 'MIDPOINT' }] },
      ]);
      expect(result.ok).toBe(false);
      expect(result.diagnostics[0].code).toBe('SCDL-GEOM-001');
      // Exact received text, not a lossy float ("2.5"): the rational's own textual form.
      expect(result.diagnostics[0].received.join(' ')).toContain('5/2');
    });

    it('rejects an unrecognized shape kind', () => {
      const result = compositeSCDLV2Layers({ width: 8, height: 8 }, [
        { id: 'l', order: 0, paints: [{ shape: { kind: 'SQUARE' }, fill: '#fff', raster: 'CENTER' }] },
      ]);
      expect(result.ok).toBe(false);
      expect(result.diagnostics[0].code).toBe('SCDL-GEOM-001');
    });

    it('rejects an unrecognized raster policy', () => {
      const result = compositeSCDLV2Layers({ width: 8, height: 8 }, [
        { id: 'l', order: 0, paints: [{ shape: { kind: 'CIRCLE', center: { x: 4, y: 4 }, radius: 2 }, fill: '#fff', raster: 'BOGUS' }] },
      ]);
      expect(result.ok).toBe(false);
      expect(result.diagnostics[0].code).toBe('SCDL-GEOM-001');
    });

    it('rejects an exact integer coordinate outside the safe lattice range', () => {
      const result = compositeSCDLV2Layers({ width: 8, height: 8 }, [
        { id: 'l', order: 0, paints: [{
          shape: { kind: 'PIXEL', at: { x: { numerator: '9007199254740992', denominator: '1' }, y: 0 } },
          fill: '#fff',
          raster: 'CENTER',
        }] },
      ]);
      expect(result.ok).toBe(false);
      expect(result.coordinates).toBeNull();
      expect(result.diagnostics[0].code).toBe('SCDL-GEOM-001');
    });

    it('rejects an unsafe exact radius promptly before lattice iteration', () => {
      const child = runRasterSubprocess(
        `{ layers: [{ id: 'l', order: 0, sourceIndex: 0, paints: [{ shape: { kind: 'CIRCLE', center: { x: 0, y: 0 }, radius: { numerator: '9007199254740992', denominator: '1' } }, fill: '#fff', raster: 'CENTER' }] }] }`,
        `{ limits: { instructions: 10, generatedShapes: 1, rasterCells: 1 } }`,
      );
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(0);
      expect(JSON.parse(child.stdout)).toEqual({ ok: false, code: 'SCDL-GEOM-001' });
    });
  });

  describe('PIXEL-only compositing', () => {
    it('uses persisted sourceIndex to break equal-order ties even when the layer array is reversed', () => {
      const result = compositeSCDLV2Layers({ width: 2, height: 2 }, [
        { id: 'later', order: 10, sourceIndex: 1, paints: [{ shape: { kind: 'PIXEL', at: { x: 0, y: 0 } }, fill: '#ffffff', raster: 'CENTER' }] },
        { id: 'earlier', order: 10, sourceIndex: 0, paints: [{ shape: { kind: 'PIXEL', at: { x: 0, y: 0 } }, fill: '#000000', raster: 'CENTER' }] },
      ]);
      expect(result.ok).toBe(true);
      expect(result.coordinates).toEqual([{ x: 0, y: 0, color: '#ffffff', partId: 'later', role: 'paint' }]);
      expect(result.layers.map((layer) => layer.sourceIndex)).toEqual([0, 1]);
    });

    it('composites two non-overlapping pixels from a single layer, both surviving', () => {
      const result = compositeSCDLV2Layers({ width: 4, height: 4 }, [
        { id: 'dots', order: 0, paints: [
          { shape: { kind: 'PIXEL', at: { x: 0, y: 0 } }, fill: '#111111', raster: 'CENTER' },
          { shape: { kind: 'PIXEL', at: { x: 3, y: 3 } }, fill: '#222222', raster: 'CENTER' },
        ] },
      ]);
      expect(result.ok).toBe(true);
      expect(result.coordinates).toEqual([
        { x: 0, y: 0, color: '#111111', partId: 'dots', role: 'paint' },
        { x: 3, y: 3, color: '#222222', partId: 'dots', role: 'paint' },
      ]);
    });

    it('last paint wins when two pixels in the SAME layer target the same cell', () => {
      const result = compositeSCDLV2Layers({ width: 2, height: 2 }, [
        { id: 'l', order: 0, paints: [
          { shape: { kind: 'PIXEL', at: { x: 1, y: 1 } }, fill: '#111111', raster: 'CENTER' },
          { shape: { kind: 'PIXEL', at: { x: 1, y: 1 } }, fill: '#222222', raster: 'CENTER' },
        ] },
      ]);
      expect(result.coordinates).toEqual([{ x: 1, y: 1, color: '#222222', partId: 'l', role: 'paint' }]);
    });

    it('returns coordinates sorted y-major/x-minor regardless of paint/layer order', () => {
      const result = compositeSCDLV2Layers({ width: 4, height: 4 }, [
        { id: 'l', order: 0, paints: [
          { shape: { kind: 'PIXEL', at: { x: 3, y: 0 } }, fill: '#a', raster: 'CENTER' },
          { shape: { kind: 'PIXEL', at: { x: 0, y: 2 } }, fill: '#b', raster: 'CENTER' },
          { shape: { kind: 'PIXEL', at: { x: 1, y: 0 } }, fill: '#c', raster: 'CENTER' },
        ] },
      ]);
      expect(result.coordinates.map((c) => `${c.x},${c.y}`)).toEqual(['1,0', '3,0', '0,2']);
    });
  });

  describe('rasterizeSCDLV2 end-to-end via the real evaluator and bytecode pipeline', () => {
    function compile(source, options = {}) {
      const analysis = analyzeSCDLV2(parseSCDLV2(source).ast);
      const budget = verifySCDLV2Budget(analysis.ir, options);
      const program = budget.ok ? lowerSCDLV2Bytecode(analysis.ir, budget.verified) : null;
      return { analysis, budget, program };
    }

    it('evaluates and rasterizes a MIDPOINT circle end-to-end matching the golden disc', () => {
      const source = `SCDL 2
ASSET disc
CANVAS WIDTH 9 HEIGHT 9
CONST $c VEC2 (VEC2 (PX 4) (PX 4))
SHAPE $s (CIRCLE CENTER $c RADIUS (PX 2))
LAYER ink ORDER 10 { PAINT $s FILL #55CCFF RASTER MIDPOINT }`;
      const { program } = compile(source);
      expect(program).not.toBeNull();

      const evaluated = evaluateSCDLV2(program);
      expect(evaluated.ok).toBe(true);
      expect(evaluated.construction.layers.length).toBe(1);
      expect(evaluated.counters.generatedShapes).toBe(1);

      const rasterized = rasterizeSCDLV2(evaluated.construction, program.canvas, program.verifiedBudget);
      expect(rasterized.ok).toBe(true);
      const keys = rasterized.coordinates.map(({ x, y }) => `${x},${y}`).sort();
      expect(keys).toEqual([
        '2,4', '3,3', '3,4', '3,5', '4,2', '4,3', '4,4', '4,5', '4,6',
        '5,3', '5,4', '5,5', '6,4',
      ]);
      expect(rasterized.coordinates.every((c) => c.color === '#55ccff' && c.partId === 'ink' && c.role === 'paint')).toBe(true);
    });

    it('evaluates and rasterizes a PIXEL end-to-end', () => {
      const source = `SCDL 2
ASSET dot
CANVAS WIDTH 4 HEIGHT 4
SHAPE $p (PIXEL AT (VEC2 (PX 1) (PX 2)))
LAYER ink ORDER 0 { PAINT $p FILL #FF0000 RASTER CENTER }`;
      const { program } = compile(source);
      const evaluated = evaluateSCDLV2(program);
      expect(evaluated.ok).toBe(true);
      const rasterized = rasterizeSCDLV2(evaluated.construction, program.canvas, program.verifiedBudget);
      expect(rasterized.ok).toBe(true);
      expect(rasterized.coordinates).toEqual([{ x: 1, y: 2, color: '#ff0000', partId: 'ink', role: 'paint' }]);
    });

    it('accepts a fractional-center CENTER circle at Task 6 exact static raster demand', () => {
      const source = `SCDL 2
ASSET fractional_center
CANVAS WIDTH 10 HEIGHT 10
BUDGET INSTRUCTIONS 128 GENERATED_SHAPES 1 RASTER_CELLS 9
CONST $center VEC2 (VEC2 (PX 2.5) (PX 2.5))
SHAPE $circle (CIRCLE CENTER $center RADIUS (PX 1))
LAYER ink ORDER 0 { PAINT $circle FILL #55CCFF RASTER CENTER }`;

      const parsed = parseSCDLV2(source);
      expect(parsed.ok).toBe(true);
      const analysis = analyzeSCDLV2(parsed.ast);
      expect(analysis.ok).toBe(true);
      const budget = verifySCDLV2Budget(analysis.ir);
      expect(budget.ok).toBe(true);
      expect(budget.verified.demand.rasterCells).toBe(9);
      expect(budget.verified.limits.rasterCells).toBe(9);
      const program = lowerSCDLV2Bytecode(analysis.ir, budget.verified);
      const evaluated = evaluateSCDLV2(program);
      expect(evaluated.ok).toBe(true);

      const rasterized = rasterizeSCDLV2(evaluated.construction, program.canvas, program.verifiedBudget);
      expect(rasterized.ok).toBe(true);
      expect(rasterized.coordinates).toEqual([
        { x: 2, y: 2, color: '#55ccff', partId: 'ink', role: 'paint' },
        { x: 3, y: 2, color: '#55ccff', partId: 'ink', role: 'paint' },
        { x: 2, y: 3, color: '#55ccff', partId: 'ink', role: 'paint' },
        { x: 3, y: 3, color: '#55ccff', partId: 'ink', role: 'paint' },
      ]);
    });

    it('rejects at the raster stage when a real forged verifiedBudget crosses its rasterCells limit', () => {
      const source = `SCDL 2
ASSET disc
CANVAS WIDTH 9 HEIGHT 9
CONST $c VEC2 (VEC2 (PX 4) (PX 4))
SHAPE $s (CIRCLE CENTER $c RADIUS (PX 2))
LAYER ink ORDER 10 { PAINT $s FILL #55CCFF RASTER MIDPOINT }`;
      const { program } = compile(source);
      const evaluated = evaluateSCDLV2(program);
      expect(evaluated.ok).toBe(true);

      const forgedBudget = { limits: { ...program.verifiedBudget.limits, rasterCells: 1 } };
      const rasterized = rasterizeSCDLV2(evaluated.construction, program.canvas, forgedBudget);
      expect(rasterized.ok).toBe(false);
      expect(rasterized.diagnostics[0].code).toBe('SCDL-BUDGET-003');
    });

    it('rejects a forged huge circle promptly before primitive materialization', () => {
      const child = runRasterSubprocess(
        `{ layers: [{ id: 'l', order: 0, sourceIndex: 0, paints: [{ shape: { kind: 'CIRCLE', center: { x: 0, y: 0 }, radius: 1000000000 }, fill: '#fff', raster: 'MIDPOINT' }] }] }`,
        `{ limits: { instructions: 10, generatedShapes: 1, rasterCells: 1 } }`,
      );
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(0);
      expect(JSON.parse(child.stdout)).toEqual({ ok: false, code: 'SCDL-BUDGET-003' });
    });

    it.each([
      ['missing', undefined],
      ['malformed', { limits: { instructions: 10, generatedShapes: 1, rasterCells: '1' } }],
    ])('fails closed when the raster verified budget is %s', (_label, verifiedBudget) => {
      const result = rasterizeSCDLV2({ layers: [] }, { width: 1, height: 1 }, verifiedBudget);
      expect(result.ok).toBe(false);
      expect(result.coordinates).toBeNull();
      expect(result.diagnostics[0].code).toBe('SCDL-BUDGET-003');
    });
  });

  describe('evaluator defensive boundaries', () => {
    it.each([
      ['missing', undefined],
      ['malformed', { limits: { instructions: 10, generatedShapes: '1', rasterCells: 1 } }],
    ])('fails closed when the evaluator verified budget is %s', (_label, verifiedBudget) => {
      const result = evaluateSCDLV2({ constants: [], instructions: [], verifiedBudget });
      expect(result.ok).toBe(false);
      expect(result.construction).toBeNull();
      expect(result.diagnostics[0].code).toBe('SCDL-BUDGET-003');
    });

    it('keeps layer registers and paint arrays immutable with EMIT observing the latest copy', () => {
      const program = {
        constants: [
          { index: 0, type: 'PX', value: '0/1' },
          { index: 1, type: 'COLOR', value: '#111111' },
          { index: 2, type: 'COLOR', value: '#222222' },
        ],
        instructions: [
          { index: 0, mnemonic: 'BC.CONST', result: '%0', type: 'PX', operands: [{ kind: 'constant', index: 0 }] },
          { index: 1, mnemonic: 'BC.CONST', result: '%1', type: 'COLOR', operands: [{ kind: 'constant', index: 1 }] },
          { index: 2, mnemonic: 'BC.CONST', result: '%2', type: 'COLOR', operands: [{ kind: 'constant', index: 2 }] },
          { index: 3, mnemonic: 'VEC2', result: '%3', type: 'VEC2', operands: [{ kind: 'register', index: 0 }, { kind: 'register', index: 0 }] },
          { index: 4, mnemonic: 'PIXEL', result: '%4', type: 'SHAPE', operands: [{ kind: 'register', index: 3 }] },
          { index: 5, mnemonic: 'BC.LAYER.NEW', result: '%5', type: 'LAYER', operands: [{ kind: 'immediate', value: 'ink' }, { kind: 'immediate', value: 0 }] },
          { index: 6, mnemonic: 'BC.PAINT', result: null, type: null, operands: [{ kind: 'register', index: 5 }, { kind: 'register', index: 4 }, { kind: 'register', index: 1 }, { kind: 'immediate', value: 'CENTER' }] },
          { index: 7, mnemonic: 'BC.EMIT.ASSET', result: null, type: null, operands: [{ kind: 'register', index: 5 }] },
          { index: 8, mnemonic: 'BC.PAINT', result: null, type: null, operands: [{ kind: 'register', index: 5 }, { kind: 'register', index: 4 }, { kind: 'register', index: 2 }, { kind: 'immediate', value: 'CENTER' }] },
        ],
        verifiedBudget: { limits: { instructions: 9, generatedShapes: 1, rasterCells: 1 } },
      };
      const result = evaluateSCDLV2(program);
      expect(result.ok).toBe(true);
      expect(result.construction.layers[0].paints).toHaveLength(1);
      expect(result.construction.layers[0].paints[0].fill).toBe('#111111');
      expect(Object.isFrozen(result.construction.layers[0])).toBe(true);
      expect(Object.isFrozen(result.construction.layers[0].paints)).toBe(true);
      expect(Object.isFrozen(result.construction.layers[0].paints[0])).toBe(true);
    });

    it('reports SCDL-LOWER-001 for an unknown opcode', () => {
      const program = {
        constants: [],
        instructions: [{ index: 0, opcodeId: 0x9999, mnemonic: 'BC.NOPE', result: null, type: null, operands: [] }],
        verifiedBudget: { limits: { instructions: 100, generatedShapes: 100, rasterCells: 100 } },
      };
      const result = evaluateSCDLV2(program);
      expect(result.ok).toBe(false);
      expect(result.construction).toBeNull();
      expect(result.diagnostics[0].code).toBe('SCDL-LOWER-001');
    });

    it('reports SCDL-LOWER-001 for a missing register', () => {
      const program = {
        constants: [],
        instructions: [{ index: 0, opcodeId: 0x0200, mnemonic: 'PIXEL', result: '%0', type: 'SHAPE', operands: [{ kind: 'register', index: 99 }] }],
        verifiedBudget: { limits: { instructions: 100, generatedShapes: 100, rasterCells: 100 } },
      };
      const result = evaluateSCDLV2(program);
      expect(result.ok).toBe(false);
      expect(result.diagnostics[0].code).toBe('SCDL-LOWER-001');
    });

    it('reports SCDL-LOWER-001 for a wrong runtime type (COLOR fed into PIXEL AT)', () => {
      const program = {
        constants: [{ index: 0, type: 'COLOR', value: '#ffffff' }],
        instructions: [
          { index: 0, opcodeId: 0x8000, mnemonic: 'BC.CONST', result: '%0', type: 'COLOR', operands: [{ kind: 'constant', index: 0 }] },
          { index: 1, opcodeId: 0x0200, mnemonic: 'PIXEL', result: '%1', type: 'SHAPE', operands: [{ kind: 'register', index: 0 }] },
        ],
        verifiedBudget: { limits: { instructions: 100, generatedShapes: 100, rasterCells: 100 } },
      };
      const result = evaluateSCDLV2(program);
      expect(result.ok).toBe(false);
      expect(result.diagnostics[0].code).toBe('SCDL-LOWER-001');
    });

    it('stops when a forged verified program crosses its runtime generatedShapes limit', () => {
      const program = {
        constants: [
          { index: 0, type: 'PX', value: '4/1' },
        ],
        instructions: [
          { index: 0, opcodeId: 0x8000, mnemonic: 'BC.CONST', result: '%0', type: 'PX', operands: [{ kind: 'constant', index: 0 }] },
          { index: 1, opcodeId: 0x0111, mnemonic: 'VEC2', result: '%1', type: 'VEC2', operands: [{ kind: 'register', index: 0 }, { kind: 'register', index: 0 }] },
          { index: 2, opcodeId: 0x0200, mnemonic: 'PIXEL', result: '%2', type: 'SHAPE', operands: [{ kind: 'register', index: 1 }] },
        ],
        verifiedBudget: { limits: { instructions: 100, generatedShapes: 0, rasterCells: 100 } },
      };
      const result = evaluateSCDLV2(program);
      expect(result.ok).toBe(false);
      expect(result.construction).toBeNull();
      expect(result.diagnostics[0].code).toBe('SCDL-BUDGET-003');
      expect(result.diagnostics[0].relatedSymbols).toContain('generatedShapes');
    });
  });
});

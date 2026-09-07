import { describe, expect, it } from 'vitest';
import { parseSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js';
import { analyzeSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.analyzer.js';
import { parseRational, rationalToString } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js';

function analyze(source) {
  const parsed = parseSCDLV2(source);
  expect(parsed.ok).toBe(true);
  return analyzeSCDLV2(parsed.ast);
}

const BASE = `SCDL 2
ASSET typed
CANVAS WIDTH 9 HEIGHT 9
CONST $two I32 (ADD 1 1)
CONST $center VEC2 (VEC2 (PX 4) (PX 4))
CONST $ink COLOR #55CCFF
SHAPE $orb (CIRCLE CENTER $center RADIUS (PX $two))
LAYER ink ORDER 10 { PAINT $orb FILL $ink RASTER MIDPOINT }`;

describe('SCDL v2 semantic analysis', () => {
  it('reduces exact decimal and division values', () => {
    expect(rationalToString(parseRational('1.250'))).toBe('5/4');
    expect(rationalToString(parseRational('-0.125'))).toBe('-1/8');
  });

  it('binds declarations before use and evaluates prefix math', () => {
    const result = analyze(BASE);
    expect(result.ok).toBe(true);
    expect(result.symbols.get('$two')).toEqual({ type: 'I32', value: 2 });
    expect(result.ir.shapes[0].value).toMatchObject({ kind: 'CIRCLE', radius: { type: 'PX' } });
  });

  it('rejects an unknown symbol at bind phase', () => {
    const result = analyze(BASE.replace('$two))', '$missing))'));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'SCDL-BIND-001' && d.relatedSymbols.includes('$missing'))).toBe(true);
  });

  it('rejects implicit I32-to-PX use', () => {
    const result = analyze(BASE.replace('RADIUS (PX $two)', 'RADIUS $two'));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'SCDL-TYPE-002' && d.expected.includes('PX') && d.received.includes('I32'))).toBe(true);
  });

  it('rejects duplicate symbols and use before declaration', () => {
    const duplicate = analyze(`${BASE}\nCONST $two I32 2`);
    expect(duplicate.diagnostics.some((d) => d.code === 'SCDL-BIND-002')).toBe(true);
    const early = analyze(BASE.replace('CONST $two I32 (ADD 1 1)\n', '').replace('LAYER ink', 'CONST $two I32 2\nLAYER ink'));
    expect(early.diagnostics.some((d) => d.code === 'SCDL-BIND-001')).toBe(true);
  });

  it('binds and evaluates Step 2 geometry, transforms, booleans, masks, and layers', () => {
    const step2Source = `SCDL 2
ASSET step2_test
CANVAS WIDTH 32 HEIGHT 32

CONST $angle ANGLE (DEGREES 90)
CONST $trans TRANSFORM (TRANSLATE OFFSET (VEC2 (PX 2) (PX 4)))
SHAPE $box (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 10) (PX 10)))
SHAPE $hole (CIRCLE CENTER (VEC2 (PX 5) (PX 5)) RADIUS (PX 3))
SHAPE $cut (SUBTRACT $box $hole)
MASK $mask (TO_MASK $cut RASTER CENTER)

ANCHOR $top ON $cut AT TOP
ASSERT (CONTAINS $box $hole)

LAYER main ORDER 5 BLEND OVER OPACITY 0.9 VISIBLE TRUE {
  PAINT $cut AT (VEC2 (PX 1) (PX 1)) FILL #FF5500 RASTER CENTER CLIP_TO $mask MATERIAL "crystal" OPACITY 0.8
}
`;
    const result = analyze(step2Source);
    expect(result.ok).toBe(true);
    expect(result.ir.shapes.length).toBe(3);
    expect(result.ir.masks.length).toBe(1);
    expect(result.ir.anchors.length).toBe(1);
    expect(result.ir.assertions.length).toBe(1);
    expect(result.ir.layers[0].blend).toBe('OVER');
    expect(result.ir.layers[0].opacity).toBeCloseTo(0.9);
    expect(result.ir.layers[0].paints[0].material).toBe('crystal');
  });

  it('fails assertion with SCDL-GEOM-002 when geometric condition is false', () => {
    const failingAssert = `SCDL 2
ASSET fail_assert
CANVAS WIDTH 32 HEIGHT 32
SHAPE $box (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 5) (PX 5)))
ASSERT (INSIDE (VEC2 (PX 100) (PX 100)) $box)
LAYER main ORDER 0 { PAINT $box FILL #FFFFFF RASTER CENTER }
`;
    const result = analyze(failingAssert);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'SCDL-GEOM-002')).toBe(true);
  });
});

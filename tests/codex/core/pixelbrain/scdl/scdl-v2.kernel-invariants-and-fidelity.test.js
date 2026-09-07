import { describe, expect, it } from 'vitest';
import { compileSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import { parseSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js';
import { analyzeSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.analyzer.js';
import { createRoundedRect } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.geometry.js';
import { evaluateCSGToCells, shapeUnion } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.booleans.js';
import { makeRational } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js';

function coordinatesFor(source) {
  const result = compileSCDLV2(source);
  expect(result.diagnostics).toEqual([]);
  expect(result.ok).toBe(true);
  return result.packet.geometry.coordinates;
}

describe('SCDL v2 kernel invariants and raster fidelity', () => {
  it('rasterizes rounded rectangles and omits only the four radius-2 corners', () => {
    const cells = coordinatesFor(`SCDL 2
ASSET rounded_probe
CANVAS WIDTH 8 HEIGHT 8
SHAPE $s (ROUNDED_RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 5) (PX 5)) CORNER_RADIUS (PX 2))
LAYER main ORDER 0 { PAINT $s FILL #FFFFFF RASTER CENTER }`);

    expect(cells).toHaveLength(21);
    const occupied = new Set(cells.map(({ x, y }) => `${x},${y}`));
    expect(occupied.has('0,0')).toBe(false);
    expect(occupied.has('4,0')).toBe(false);
    expect(occupied.has('0,4')).toBe(false);
    expect(occupied.has('4,4')).toBe(false);
    expect(occupied.has('2,2')).toBe(true);
  });

  it('preserves rounded rectangle corners when the shape is inside CSG', () => {
    const rounded = createRoundedRect({
      origin: { x: makeRational(0n), y: makeRational(0n) },
      size: { x: makeRational(5n), y: makeRational(5n) },
      cornerRadius: makeRational(2n),
    });
    const cells = evaluateCSGToCells(shapeUnion(rounded, rounded));
    expect(cells).toHaveLength(21);
  });

  it('normalizes ray direction consistently between bounds and rasterization', () => {
    const cells = coordinatesFor(`SCDL 2
ASSET ray_probe
CANVAS WIDTH 64 HEIGHT 64
SHAPE $s (RAY ORIGIN (VEC2 (PX 0) (PX 0)) DIR (VEC2 (PX 3) (PX 4)) LENGTH (PX 10))
LAYER main ORDER 0 { PAINT $s FILL #FFFFFF RASTER CENTER }`);

    const occupied = new Set(cells.map(({ x, y }) => `${x},${y}`));
    expect(occupied.has('6,8')).toBe(true);
    expect(occupied.has('30,40')).toBe(false);
    expect(Math.max(...cells.map(({ x }) => x))).toBe(6);
    expect(Math.max(...cells.map(({ y }) => y))).toBe(8);
  });

  it('preserves ring thickness through bytecode lowering and evaluation', () => {
    const cells = coordinatesFor(`SCDL 2
ASSET ring_probe
CANVAS WIDTH 32 HEIGHT 32
SHAPE $s (RING CENTER (VEC2 (PX 16) (PX 16)) RADIUS (PX 8) THICKNESS (PX 2))
LAYER main ORDER 0 { PAINT $s FILL #FFFFFF RASTER MIDPOINT }`);

    expect(Math.min(...cells.map(({ x }) => x))).toBe(7);
    expect(Math.max(...cells.map(({ x }) => x))).toBe(25);
    expect(cells.some(({ x, y }) => x === 16 && y === 16)).toBe(false);
  });

  it('rasterizes canonical horizontal and vertical SVG path commands', () => {
    const cells = coordinatesFor(`SCDL 2
ASSET path_probe
CANVAS WIDTH 16 HEIGHT 16
SHAPE $s (PATH DATA "M 1 1 H 4 V 4")
LAYER main ORDER 0 { PAINT $s FILL #FFFFFF RASTER CENTER }`);

    const occupied = new Set(cells.map(({ x, y }) => `${x},${y}`));
    expect(occupied).toEqual(new Set(['1,1', '2,1', '3,1', '4,1', '4,2', '4,3', '4,4']));
  });

  it('evaluates MOD and canonical angle trigonometry without corrupt values', () => {
    const parsed = parseSCDLV2(`SCDL 2
ASSET math_probe
CANVAS WIDTH 8 HEIGHT 8
CONST $mod I32 (MOD 17 5)
CONST $negative_lerp I32 (LERP A -2 B -1 T 0.4)
CONST $right ANGLE (DEGREES 90)
CONST $sin FIXED (SIN $right)
CONST $cos FIXED (COS $right)`);
    expect(parsed.diagnostics).toEqual([]);
    const analysis = analyzeSCDLV2(parsed.ast);
    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.symbols.get('$mod').value).toBe(2);
    expect(analysis.symbols.get('$negative_lerp').value).toBe(-2);
    expect(analysis.symbols.get('$sin').value).toEqual(makeRational(1n));
    expect(analysis.symbols.get('$cos').value).toEqual(makeRational(0n));
  });

  it('reports I32 overflow from number-theory and collection operations', () => {
    const parsed = parseSCDLV2(`SCDL 2
ASSET overflow_probe
CANVAS WIDTH 8 HEIGHT 8
CONST $lcm I32 (LCM 2147483647 2147483646)
CONST $values RANGE (RANGE START 50000 END 50002 STEP 1)
CONST $product I32 (PRODUCT $values)`);
    expect(parsed.diagnostics).toEqual([]);
    const analysis = analyzeSCDLV2(parsed.ast);
    expect(analysis.diagnostics.filter(({ code }) => code === 'SCDL-TYPE-005')).toHaveLength(2);
    expect(analysis.symbols.has('$lcm')).toBe(false);
    expect(analysis.symbols.has('$product')).toBe(false);
  });

  it('rejects collections that exceed the protected analysis bound', () => {
    const parsed = parseSCDLV2(`SCDL 2
ASSET range_bound_probe
CANVAS WIDTH 8 HEIGHT 8
CONST $too_many RANGE (RANGE START 0 END 100001 STEP 1)`);
    expect(parsed.diagnostics).toEqual([]);
    const analysis = analyzeSCDLV2(parsed.ast);
    expect(analysis.diagnostics.some(({ code }) => code === 'SCDL-TERM-003')).toBe(true);
    expect(analysis.symbols.has('$too_many')).toBe(false);
  });

  it('requires an I32 range step', () => {
    const parsed = parseSCDLV2(`SCDL 2
ASSET range_type_probe
CANVAS WIDTH 8 HEIGHT 8
CONST $bad RANGE (RANGE START 0 END 2 STEP 0.5)`);
    expect(parsed.diagnostics).toEqual([]);
    const analysis = analyzeSCDLV2(parsed.ast);
    expect(analysis.diagnostics.some(({ code }) => code === 'SCDL-TYPE-002')).toBe(true);
    expect(analysis.symbols.has('$bad')).toBe(false);
  });

  it('produces a canonical ATAN2 angle usable by ROTATE', () => {
    const parsed = parseSCDLV2(`SCDL 2
ASSET atan_probe
CANVAS WIDTH 8 HEIGHT 8
CONST $up ANGLE (ATAN2 1 0)
CONST $rotation TRANSFORM (ROTATE ANGLE $up)`);
    expect(parsed.diagnostics).toEqual([]);
    const analysis = analyzeSCDLV2(parsed.ast);
    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.symbols.get('$up').value.turns).toEqual(makeRational(1n, 4n));
  });

  it('preserves and applies layer and paint opacity through bytecode', () => {
    const layerOpacity = coordinatesFor(`SCDL 2
ASSET layer_opacity_probe
CANVAS WIDTH 1 HEIGHT 1
SHAPE $pixel (PIXEL AT (VEC2 (PX 0) (PX 0)))
LAYER background ORDER 0 BLEND REPLACE { PAINT $pixel FILL #000000 RASTER CENTER }
LAYER foreground ORDER 1 BLEND OVER OPACITY 0.5 { PAINT $pixel FILL #FFFFFF RASTER CENTER }`);
    expect(layerOpacity[0].color).toBe('#808080');

    const paintOpacity = coordinatesFor(`SCDL 2
ASSET paint_opacity_probe
CANVAS WIDTH 1 HEIGHT 1
SHAPE $pixel (PIXEL AT (VEC2 (PX 0) (PX 0)))
LAYER background ORDER 0 BLEND REPLACE { PAINT $pixel FILL #000000 RASTER CENTER }
LAYER foreground ORDER 1 BLEND OVER { PAINT $pixel FILL #FFFFFF RASTER CENTER OPACITY 0.5 }`);
    expect(paintOpacity[0].color).toBe('#808080');
  });

  it('preserves layer visibility and paint-level blend mode through bytecode', () => {
    const cells = coordinatesFor(`SCDL 2
ASSET paint_options_probe
CANVAS WIDTH 2 HEIGHT 1
SHAPE $left (PIXEL AT (VEC2 (PX 0) (PX 0)))
SHAPE $right (PIXEL AT (VEC2 (PX 1) (PX 0)))
LAYER base ORDER 0 BLEND REPLACE {
  PAINT $left FILL #101010 RASTER CENTER
  PAINT $right FILL #101010 RASTER CENTER
}
LAYER hidden ORDER 1 VISIBLE FALSE { PAINT $right FILL #FFFFFF RASTER CENTER }
LAYER top ORDER 2 { PAINT $left FILL #202020 RASTER CENTER BLEND ADD }`);
    const byPosition = new Map(cells.map((cell) => [`${cell.x},${cell.y}`, cell.color]));
    expect(byPosition.get('0,0')).toBe('#303030');
    expect(byPosition.get('1,0')).toBe('#101010');
  });

  it('rejects layer and paint opacity outside the unit interval', () => {
    const parsed = parseSCDLV2(`SCDL 2
ASSET opacity_range_probe
CANVAS WIDTH 1 HEIGHT 1
SHAPE $pixel (PIXEL AT (VEC2 (PX 0) (PX 0)))
LAYER invalid ORDER 0 OPACITY 1.1 { PAINT $pixel FILL #FFFFFF RASTER CENTER OPACITY -0.1 }`);
    expect(parsed.diagnostics).toEqual([]);
    const analysis = analyzeSCDLV2(parsed.ast);
    expect(analysis.diagnostics.filter(({ code }) => code === 'SCDL-TYPE-005')).toHaveLength(2);
  });

  it('rejects unknown raster and composite policies during analysis', () => {
    const parsed = parseSCDLV2(`SCDL 2
ASSET paint_policy_probe
CANVAS WIDTH 1 HEIGHT 1
SHAPE $pixel (PIXEL AT (VEC2 (PX 0) (PX 0)))
LAYER invalid ORDER 0 BLEND UNKNOWN { PAINT $pixel FILL #FFFFFF RASTER IMPOSSIBLE }`);
    expect(parsed.diagnostics).toEqual([]);
    const analysis = analyzeSCDLV2(parsed.ast);
    expect(analysis.diagnostics.some(({ code }) => code === 'SCDL-GEOM-005')).toBe(true);
    expect(analysis.diagnostics.some(({ code }) => code === 'SCDL-GEOM-006')).toBe(true);
  });
});

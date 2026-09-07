import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import { formatSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.formatter.js';

const VOID_SIGIL_SOURCE = readFileSync(
  resolve('codex/core/pixelbrain/scdl/fixtures/v2/void-sigil.scdl'),
  'utf8',
);

describe('SCDL v2 Step 2: Geometry & Paint Kernel Integration', () => {
  it('compiles void-sigil.scdl end-to-end to a verified asset package', () => {
    const result = compileSCDLV2(VOID_SIGIL_SOURCE);
    expect(result.ok).toBe(true);
    expect(result.contract).toBe('SCDL-COMPILE-RESULT-v2');
    expect(result.bytecode.contract).toBe('SCDL-BC-v2');
    expect(result.package.contract).toBe('SCDL-PACKAGE-v2');
    expect(result.packet.kind).toBe('pixelbrain.asset.v1');
    expect(result.packet.id).toBe(`pbasset_${result.bytecode.programId.slice('scdlbc_'.length)}`);

    // Validates that capabilities include PAINT.MASKS@2.0 for TO_MASK
    expect(result.bytecode.capabilities).toContain('PAINT.MASKS@2.0');
    expect(result.bytecode.capabilities).toContain('GEOMETRY.STANDARD@2.0');
    expect(result.bytecode.capabilities).toContain('PAINT.LAYERS@2.0');

    // Validates multi-layer coordinates rendered
    expect(result.packet.geometry.coordinates.length).toBeGreaterThan(0);

    // Checks that both backdrop (order 0) and glyphs (order 10) are represented
    const layers = result.package.construction.layers;
    expect(layers).toHaveLength(2);
    expect(layers[0].id).toBe('backdrop');
    expect(layers[0].order).toBe(0);
    expect(layers[1].id).toBe('glyphs');
    expect(layers[1].order).toBe(10);
    expect(layers[1].opacity).toBeCloseTo(0.8);
  });

  it('preserves determinism across repeated compilation of void-sigil.scdl', () => {
    const first = compileSCDLV2(VOID_SIGIL_SOURCE);
    const second = compileSCDLV2(VOID_SIGIL_SOURCE);
    expect(second.bytecode.text).toBe(first.bytecode.text);
    expect(second.bytecode.programId).toBe(first.bytecode.programId);
    expect(second.packet).toEqual(first.packet);
  });

  it('preserves program identity through canonical formatting roundtrip', () => {
    const formatted = formatSCDLV2(VOID_SIGIL_SOURCE);
    expect(formatted.ok).toBe(true);
    expect(formatted.output).toBeTruthy();
    const resultFormatted = compileSCDLV2(formatted.output);
    const resultOriginal = compileSCDLV2(VOID_SIGIL_SOURCE);
    expect(resultFormatted.ok).toBe(true);
    expect(resultFormatted.bytecode.programId).toBe(resultOriginal.bytecode.programId);
  });

  it('rejects falsified geometric assertions with structured diagnostics without throwing', () => {
    const invalidSource = `SCDL 2
ASSET failed_assert
CANVAS WIDTH 16 HEIGHT 16
SHAPE $box (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 8) (PX 8)))
ASSERT (INSIDE (VEC2 (PX 20) (PX 20)) $box)
LAYER main ORDER 0 {
  PAINT $box FILL #FFFFFF RASTER CENTER
}
`;
    const result = compileSCDLV2(invalidSource);
    expect(result.ok).toBe(false);
    expect(result.packet).toBeNull();
    expect(result.diagnostics.some((d) => d.code === 'SCDL-GEOM-002')).toBe(true);
  });

  it('evaluates all boolean operations and outlines without errors', () => {
    const csgSource = `SCDL 2
ASSET csg_suite
CANVAS WIDTH 32 HEIGHT 32

SHAPE $a (RECT ORIGIN (VEC2 (PX 2) (PX 2)) SIZE (VEC2 (PX 12) (PX 12)))
SHAPE $b (CIRCLE CENTER (VEC2 (PX 10) (PX 10)) RADIUS (PX 6))
SHAPE $sub (SUBTRACT $a $b)
SHAPE $uni (UNION $a $b)
SHAPE $inter (INTERSECT $a $b)
SHAPE $xor (XOR $a $b)
SHAPE $edge (OUTLINE $sub WIDTH (PX 1))

LAYER base ORDER 0 {
  PAINT $edge FILL #FFAA00 RASTER CENTER
  PAINT $inter FILL #00AAFF RASTER CENTER
}
`;
    const result = compileSCDLV2(csgSource);
    expect(result.ok).toBe(true);
    expect(result.packet.geometry.coordinates.length).toBeGreaterThan(0);
  });

  it('evaluates affine transforms with rotation, translation, and scaling', () => {
    const transformSource = `SCDL 2
ASSET xform_suite
CANVAS WIDTH 32 HEIGHT 32

SHAPE $sq (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 6) (PX 6)))
CONST $rot TRANSFORM (ROTATE ANGLE (DEGREES 45) PIVOT (VEC2 (PX 3) (PX 3)))
CONST $trans TRANSFORM (TRANSLATE OFFSET (VEC2 (PX 10) (PX 10)))
SHAPE $rotated (TRANSFORM_APPLY $rot $sq)
SHAPE $placed (TRANSFORM_APPLY $trans $rotated)

LAYER main ORDER 0 {
  PAINT $placed FILL #00FF88 RASTER CENTER
}
`;
    const result = compileSCDLV2(transformSource);
    expect(result.ok).toBe(true);
    expect(result.packet.geometry.coordinates.length).toBeGreaterThan(0);
  });
});

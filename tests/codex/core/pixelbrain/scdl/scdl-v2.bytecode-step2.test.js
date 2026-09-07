import { describe, expect, it } from 'vitest';
import { parseSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js';
import { analyzeSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.analyzer.js';
import { verifySCDLV2Budget } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.budget.js';
import { lowerSCDLV2Bytecode } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.bytecode.js';
import { evaluateSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.evaluator.js';
import { rasterizeSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.raster.js';

function compileProgram(source, options = {}) {
  const parsed = parseSCDLV2(source);
  expect(parsed.ok).toBe(true);
  const analysis = analyzeSCDLV2(parsed.ast);
  expect(analysis.ok).toBe(true);
  const budget = verifySCDLV2Budget(analysis.ir, options);
  expect(budget.ok).toBe(true);
  const bytecode = lowerSCDLV2Bytecode(analysis.ir, budget.verified);
  expect(bytecode.programId).toBeTruthy();
  const evaluation = evaluateSCDLV2(bytecode);
  return { analysis, budget, bytecode, evaluation };
}

describe('SCDL-BC-v2 Step 2 bytecode lowering & evaluator', () => {
  it('lowers geometric primitives into typed bytecode instructions', () => {
    const source = `SCDL 2
ASSET primitives_bc
CANVAS WIDTH 32 HEIGHT 32

SHAPE $line (LINE FROM (VEC2 (PX 0) (PX 0)) TO (VEC2 (PX 10) (PX 10)))
SHAPE $rect (RECT ORIGIN (VEC2 (PX 2) (PX 2)) SIZE (VEC2 (PX 8) (PX 8)))
SHAPE $ring (RING CENTER (VEC2 (PX 16) (PX 16)) RADIUS (PX 8) THICKNESS (PX 2))
SHAPE $ellipse (ELLIPSE CENTER (VEC2 (PX 16) (PX 16)) RADIUS_X (PX 6) RADIUS_Y (PX 4))

LAYER main ORDER 0 {
  PAINT $line FILL #FFFFFF RASTER BRESENHAM
  PAINT $rect FILL #FF0000 RASTER CENTER
  PAINT $ring FILL #00FF00 RASTER MIDPOINT
  PAINT $ellipse FILL #0000FF RASTER CENTER
}
`;
    const { bytecode, evaluation } = compileProgram(source);
    expect(bytecode.instructions.some((i) => i.mnemonic === 'LINE')).toBe(true);
    expect(bytecode.instructions.some((i) => i.mnemonic === 'RECT')).toBe(true);
    expect(bytecode.instructions.some((i) => i.mnemonic === 'RING')).toBe(true);
    expect(bytecode.instructions.some((i) => i.mnemonic === 'ELLIPSE')).toBe(true);
    expect(evaluation.ok).toBe(true);
    expect(evaluation.construction.layers).toHaveLength(1);
    expect(evaluation.construction.layers[0].paints).toHaveLength(4);
  });

  it('lowers and evaluates CSG booleans, outlines, and transforms', () => {
    const source = `SCDL 2
ASSET csg_bc
CANVAS WIDTH 32 HEIGHT 32

SHAPE $a (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 10) (PX 10)))
SHAPE $b (CIRCLE CENTER (VEC2 (PX 8) (PX 8)) RADIUS (PX 5))
SHAPE $cut (SUBTRACT $a $b)
SHAPE $edge (OUTLINE $cut WIDTH (PX 1))

LAYER base ORDER 0 {
  PAINT $edge FILL #FFAA00 RASTER CENTER
}
`;
    const { bytecode, evaluation } = compileProgram(source);
    expect(bytecode.instructions.some((i) => i.mnemonic === 'SUBTRACT')).toBe(true);
    expect(bytecode.instructions.some((i) => i.mnemonic === 'OUTLINE')).toBe(true);
    expect(evaluation.ok).toBe(true);
    expect(evaluation.counters.generatedShapes).toBeGreaterThan(2);
  });

  it('lowers and evaluates masks and multi-layer blending', () => {
    const source = `SCDL 2
ASSET mask_layer_bc
CANVAS WIDTH 16 HEIGHT 16

SHAPE $box (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 8) (PX 8)))
MASK $m (TO_MASK $box)

LAYER background ORDER 0 BLEND REPLACE OPACITY 1.0 {
  PAINT $box FILL #444444 RASTER CENTER
}

LAYER overlay ORDER 10 BLEND OVER OPACITY 0.5 {
  PAINT $box AT (VEC2 (PX 2) (PX 2)) FILL #FFFFFF RASTER CENTER CLIP_TO $m
}
`;
    const { analysis, budget, bytecode, evaluation } = compileProgram(source);
    expect(bytecode.capabilities).toContain('PAINT.MASKS@2.0');
    expect(evaluation.ok).toBe(true);
    expect(evaluation.construction.layers).toHaveLength(2);

    const raster = rasterizeSCDLV2(evaluation.construction, analysis.ir.canvas, budget.verified);
    expect(raster.ok).toBe(true);
    expect(raster.coordinates.length).toBeGreaterThan(0);
    // Overlay cell clipped by mask at (2,2) inside $box (0..7)
    const at22 = raster.coordinates.find((c) => c.x === 2 && c.y === 2);
    expect(at22).toBeDefined();
  });
});

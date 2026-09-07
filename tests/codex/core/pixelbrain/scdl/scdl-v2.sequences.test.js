import { describe, expect, it } from 'vitest';
import { parseSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js';
import { analyzeSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.analyzer.js';
import { compileSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import { rasterizeSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.raster.js';
import { evaluateSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.evaluator.js';

describe('SCDL v2 Sequences, Recurrences, RNG, and Generative Shapes', () => {
  it('evaluates recurrence sequences (Fibonacci) with SEED and PREV', () => {
    const source = `SCDL 2
ASSET seq_test
CANVAS WIDTH 16 HEIGHT 16
CONST $count I32 8
SEQUENCE $fib TYPE I32 COUNT $count {
  SEED 0
  SEED 1
  NEXT (ADD (PREV 1) (PREV 2))
}
CONST $item0 I32 (AT $fib 0)
CONST $item1 I32 (AT $fib 1)
CONST $item6 I32 (AT $fib 6)
CONST $len I32 (LENGTH $fib)
SHAPE $s (CIRCLE CENTER (VEC2 (PX 8) (PX 8)) RADIUS (PX 4))
LAYER main ORDER 1 { PAINT $s FILL #FF0000 }`;

    const parseRes = parseSCDLV2(source);
    expect(parseRes.diagnostics).toHaveLength(0);
    const analysis = analyzeSCDLV2(parseRes.ast);
    expect(analysis.diagnostics).toHaveLength(0);
    expect(analysis.symbols.get('$item0').value).toBe(0);
    expect(analysis.symbols.get('$item1').value).toBe(1);
    expect(analysis.symbols.get('$item6').value).toBe(8);
    expect(analysis.symbols.get('$len').value).toBe(8);
  });

  it('evaluates RANGE, SUM, and PRODUCT', () => {
    const source = `SCDL 2
ASSET math_col_test
CANVAS WIDTH 16 HEIGHT 16
CONST $r RANGE (RANGE START 1 END 5 STEP 1)
CONST $total I32 (SUM $r)
CONST $prod I32 (PRODUCT $r)
SHAPE $s (CIRCLE CENTER (VEC2 (PX 8) (PX 8)) RADIUS (PX 4))
LAYER main ORDER 1 { PAINT $s FILL #FF0000 }`;

    const parseRes = parseSCDLV2(source);
    expect(parseRes.diagnostics).toHaveLength(0);
    const analysis = analyzeSCDLV2(parseRes.ast);
    expect(analysis.diagnostics).toHaveLength(0);
    expect(analysis.symbols.get('$total').value).toBe(10); // 1 + 2 + 3 + 4 = 10
    expect(analysis.symbols.get('$prod').value).toBe(24);  // 1 * 2 * 3 * 4 = 24
  });

  it('evaluates deterministic PRNG and coherent noise', () => {
    const source = `SCDL 2
ASSET rng_test
CANVAS WIDTH 16 HEIGHT 16
RNG $rng ALGORITHM PCG32 SEED 1337
CONST $randInt I32 (RANDOM_I32 $rng MIN 5 MAX 25)
CONST $randVec VEC2 (RANDOM_VEC2 $rng MIN (VEC2 (PX 0) (PX 0)) MAX (VEC2 (PX 10) (PX 10)))
CONST $noise FIXED (NOISE_2D AT (VEC2 (PX 8) (PX 8)) SEED 42 FREQUENCY 1)
SHAPE $s (CIRCLE CENTER (VEC2 (PX 8) (PX 8)) RADIUS (PX 4))
LAYER main ORDER 1 { PAINT $s FILL #FF0000 }`;

    const parseRes = parseSCDLV2(source);
    expect(parseRes.diagnostics).toHaveLength(0);
    const analysis = analyzeSCDLV2(parseRes.ast);
    expect(analysis.diagnostics).toHaveLength(0);
    const randIntVal = analysis.symbols.get('$randInt').value;
    expect(randIntVal).toBeGreaterThanOrEqual(5);
    expect(randIntVal).toBeLessThanOrEqual(25);
    const randVec = analysis.symbols.get('$randVec').value;
    expect(randVec).toBeDefined();
    expect(randVec.x.type).toBe('PX');
    const noise = analysis.symbols.get('$noise').value;
    expect(noise).toBeDefined();
  });

  it('evaluates COMPOUND shapes with FOR loops and EMIT', () => {
    const source = `SCDL 2
ASSET compound_loop
CANVAS WIDTH 32 HEIGHT 32
SHAPE $multi COMPOUND {
  FOR $i IN (RANGE START 2 END 8 STEP 2) {
    EMIT (CIRCLE CENTER (VEC2 (PX $i) (PX $i)) RADIUS (PX 1))
  }
}
LAYER main ORDER 1 { PAINT $multi FILL #00FF00 }`;

    const parseRes = parseSCDLV2(source);
    expect(parseRes.diagnostics).toHaveLength(0);
    const analysis = analyzeSCDLV2(parseRes.ast);
    expect(analysis.diagnostics).toHaveLength(0);
    const compoundShape = analysis.symbols.get('$multi').value;
    expect(compoundShape.kind).toBe('COMPOUND');
    expect(compoundShape.shapes).toHaveLength(3); // $i = 2, 4, 6
  });

  it('evaluates COMPOUND shapes with RADIAL repetition', () => {
    const source = `SCDL 2
ASSET compound_radial
CANVAS WIDTH 32 HEIGHT 32
SHAPE $petals COMPOUND {
  RADIAL COUNT 4 CENTER (VEC2 (PX 16) (PX 16)) RADIUS (PX 8) {
    EMIT (CIRCLE CENTER (VEC2 (PX 0) (PX 0)) RADIUS (PX 2))
  }
}
LAYER main ORDER 1 { PAINT $petals FILL #0000FF }`;

    const parseRes = parseSCDLV2(source);
    expect(parseRes.diagnostics).toHaveLength(0);
    const analysis = analyzeSCDLV2(parseRes.ast);
    expect(analysis.diagnostics).toHaveLength(0);
    const compoundShape = analysis.symbols.get('$petals').value;
    expect(compoundShape.kind).toBe('COMPOUND');
    expect(compoundShape.shapes).toHaveLength(4);
  });

  it('evaluates MATCH and IF/ELSE inside generative control blocks', () => {
    const source = `SCDL 2
ASSET match_test
CANVAS WIDTH 16 HEIGHT 16
FN pick_size PARAM $category I32 RETURNS I32 {
  MATCH $category {
    CASE 1 { RETURN 2 }
    CASE 2 { RETURN 4 }
    DEFAULT { RETURN 8 }
  }
}
CONST $size1 I32 (CALL pick_size 1)
CONST $size2 I32 (CALL pick_size 2)
CONST $sizeDef I32 (CALL pick_size 99)
SHAPE $s (CIRCLE CENTER (VEC2 (PX 8) (PX 8)) RADIUS (PX 4))
LAYER main ORDER 1 { PAINT $s FILL #FF0000 }`;

    const parseRes = parseSCDLV2(source);
    expect(parseRes.diagnostics).toHaveLength(0);
    const analysis = analyzeSCDLV2(parseRes.ast);
    expect(analysis.diagnostics).toHaveLength(0);
    expect(analysis.symbols.get('$size1').value).toBe(2);
    expect(analysis.symbols.get('$size2').value).toBe(4);
    expect(analysis.symbols.get('$sizeDef').value).toBe(8);
  });

  it('rasterizes COMPOUND shapes cleanly end-to-end via compileSCDLV2 and rasterizeSCDLV2', () => {
    const source = `SCDL 2
ASSET generative_ring
CANVAS WIDTH 16 HEIGHT 16
SHAPE $ring COMPOUND {
  FOR $x IN (RANGE START 4 END 14 STEP 4) {
    EMIT (RECT ORIGIN (VEC2 (PX $x) (PX 8)) SIZE (VEC2 (PX 2) (PX 2)))
  }
}
LAYER main ORDER 1 { PAINT $ring FILL #FFFFFF }`;

    const result = compileSCDLV2(source);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.bytecode).toBeDefined();

    const evaluated = evaluateSCDLV2(result.bytecode);
    expect(evaluated.ok).toBe(true);
    const raster = rasterizeSCDLV2(evaluated.construction, result.analysis.canvas, result.package.verifiedBudget);
    expect(raster.ok).toBe(true);
    expect(raster.coordinates.length).toBeGreaterThan(0);
    expect(raster.coordinates.some((cell) => cell.color.toLowerCase() === '#ffffff')).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { parseSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js';

describe('SCDL v2 Step 3 Parser Extensions', () => {
  it('parses pure functions with params, return type, recursion bound and body', () => {
    const src = `SCDL 2
ASSET test_fn
CANVAS WIDTH 64 HEIGHT 64

FN fibonacci PARAM $n I32 RETURNS I32 RECURSION_MAX 64 {
  IF (LTE $n 1) {
    RETURN $n
  } ELSE {
    RETURN (ADD (CALL fibonacci (SUB $n 1)) (CALL fibonacci (SUB $n 2)))
  }
}
`;
    const res = parseSCDLV2(src);
    expect(res.ok).toBe(true);
    const fn = res.ast.declarations.find((d) => d.kind === 'FnDeclaration');
    expect(fn).toBeDefined();
    expect(fn.id).toBe('fibonacci');
    expect(fn.params).toEqual([{ name: '$n', type: 'I32', span: expect.any(Object) }]);
    expect(fn.returnType).toBe('I32');
    expect(fn.recursionMax).toBe(64);
    expect(fn.body).toHaveLength(1);
    expect(fn.body[0].kind).toBe('IfStatement');
    expect(fn.body[0].then).toHaveLength(1);
    expect(fn.body[0].else).toHaveLength(1);
  });

  it('parses recurrence SEQUENCE definitions', () => {
    const src = `SCDL 2
ASSET test_seq
CANVAS WIDTH 64 HEIGHT 64

CONST $count I32 12
SEQUENCE $fib TYPE I32 COUNT $count {
  SEED 0
  SEED 1
  NEXT (ADD (PREV 1) (PREV 2))
}
`;
    const res = parseSCDLV2(src);
    expect(res.ok).toBe(true);
    const seq = res.ast.declarations.find((d) => d.kind === 'SequenceDeclaration');
    expect(seq).toBeDefined();
    expect(seq.symbol).toBe('$fib');
    expect(seq.itemType).toBe('I32');
    expect(seq.seeds).toHaveLength(2);
    expect(seq.next.opcode).toBe('ADD');
  });

  it('parses RNG declarations and seeded expressions', () => {
    const src = `SCDL 2
ASSET test_rng
CANVAS WIDTH 64 HEIGHT 64

RNG $scatter ALGORITHM PCG32 SEED 481516
CONST $r I32 (RANDOM_I32 $scatter MIN 1 MAX 10)
CONST $v VEC2 (RANDOM_VEC2 $scatter MIN (PX -2) MAX (PX 2))
CONST $n FIXED (NOISE_2D SEED 42 AT (VEC2 (PX 0) (PX 0)) FREQUENCY 0.1 OCTAVES 3)
`;
    const res = parseSCDLV2(src);
    expect(res.ok).toBe(true);
    const rng = res.ast.declarations.find((d) => d.kind === 'RngDeclaration');
    expect(rng).toBeDefined();
    expect(rng.symbol).toBe('$scatter');
    expect(rng.algorithm).toBe('PCG32');
  });

  it('parses SHAPE generator blocks with RADIAL and FOR loops', () => {
    const src = `SCDL 2
ASSET test_shape_block
CANVAS WIDTH 64 HEIGHT 64

SHAPE $flower {
  RADIAL COUNT 8 {
    EMIT (CIRCLE CENTER (VEC2 (PX 0) (PX -6)) RADIUS (PX 3))
  }
}

SHAPE $stars {
  FOR $i IN (RANGE 0 5) {
    EMIT (CIRCLE CENTER (VEC2 (PX 10) (PX 10)) RADIUS (PX 2))
  }
}
`;
    const res = parseSCDLV2(src);
    expect(res.ok).toBe(true);
    const flower = res.ast.declarations.find((d) => d.kind === 'ShapeBlockDeclaration' && d.symbol === '$flower');
    expect(flower).toBeDefined();
    expect(flower.body[0].kind).toBe('RadialStatement');
    expect(flower.body[0].body[0].kind).toBe('EmitStatement');

    const stars = res.ast.declarations.find((d) => d.kind === 'ShapeBlockDeclaration' && d.symbol === '$stars');
    expect(stars).toBeDefined();
    expect(stars.body[0].kind).toBe('ForStatement');
  });

  it('parses LAYER block with FOR loops and PAINT', () => {
    const src = `SCDL 2
ASSET test_layer_loop
CANVAS WIDTH 64 HEIGHT 64

SHAPE $petal (CIRCLE CENTER (VEC2 (PX 0) (PX 0)) RADIUS (PX 3))

LAYER petals ORDER 10 {
  FOR $i IN (RANGE 0 4) {
    PAINT $petal AT (VEC2 (PX 10) (PX 10)) FILL #FF00FF RASTER CENTER
  }
}
`;
    const res = parseSCDLV2(src);
    expect(res.ok).toBe(true);
    const layer = res.ast.declarations.find((d) => d.kind === 'LayerDeclaration');
    expect(layer).toBeDefined();
    expect(layer.body[0].kind).toBe('ForStatement');
  });

  it('parses BUDGET with optional RECURSION_DEPTH', () => {
    const src = `SCDL 2
ASSET test_budget
CANVAS WIDTH 64 HEIGHT 64
BUDGET INSTRUCTIONS 10000 GENERATED_SHAPES 500 RASTER_CELLS 100000 RECURSION_DEPTH 32
`;
    const res = parseSCDLV2(src);
    expect(res.ok).toBe(true);
    const budget = res.ast.declarations.find((d) => d.kind === 'BudgetDeclaration');
    expect(budget.recursionDepth.value).toBe(32);
  });
});

import { describe, expect, it } from 'vitest';
import { parseSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js';
import { analyzeSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.analyzer.js';

describe('SCDL v2 Pure Functions and Recursion Bounds', () => {
  it('evaluates pure functions with arithmetic and returns expected values', () => {
    const source = `SCDL 2
ASSET fn_test
CANVAS WIDTH 16 HEIGHT 16
FN double PARAM $x I32 RETURNS I32 {
  RETURN (MUL $x 2)
}
CONST $ans I32 (CALL double 21)
SHAPE $s (CIRCLE CENTER (VEC2 (PX 8) (PX 8)) RADIUS (PX 4))
LAYER main ORDER 1 { PAINT $s FILL #FF0000 }`;

    const parseRes = parseSCDLV2(source);
    expect(parseRes.diagnostics).toHaveLength(0);
    const analysis = analyzeSCDLV2(parseRes.ast);
    expect(analysis.diagnostics).toHaveLength(0);
    expect(analysis.symbols.get('$ans').value).toBe(42);
  });

  it('supports local variable declarations (LET) with lexical scoping', () => {
    const source = `SCDL 2
ASSET fn_scope_test
CANVAS WIDTH 16 HEIGHT 16
FN calc PARAM $a I32 PARAM $b I32 RETURNS I32 {
  LET $sum I32 (ADD $a $b)
  LET $scaled I32 (MUL $sum 3)
  RETURN $scaled
}
CONST $res I32 (CALL calc 4 6)
SHAPE $s (CIRCLE CENTER (VEC2 (PX 8) (PX 8)) RADIUS (PX 4))
LAYER main ORDER 1 { PAINT $s FILL #FF0000 }`;

    const parseRes = parseSCDLV2(source);
    expect(parseRes.diagnostics).toHaveLength(0);
    const analysis = analyzeSCDLV2(parseRes.ast);
    expect(analysis.diagnostics).toHaveLength(0);
    expect(analysis.symbols.get('$res').value).toBe(30);
  });

  it('rejects functions with return type mismatches', () => {
    const source = `SCDL 2
ASSET fn_mismatch
CANVAS WIDTH 16 HEIGHT 16
FN bad PARAM $x I32 RETURNS I32 {
  RETURN (VEC2 (PX 1) (PX 2))
}
CONST $val I32 (CALL bad 5)
SHAPE $s (CIRCLE CENTER (VEC2 (PX 8) (PX 8)) RADIUS (PX 4))
LAYER main ORDER 1 { PAINT $s FILL #FF0000 }`;

    const parseRes = parseSCDLV2(source);
    const analysis = analyzeSCDLV2(parseRes.ast);
    expect(analysis.diagnostics.some((d) => d.code === 'SCDL-TYPE-002')).toBe(true);
  });

  it('rejects functions with argument count mismatches', () => {
    const source = `SCDL 2
ASSET fn_arg_count
CANVAS WIDTH 16 HEIGHT 16
FN need_two PARAM $a I32 PARAM $b I32 RETURNS I32 {
  RETURN (ADD $a $b)
}
CONST $val I32 (CALL need_two 5)
SHAPE $s (CIRCLE CENTER (VEC2 (PX 8) (PX 8)) RADIUS (PX 4))
LAYER main ORDER 1 { PAINT $s FILL #FF0000 }`;

    const parseRes = parseSCDLV2(source);
    const analysis = analyzeSCDLV2(parseRes.ast);
    expect(analysis.diagnostics.some((d) => d.code === 'SCDL-TYPE-003')).toBe(true);
  });

  it('rejects uncapped recursive functions with SCDL-TERM-001', () => {
    const source = `SCDL 2
ASSET uncapped_rec
CANVAS WIDTH 16 HEIGHT 16
FN infinite PARAM $n I32 RETURNS I32 {
  RETURN (CALL infinite (ADD $n 1))
}
CONST $val I32 (CALL infinite 0)
SHAPE $s (CIRCLE CENTER (VEC2 (PX 8) (PX 8)) RADIUS (PX 4))
LAYER main ORDER 1 { PAINT $s FILL #FF0000 }`;

    const parseRes = parseSCDLV2(source);
    const analysis = analyzeSCDLV2(parseRes.ast);
    expect(analysis.diagnostics.some((d) => d.code === 'SCDL-TERM-001')).toBe(true);
  });

  it('rejects RECURSION_MAX > 256 with SCDL-TERM-002', () => {
    const source = `SCDL 2
ASSET over_max
CANVAS WIDTH 16 HEIGHT 16
FN deep PARAM $n I32 RETURNS I32 RECURSION_MAX 300 {
  RETURN $n
}
SHAPE $s (CIRCLE CENTER (VEC2 (PX 8) (PX 8)) RADIUS (PX 4))
LAYER main ORDER 1 { PAINT $s FILL #FF0000 }`;

    const parseRes = parseSCDLV2(source);
    const analysis = analyzeSCDLV2(parseRes.ast);
    expect(analysis.diagnostics.some((d) => d.code === 'SCDL-TERM-002')).toBe(true);
  });

  it('rejects mutual recursion with SCDL-TERM-004', () => {
    const source = `SCDL 2
ASSET mutual_rec
CANVAS WIDTH 16 HEIGHT 16
FN ping PARAM $n I32 RETURNS I32 {
  RETURN (CALL pong $n)
}
FN pong PARAM $n I32 RETURNS I32 {
  RETURN (CALL ping $n)
}
CONST $val I32 (CALL ping 0)
SHAPE $s (CIRCLE CENTER (VEC2 (PX 8) (PX 8)) RADIUS (PX 4))
LAYER main ORDER 1 { PAINT $s FILL #FF0000 }`;

    const parseRes = parseSCDLV2(source);
    const analysis = analyzeSCDLV2(parseRes.ast);
    expect(analysis.diagnostics.some((d) => d.code === 'SCDL-TERM-004')).toBe(true);
  });

  it('correctly executes capped recursive functions such as factorial and fibonacci', () => {
    const source = `SCDL 2
ASSET fib_test
CANVAS WIDTH 16 HEIGHT 16
FN fib PARAM $n I32 RETURNS I32 RECURSION_MAX 10 {
  IF (LTE $n 1) {
    RETURN $n
  } ELSE {
    RETURN (ADD (CALL fib (SUB $n 1)) (CALL fib (SUB $n 2)))
  }
}
CONST $fib6 I32 (CALL fib 6)
SHAPE $s (CIRCLE CENTER (VEC2 (PX 8) (PX 8)) RADIUS (PX 4))
LAYER main ORDER 1 { PAINT $s FILL #FF0000 }`;

    const parseRes = parseSCDLV2(source);
    expect(parseRes.diagnostics).toHaveLength(0);
    const analysis = analyzeSCDLV2(parseRes.ast);
    expect(analysis.diagnostics).toHaveLength(0);
    expect(analysis.symbols.get('$fib6').value).toBe(8);
  });

  it('enforces RECURSION_MAX at runtime if recursion attempts to exceed limit', () => {
    const source = `SCDL 2
ASSET exceed_run
CANVAS WIDTH 16 HEIGHT 16
FN recurse PARAM $n I32 RETURNS I32 RECURSION_MAX 3 {
  IF (LTE $n 0) {
    RETURN 0
  } ELSE {
    RETURN (ADD 1 (CALL recurse (SUB $n 1)))
  }
}
CONST $exceeded I32 (CALL recurse 10)
SHAPE $s (CIRCLE CENTER (VEC2 (PX 8) (PX 8)) RADIUS (PX 4))
LAYER main ORDER 1 { PAINT $s FILL #FF0000 }`;

    const parseRes = parseSCDLV2(source);
    const analysis = analyzeSCDLV2(parseRes.ast);
    expect(analysis.diagnostics.some((d) => d.code === 'SCDL-TERM-002')).toBe(true);
  });
});

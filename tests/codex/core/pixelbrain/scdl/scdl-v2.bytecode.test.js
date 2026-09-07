import { describe, expect, it } from 'vitest';
import { parseSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js';
import { analyzeSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.analyzer.js';
import { verifySCDLV2Budget } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.budget.js';
import { lowerSCDLV2Bytecode } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.bytecode.js';

function lower(source, options = {}) {
  const analysis = analyzeSCDLV2(parseSCDLV2(source).ast);
  const budget = verifySCDLV2Budget(analysis.ir, options);
  return { budget, program: budget.ok ? lowerSCDLV2Bytecode(analysis.ir, budget.verified) : null };
}

const SOURCE = `SCDL 2
ASSET first_name
CANVAS WIDTH 9 HEIGHT 9
CONST $n I32 (ADD 1 1)
CONST $c VEC2 (VEC2 (PX 4) (PX 4))
SHAPE $s (CIRCLE CENTER $c RADIUS (PX $n))
LAYER ink ORDER 10 { PAINT $s FILL #55CCFF RASTER MIDPOINT }`;

describe('SCDL-BC-v2 lowering', () => {
  it('rejects a source request above protected host limits before lowering', () => {
    const result = lower(SOURCE.replace('CANVAS WIDTH 9 HEIGHT 9', 'CANVAS WIDTH 9 HEIGHT 9\nBUDGET INSTRUCTIONS 200001 GENERATED_SHAPES 1 RASTER_CELLS 81'));
    expect(result.budget.ok).toBe(false);
    expect(result.budget.diagnostics[0].code).toBe('SCDL-BUDGET-001');
    expect(result.program).toBeNull();
  });

  it('rejects measured raster demand over a stricter source limit', () => {
    const result = lower(SOURCE.replace('CANVAS WIDTH 9 HEIGHT 9', 'CANVAS WIDTH 9 HEIGHT 9\nBUDGET INSTRUCTIONS 128 GENERATED_SHAPES 1 RASTER_CELLS 10'));
    expect(result.budget.ok).toBe(false);
    expect(result.budget.diagnostics.some((d) => d.code === 'SCDL-BUDGET-002' && d.received.includes('25'))).toBe(true);
  });

  it('emits typed SSA registers and stable algorithm declarations', () => {
    const { program } = lower(SOURCE);
    expect(program.contract).toBe('SCDL-BC-v2');
    expect(program.text).toContain('.algorithm rational=RAT-REDUCED-v1');
    expect(program.text).toContain('.algorithm circle.midpoint=CIRCLE-FILL-MIDPOINT-v1');
    expect(program.instructions.every((instruction, index) => instruction.index === index)).toBe(true);
    expect(program.instructions.filter((instruction) => instruction.result !== null).every((instruction) => /^%\d+$/.test(instruction.result))).toBe(true);
  });

  it('ignores comments, formatting, asset name, and local symbol spelling in identity', () => {
    const a = lower(SOURCE).program;
    const b = lower(SOURCE.replace('first_name', 'second_name').replaceAll('$n', '$radius').replaceAll('$c', '$center').replaceAll('$s', '$orb').replace('SCDL 2', 'SCDL 2\n# note')).program;
    expect(b.text).toBe(a.text);
    expect(b.programId).toBe(a.programId);
  });

  it('changes identity when math or painter order changes', () => {
    const a = lower(SOURCE).program.programId;
    const b = lower(SOURCE.replace('(ADD 1 1)', '(ADD 1 2)')).program.programId;
    expect(b).not.toBe(a);
  });
});
describe('verifySCDLV2Budget declaration accounting', () => {
  // A CONST/SHAPE declaration that no PAINT ever reaches is still real
  // static cost the source asked the compiler to hold: it is not free just
  // because it never reaches the raster. These reproduce the reviewer
  // finding against small, fast fixtures instead of the original
  // 40,000/20,000-declaration repro.
  const UNUSED_SHAPES_SOURCE = `SCDL 2
ASSET unused_shapes
CANVAS WIDTH 9 HEIGHT 9
BUDGET INSTRUCTIONS 200000 GENERATED_SHAPES 3 RASTER_CELLS 1048576
CONST $n I32 (ADD 1 1)
CONST $c VEC2 (VEC2 (PX 4) (PX 4))
SHAPE $s (CIRCLE CENTER $c RADIUS (PX $n))
SHAPE $u1 (CIRCLE CENTER $c RADIUS (PX 1))
SHAPE $u2 (CIRCLE CENTER $c RADIUS (PX 1))
SHAPE $u3 (CIRCLE CENTER $c RADIUS (PX 1))
LAYER ink ORDER 10 { PAINT $s FILL #55CCFF RASTER MIDPOINT }`;

  it('rejects generatedShapes demand inflated by unreferenced SHAPE declarations', () => {
    const analysis = analyzeSCDLV2(parseSCDLV2(UNUSED_SHAPES_SOURCE).ast);
    expect(analysis.ok).toBe(true);
    const budget = verifySCDLV2Budget(analysis.ir, {});
    expect(budget.ok).toBe(false);
    const violation = budget.diagnostics.find((d) => d.code === 'SCDL-BUDGET-002' && d.relatedSymbols.includes('generatedShapes'));
    expect(violation).toBeDefined();
    // 1 reached ($s) + 3 unreferenced ($u1..$u3) = 4, over the requested 3.
    expect(violation.received).toContain('4');
  });

  it('still analyzes the unreferenced-declaration source successfully (dead code, not invalid code)', () => {
    const analysis = analyzeSCDLV2(parseSCDLV2(UNUSED_SHAPES_SOURCE).ast);
    expect(analysis.ok).toBe(true);
    expect(analysis.ir.shapes.length).toBe(4);
  });

  const UNUSED_CONSTS_SOURCE = `SCDL 2
ASSET unused_consts
CANVAS WIDTH 9 HEIGHT 9
BUDGET INSTRUCTIONS 20 GENERATED_SHAPES 10000 RASTER_CELLS 1048576
CONST $n I32 (ADD 1 1)
CONST $c VEC2 (VEC2 (PX 4) (PX 4))
CONST $u1 I32 5
CONST $u2 I32 5
CONST $u3 I32 5
SHAPE $s (CIRCLE CENTER $c RADIUS (PX $n))
LAYER ink ORDER 10 { PAINT $s FILL #55CCFF RASTER MIDPOINT }`;

  it('rejects instructions demand inflated by unreferenced CONST declarations', () => {
    const analysis = analyzeSCDLV2(parseSCDLV2(UNUSED_CONSTS_SOURCE).ast);
    expect(analysis.ok).toBe(true);
    const budget = verifySCDLV2Budget(analysis.ir, {});
    expect(budget.ok).toBe(false);
    const violation = budget.diagnostics.find((d) => d.code === 'SCDL-BUDGET-002' && d.relatedSymbols.includes('instructions'));
    expect(violation).toBeDefined();
    // Baseline reachable-only demand is 16; three unreferenced `CONST $u I32`
    // declarations add 2 instructions each (bind + literal) = 22.
    expect(violation.received).toContain('22');
  });

  it('does not double-count a SHAPE declaration that a PAINT does reach', () => {
    const analysis = analyzeSCDLV2(parseSCDLV2(SOURCE).ast);
    const budget = verifySCDLV2Budget(analysis.ir, {});
    expect(budget.ok).toBe(true);
    // One CIRCLE, reached by exactly one PAINT: charged once, not twice.
    expect(budget.verified.demand.generatedShapes).toBe(1);
  });

  // Fix round 2: `SHAPE` is also a legal CONST-declared type (`SCDL_V2_TYPES`
  // includes 'SHAPE'; `CONST $x SHAPE (CIRCLE ...)` is valid syntax). Round 1
  // only unified `ir.shapes` (the `SHAPE $x (...)` keyword form) into the
  // generatedShapes count; a CONST-typed SHAPE value landed in `ir.constants`
  // instead and evaded the gate exactly as the original finding described.
  // This is the re-reviewer's exact repro at reduced scale: 3 unreferenced
  // `CONST $u SHAPE (CIRCLE ...)` declarations + 1 painted `SHAPE $s`, against
  // a tight GENERATED_SHAPES budget.
  const UNUSED_CONST_SHAPES_SOURCE = `SCDL 2
ASSET unused_const_shapes
CANVAS WIDTH 9 HEIGHT 9
BUDGET INSTRUCTIONS 200000 GENERATED_SHAPES 2 RASTER_CELLS 1048576
CONST $n I32 (ADD 1 1)
CONST $c VEC2 (VEC2 (PX 4) (PX 4))
CONST $u1 SHAPE (CIRCLE CENTER $c RADIUS (PX 1))
CONST $u2 SHAPE (CIRCLE CENTER $c RADIUS (PX 1))
CONST $u3 SHAPE (CIRCLE CENTER $c RADIUS (PX 1))
SHAPE $s (CIRCLE CENTER $c RADIUS (PX $n))
LAYER ink ORDER 10 { PAINT $s FILL #55CCFF RASTER MIDPOINT }`;

  it('rejects generatedShapes demand inflated by unreferenced CONST-typed SHAPE declarations', () => {
    const analysis = analyzeSCDLV2(parseSCDLV2(UNUSED_CONST_SHAPES_SOURCE).ast);
    expect(analysis.ok).toBe(true);
    const budget = verifySCDLV2Budget(analysis.ir, {});
    expect(budget.ok).toBe(false);
    const violation = budget.diagnostics.find((d) => d.code === 'SCDL-BUDGET-002' && d.relatedSymbols.includes('generatedShapes'));
    expect(violation).toBeDefined();
    // 1 painted ($s) + 3 unreferenced CONST-typed SHAPE ($u1..$u3) = 4,
    // over the requested 2. Before the fix this reported 1 and passed.
    expect(violation.received).toContain('4');
  });

  it('does not double-count a CONST-typed SHAPE that a PAINT does reach', () => {
    const source = `SCDL 2
ASSET const_shape_painted
CANVAS WIDTH 9 HEIGHT 9
CONST $n I32 (ADD 1 1)
CONST $c VEC2 (VEC2 (PX 4) (PX 4))
CONST $s SHAPE (CIRCLE CENTER $c RADIUS (PX $n))
LAYER ink ORDER 10 { PAINT $s FILL #55CCFF RASTER MIDPOINT }`;
    const analysis = analyzeSCDLV2(parseSCDLV2(source).ast);
    expect(analysis.ok).toBe(true);
    const budget = verifySCDLV2Budget(analysis.ir, {});
    expect(budget.ok).toBe(true);
    // Exactly one CIRCLE declared and painted: one generated-shape unit.
    expect(budget.verified.demand.generatedShapes).toBe(1);
    // Instruction cost for the CIRCLE's node tree must be charged exactly
    // once (via the CONST declaration walk), not a second time by the paint
    // loop. Rather than hand-deriving the exact expected count, assert the
    // double-count-free invariant directly: the same declared-and-painted
    // CIRCLE, declared via the `SHAPE` keyword instead of `CONST ... SHAPE`,
    // must cost the identical number of instructions — both are the same
    // shape, once declared and once painted, regardless of which legal
    // declaration syntax produced it.
    const shapeKeywordSource = `SCDL 2
ASSET const_shape_painted
CANVAS WIDTH 9 HEIGHT 9
CONST $n I32 (ADD 1 1)
CONST $c VEC2 (VEC2 (PX 4) (PX 4))
SHAPE $s (CIRCLE CENTER $c RADIUS (PX $n))
LAYER ink ORDER 10 { PAINT $s FILL #55CCFF RASTER MIDPOINT }`;
    const shapeKeywordAnalysis = analyzeSCDLV2(parseSCDLV2(shapeKeywordSource).ast);
    const shapeKeywordBudget = verifySCDLV2Budget(shapeKeywordAnalysis.ir, {});
    expect(shapeKeywordBudget.ok).toBe(true);
    expect(budget.verified.demand.instructions).toBe(shapeKeywordBudget.verified.demand.instructions);
  });

  it('emits BC.AMP.SELECT and BC.AMP.APPLY conforming to opcode operand contracts', () => {
    const src = `SCDL 2
ASSET amp_contract_test
CANVAS WIDTH 16 HEIGHT 16
SELECT_AMPS PIPELINE render-fidelity
SHAPE $base (PIXEL AT (VEC2 (PX 0) (PX 0)))
APPLY_AMP $out SHAPE {
  AMP pixelbrain.facet
  VERSION 1.0.0
  STAGE SHAPE_POST
  INPUT geometry $base
  PARAM facetCount 6
}
LAYER l ORDER 1 { PAINT $out FILL #ffffff }
`;
    const analysis = analyzeSCDLV2(parseSCDLV2(src).ast);
    expect(analysis.ok).toBe(true);
    const budget = verifySCDLV2Budget(analysis.ir, {});
    const bc = lowerSCDLV2Bytecode(analysis.ir, budget.verified);
    expect(bc).toBeDefined();

    const selectInst = bc.instructions.find((i) => i.mnemonic === 'BC.AMP.SELECT');
    expect(selectInst).toBeDefined();
    expect(selectInst.operands).toHaveLength(1);
    expect(Array.isArray(selectInst.operands[0].value)).toBe(true);

    const applyInst = bc.instructions.find((i) => i.mnemonic === 'BC.AMP.APPLY' && i.operands[0].value === 'pixelbrain.facet');
    expect(applyInst).toBeDefined();
    expect(applyInst.operands).toHaveLength(4);
    expect(applyInst.operands[0].value).toBe('pixelbrain.facet');
    expect(applyInst.operands[1].value).toBe('SHAPE_POST');
    expect(typeof applyInst.operands[2].value).toBe('object');
    expect(typeof applyInst.operands[3].value).toBe('object');
  });

  it('emits exactly one BC.AMP.APPLY for explicit APPLY_AMP statement (no duplicate lowering)', () => {
    const src = `SCDL 2
ASSET explicit_single_apply
CANVAS WIDTH 16 HEIGHT 16
SHAPE $base (PIXEL AT (VEC2 (PX 0) (PX 0)))
APPLY_AMP $out SHAPE {
  AMP pixelbrain.facet
  VERSION 1.0.0
  STAGE SHAPE_POST
  INPUT geometry $base
  PARAM facetCount 6
}
LAYER l ORDER 1 { PAINT $out FILL #ffffff }
`;
    const analysis = analyzeSCDLV2(parseSCDLV2(src).ast);
    expect(analysis.ok).toBe(true);
    const budget = verifySCDLV2Budget(analysis.ir, {});
    const bc = lowerSCDLV2Bytecode(analysis.ir, budget.verified);
    expect(bc).toBeDefined();

    const applyInsts = bc.instructions.filter((i) => i.mnemonic === 'BC.AMP.APPLY');
    expect(applyInsts).toHaveLength(1);
    expect(applyInsts[0].operands[0].value).toBe('pixelbrain.facet');
  });

  it('emits BC.AMP.SELECT [] for empty SELECT_AMPS result retaining authored selection operation', () => {
    const src = `SCDL 2
ASSET empty_select_amps
CANVAS WIDTH 16 HEIGHT 16
SELECT_AMPS PIPELINE non-matching-pipeline
LAYER l ORDER 1 { PAINT (PIXEL AT (VEC2 (PX 0) (PX 0))) FILL #ffffff }
`;
    const analysis = analyzeSCDLV2(parseSCDLV2(src).ast);
    expect(analysis.ok).toBe(true);
    expect(analysis.ir.selectAmpsEnabled).toBe(true);
    expect(analysis.ir.selectedAmps).toHaveLength(0);

    const budget = verifySCDLV2Budget(analysis.ir, {});
    const bc = lowerSCDLV2Bytecode(analysis.ir, budget.verified);
    expect(bc).toBeDefined();

    const selectInst = bc.instructions.find((i) => i.mnemonic === 'BC.AMP.SELECT');
    expect(selectInst).toBeDefined();
    expect(selectInst.operands).toHaveLength(1);
    expect(selectInst.operands[0].value).toEqual([]);
  });
});

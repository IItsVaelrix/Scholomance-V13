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

import { describe, it, expect } from 'vitest';
import { parseSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.grammar.js';
import { resolveColorsPass } from '../../../../../codex/core/pixelbrain/scdl/passes/resolve-colors.pass.js';
import { resolveMaterialsPass } from '../../../../../codex/core/pixelbrain/scdl/passes/resolve-materials.pass.js';
import { SCDL_ERROR_CODES } from '../../../../../codex/core/pixelbrain/scdl/scdl.errors.js';

const SRC = `
asset a canvas 16x16
palette { leafc = #14301E }
def tree {
  part canopy material pine_needle { circle 0 0 radius 3 leafc }
}
group g at 4 4 { instance tree at 0 0 material not_a_material }
export json
`;

describe('resolve passes — graph traversal', () => {
  it('resolves palette aliases inside def parts', () => {
    const { rawAst } = parseSCDL(SRC);
    const errors = [];
    const ast = resolveColorsPass(rawAst, errors);
    expect(errors.filter(e => e.severity === 'ERROR')).toEqual([]);
    const canopyOp = ast.defs[0].nodes[0].part.ops[0];
    expect(canopyOp.color).toBe('#14301E');
    expect(canopyOp.colorRef).toBeUndefined();
  });

  it('normalizes def part materials and instance overrides (SCDL-005 warn)', () => {
    const { rawAst } = parseSCDL(SRC);
    const errors = [];
    const ast = resolveMaterialsPass(rawAst, errors);
    expect(ast.defs[0].nodes[0].part.material).toBe('pine_needle');
    const inst = ast.roots.find(n => n.kind === 'group').children[0];
    expect(inst.materialOverride).toBe('source'); // fallback
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.UNKNOWN_MATERIAL)).toBe(true);
  });

  it('undefined alias inside a def errors (SCDL-006)', () => {
    const { rawAst } = parseSCDL(
      'asset a canvas 8x8\ndef d { part p material gold { cell 0 0 ghost } }\ngroup g at 0 0 { instance d at 0 0 }\nexport json'
    );
    const errors = [];
    resolveColorsPass(rawAst, errors);
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.UNDEFINED_PALETTE_REF)).toBe(true);
  });
});

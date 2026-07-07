import { describe, it, expect } from 'vitest';
import { parseSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.grammar.js';
import { resolveColorsPass } from '../../../../../codex/core/pixelbrain/scdl/passes/resolve-colors.pass.js';
import { resolveMaterialsPass } from '../../../../../codex/core/pixelbrain/scdl/passes/resolve-materials.pass.js';
import { buildSceneGraphPass, DEPTH_CAP } from '../../../../../codex/core/pixelbrain/scdl/passes/build-scene-graph.pass.js';
import { SCDL_ERROR_CODES } from '../../../../../codex/core/pixelbrain/scdl/scdl.errors.js';

function build(source) {
  const { rawAst } = parseSCDL(source);
  const errors = [];
  let ast = resolveColorsPass(rawAst, errors);
  ast = resolveMaterialsPass(ast, errors);
  ast = buildSceneGraphPass(ast, errors);
  return { ast, errors };
}

const OK_SRC = `
asset a canvas 32x32
palette { c = #112233 }
def leaf { part p material gold { cell 0 0 c } }
def tree {
  part trunk material bark { rect 0 0 1 4 c }
  instance leaf at 0 -1
}
group g at 8 8 { instance tree at 2 2 rotate 90 }
export json
`;

describe('buildSceneGraphPass', () => {
  it('emits PB-SCENE-GRAPH-v1 with canonical nodes and no loc fields', () => {
    const { ast, errors } = build(OK_SRC);
    expect(errors.filter(e => e.severity === 'ERROR')).toEqual([]);
    const sg = ast.sceneGraph;
    expect(sg.contract).toBe('PB-SCENE-GRAPH-v1');
    expect(sg.depthCap).toBe(DEPTH_CAP);
    expect(Object.keys(sg.defs).sort()).toEqual(['leaf', 'tree']);
    expect(JSON.stringify(sg)).not.toMatch(/"loc"|"sourceSpan"|"annotations"/);
    const inst = sg.roots[0].children[0];
    expect(inst).toEqual({
      kind: 'instance', ref: 'tree', name: null,
      transform: { tx: 2, ty: 2, theta: 90, sx: 1, sy: 1, mirror: null },
      materialOverride: null,
    });
  });

  it('SCDL-016 on unknown def reference', () => {
    const { errors } = build('asset a canvas 8x8\ngroup g at 0 0 { instance ghost at 0 0 }\nexport json');
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.UNKNOWN_DEF_REF)).toBe(true);
  });

  it('SCDL-017 on def cycle', () => {
    const { errors } = build(`asset a canvas 8x8
def x { instance y at 0 0 }
def y { instance x at 0 0 }
group g at 0 0 { instance x at 0 0 }
export json`);
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.DEF_CYCLE)).toBe(true);
  });

  it('SCDL-018 when expansion depth exceeds 8', () => {
    // Chain d1→d2→...→d9
    const defs = [];
    for (let i = 9; i >= 1; i--) {
      defs.push(i === 9
        ? `def d9 { part p material gold { cell 0 0 #ffffff } }`
        : `def d${i} { instance d${i + 1} at 0 0 }`);
    }
    const { errors } = build(
      `asset a canvas 8x8\n${defs.reverse().join('\n')}\ngroup g at 0 0 { instance d1 at 0 0 }\nexport json`
    );
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.DEPTH_CAP)).toBe(true);
  });

  it('SCDL-020 warn on instance fully off-canvas', () => {
    const { errors } = build(`asset a canvas 8x8
def d { part p material gold { cell 0 0 #ffffff } }
group g at 0 0 { instance d at 100 100 }
export json`);
    const w = errors.find(e => e.code === SCDL_ERROR_CODES.DEAD_INSTANCE);
    expect(w).toBeDefined();
    expect(w.severity).toBe('WARN');
  });

  it('SCDL-021 warn on never-instanced def', () => {
    const { errors } = build(`asset a canvas 8x8
def unused { part p material gold { cell 0 0 #ffffff } }
part bg material gold { cell 1 1 #ffffff }
export json`);
    const w = errors.find(e => e.code === SCDL_ERROR_CODES.DEAD_DEF);
    expect(w).toBeDefined();
    expect(w.severity).toBe('WARN');
  });
});

import { describe, it, expect } from 'vitest';
import { parseSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.grammar.js';

const DEF_SOURCE = `
asset forest canvas 32x32
palette { trunkc = #26180E }
def tree {
  part trunk material bark { rect -1 0 3 8 trunkc }
}
part ground material bark { rect 0 24 32 8 trunkc }
export json
`;

describe('SCDL v1.2 grammar — def blocks', () => {
  it('parses defs with local parts and negative coords', () => {
    const { ast, errors } = parseSCDL(DEF_SOURCE);
    expect(errors.filter(e => e.severity === 'ERROR')).toEqual([]);
    expect(ast.version).toBe('1.2.0');
    expect(ast.defs).toHaveLength(1);
    expect(ast.defs[0].id).toBe('tree');
    expect(ast.defs[0].nodes[0].kind).toBe('part');
    expect(ast.defs[0].nodes[0].part.id).toBe('trunk');
    expect(ast.defs[0].nodes[0].part.ops[0].x).toBe(-1);
    expect(ast.graphMode).toBe(true);
  });

  it('legacy sources have empty defs and graphMode false', () => {
    const { ast } = parseSCDL('asset a canvas 4x4\npart p material gold { cell 1 1 #ffffff }\nexport json');
    expect(ast.defs).toEqual([]);
    expect(ast.graphMode).toBe(false);
    expect(ast.parts).toHaveLength(1);
  });
});

const GRAPH_SOURCE = `
asset forest canvas 64x48
palette { trunkc = #26180E  leafc = #14301E }
def tree {
  part trunk material bark { rect -1 0 3 8 trunkc }
  part canopy material pine_needle { circle 0 -4 radius 5 leafc }
}
part sky material void_cloth { rect 0 0 64 20 trunkc }
group forest at 0 24 {
  instance tree at 10 0
  instance tree as big at 30 2 rotate 8 scale 1.4 0.9 mirror x material icy_fire
  group hill at 44 4 rotate 90 {
    instance tree at 0 0 scale 0.7
  }
}
export json
`;

describe('SCDL v1.2 grammar — group/instance/transform', () => {
  it('parses groups, instances, and transform clauses', () => {
    const { ast, errors } = parseSCDL(GRAPH_SOURCE);
    expect(errors.filter(e => e.severity === 'ERROR')).toEqual([]);
    expect(ast.graphMode).toBe(true);
    expect(ast.roots.map(n => n.kind)).toEqual(['part', 'group']);

    const forest = ast.roots[1];
    expect(forest.id).toBe('forest');
    expect(forest.transform).toEqual({ tx: 0, ty: 24, theta: 0, sx: 1, sy: 1, mirror: null });
    expect(forest.children.map(n => n.kind)).toEqual(['instance', 'instance', 'group']);

    const plain = forest.children[0];
    expect(plain).toMatchObject({ ref: 'tree', name: null, materialOverride: null });
    expect(plain.transform).toEqual({ tx: 10, ty: 0, theta: 0, sx: 1, sy: 1, mirror: null });

    const big = forest.children[1];
    expect(big.name).toBe('big');
    expect(big.transform).toEqual({ tx: 30, ty: 2, theta: 8, sx: 1.4, sy: 0.9, mirror: 'x' });
    expect(big.materialOverride).toBe('icy_fire');

    const hill = forest.children[2];
    expect(hill.transform.theta).toBe(90);
    expect(hill.children[0].transform).toEqual({ tx: 0, ty: 0, theta: 0, sx: 0.7, sy: 0.7, mirror: null });
  });

  it('flags instance without at as _missingAt', () => {
    const { ast } = parseSCDL(
      'asset a canvas 8x8\ndef d { part p material gold { cell 0 0 #ffffff } }\ngroup g at 0 0 { instance d }\nexport json'
    );
    expect(ast.roots[0].children[0].transform._missingAt).toBe(true);
  });

  it('root parts remain in ast.parts by reference', () => {
    const { ast } = parseSCDL(GRAPH_SOURCE);
    expect(ast.parts).toHaveLength(1);
    expect(ast.parts[0]).toBe(ast.roots[0].part);
  });
});

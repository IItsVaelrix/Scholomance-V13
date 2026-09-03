import { describe, it, expect } from 'vitest';
import { expandVectorPass } from '../../../../../../codex/core/pixelbrain/scdl/passes/expand-vector.pass.js';

function astWithPart(ops) {
  return {
    canvas: { width: 16, height: 16 },
    parts: [{ id: 'body', material: 'stone', ops }],
  };
}

describe('expandVectorPass sdfPrimitives capture', () => {
  it('a part built from one circle op gets one sdfPrimitives entry', () => {
    const ast = astWithPart([{ op: 'circle', cx: 8, cy: 8, radius: 4 }]);
    const result = expandVectorPass(ast, []);
    expect(result.parts[0].sdfPrimitives).toEqual([
      { type: 'circle', params: { center: { x: 8, y: 8 }, radius: 4 } },
    ]);
  });

  it('a part built from a path op (no lossless mapping) gets an empty sdfPrimitives array, not undefined', () => {
    const ast = astWithPart([{ op: 'path', d: 'M0 0 L4 4' }]);
    const result = expandVectorPass(ast, []);
    expect(result.parts[0].sdfPrimitives).toEqual([]);
  });

  it('does not change part.ops — the expanded cell list is untouched by this capture', () => {
    const ast = astWithPart([{ op: 'circle', cx: 8, cy: 8, radius: 4 }]);
    const result = expandVectorPass(ast, []);
    expect(result.parts[0].ops.every((o) => o.op === 'cell')).toBe(true);
  });
});

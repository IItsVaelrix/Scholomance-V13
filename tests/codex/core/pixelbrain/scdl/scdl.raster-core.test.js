import { describe, it, expect } from 'vitest';
import {
  pushCell, acceptAll, rasterizeCircle, rasterizePolygon, rasterizeRect, rasterizeLine,
} from '../../../../../codex/core/pixelbrain/scdl/render/raster-core.js';

describe('raster-core (unclipped rasterizers)', () => {
  it('rasterizes a circle across negative local coordinates', () => {
    const ops = [];
    rasterizeCircle({ cx: 0, cy: 0, radius: 1.5, color: '#ff0000', loc: {} }, acceptAll, ops);
    const keys = ops.map(o => `${o.x},${o.y}`);
    expect(keys).toContain('-1,0');
    expect(keys).toContain('0,-1');
    expect(keys).toContain('0,0');
  });

  it('polygon scanline covers its own AABB, not [0, W)', () => {
    const ops = [];
    rasterizePolygon(
      { points: [[-3, -1], [2, -1], [2, 2], [-3, 2]], color: '#00ff00', loc: {} },
      acceptAll, ops
    );
    const keys = new Set(ops.map(o => `${o.x},${o.y}`));
    expect(keys.has('-3,0')).toBe(true);
    expect(keys.has('1,1')).toBe(true);
  });

  it('accept predicate clips exactly like canvas bounds', () => {
    const clipped = [];
    const accept = (x, y) => x >= 0 && x < 4 && y >= 0 && y < 4;
    rasterizeRect({ x: -2, y: 1, w: 8, h: 1, color: '#0000ff', loc: {} }, accept, clipped);
    expect(clipped.map(o => o.x)).toEqual([0, 1, 2, 3]);
  });

  it('pushCell propagates partId/material/role from sourceOp', () => {
    const ops = [];
    rasterizeLine(
      { x0: 0, y0: 0, x1: 2, y1: 0, color: '#ffffff', loc: {}, partId: 'p1', material: 'gold', role: 'trim' },
      acceptAll, ops
    );
    expect(ops[0].partId).toBe('p1');
    expect(ops[0].material).toBe('gold');
    expect(ops[0].role).toBe('trim');
    expect(ops[0]._fromVector).toBe(true);
  });
});

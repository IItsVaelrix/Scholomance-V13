import { describe, it, expect } from 'vitest';
import { computeVectorIdentity } from '../../../../../../codex/core/pixelbrain/scdl/render/raster-core.js';

describe('computeVectorIdentity regression (pre/post opToSDFPrimitive refactor)', () => {
  it('circle: signedDistance/normal/tangent/curvature at a real sample point', () => {
    const op = { op: 'circle', cx: 8, cy: 8, rx: 4, ry: 4 };
    const result = computeVectorIdentity(op, 10, 8);
    expect(result).toEqual({
      signedDistance: -2,
      t: 0.5,
      tangent: [-0, 1],
      normal: [1, 0],
      curvature: 0.25,
      arcLength: 2 * Math.PI * 4,
      halfWidth: 0.5,
    });
  });

  it('rect: signedDistance/normal/tangent/curvature at a real sample point', () => {
    const op = { op: 'rect', x: 2, y: 2, w: 4, h: 4 };
    const result = computeVectorIdentity(op, 4, 2);
    expect(result.signedDistance).toBeCloseTo(0, 5);
    expect(result.tangent).toBeDefined();
    expect(result.normal).toBeDefined();
  });
});

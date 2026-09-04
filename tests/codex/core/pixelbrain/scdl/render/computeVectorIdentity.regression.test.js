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
      // This sample sits at sd = -2, strictly inside the stroke band, and a
      // circle FILLS — so it is marked interior fill. The renderer reads this
      // to apply half-space coverage; without it a disc renders hollow.
      interiorFill: true,
    });
  });

  it('rect: signedDistance/normal/tangent/curvature at a real sample point', () => {
    const op = { op: 'rect', x: 2, y: 2, w: 4, h: 4 };
    const result = computeVectorIdentity(op, 4, 2);
    expect(result.signedDistance).toBeCloseTo(0, 5);
    expect(result.tangent).toBeDefined();
    expect(result.normal).toBeDefined();
  });

  describe('texture flow direction (t/tangent) is continuous across polygon/rect interiors', () => {
    // Regression for the "ripped" texture-noise look on lightning-sword's
    // blade: `t`/`tangent` used to come from a per-pixel nearest-edge search,
    // which is a nearest-point-on-boundary map — mathematically discontinuous
    // wherever two edges are equidistant (the shape's medial axis), independent
    // of implementation care. Measured on the real blade polygon before the
    // fix: t jumped from 0.883 to 0.143 between x=7 and x=8 at every row (a
    // ~31-unit swing in t*arcLength), because "nearest edge" flipped from the
    // shape's left side to its right side at that column. Texture Pass 2 feeds
    // that straight into sin(s * frequency * 2*PI), so the jump reads as the
    // noise pattern restarting mid-shape — a hard seam, not a subtle artifact.
    const blade = {
      op: 'polygon',
      points: [[7, 3], [9, 4], [10, 12], [9, 22], [6, 22], [6, 12]],
    };

    it('tangent is the same vector on both sides of the former seam (x=7 vs x=8)', () => {
      const left = computeVectorIdentity(blade, 7, 12);
      const right = computeVectorIdentity(blade, 8, 12);
      expect(left.tangent[0]).toBeCloseTo(right.tangent[0], 6);
      expect(left.tangent[1]).toBeCloseTo(right.tangent[1], 6);
    });

    it('t changes by a bounded amount per pixel step, at the former seam and elsewhere', () => {
      for (const y of [8, 12, 15, 18, 20]) {
        let prev = null;
        for (let x = 5; x <= 10; x++) {
          const vi = computeVectorIdentity(blade, x, y);
          if (!vi) continue;
          if (prev != null) {
            // A genuine per-pixel step in a linear projection can't exceed
            // sqrt(2) (the diagonal of one cell); the old bug's jump (~31
            // units) was four orders of magnitude past any legitimate step.
            expect(Math.abs(vi.t - prev)).toBeLessThan(2);
          }
          prev = vi.t;
        }
      }
    });

    it('curvature is 0 for a straight polygon edge (no near-edge threshold spike)', () => {
      const nearEdge = computeVectorIdentity(blade, 6, 15); // signedDistance ~ 0
      expect(nearEdge.curvature).toBe(0);
    });

    it('rect has the same continuity property across its former corner-diagonal seams', () => {
      const rect = { op: 'rect', x: 0, y: 0, w: 10, h: 4 };
      // The old nearest-edge branch flipped exactly on the diagonals from each
      // corner (where ddx === ddy) — sample straddling one.
      const before = computeVectorIdentity(rect, 3, 2);
      const after = computeVectorIdentity(rect, 4, 2);
      expect(before.tangent[0]).toBeCloseTo(after.tangent[0], 6);
      expect(before.tangent[1]).toBeCloseTo(after.tangent[1], 6);
      expect(Math.abs(after.t - before.t)).toBeLessThan(2);
    });
  });
});

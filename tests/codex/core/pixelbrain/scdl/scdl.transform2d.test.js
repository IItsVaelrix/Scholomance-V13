import { describe, it, expect } from 'vitest';
import {
  identity, matFromTransform, matMul, matInvert, matApply,
  isIntegerTranslation, transformAABB,
} from '../../../../../codex/core/pixelbrain/scdl/render/transform2d.js';

describe('transform2d', () => {
  it('identity maps points to themselves', () => {
    expect(matApply(identity(), 3.5, -2)).toEqual([3.5, -2]);
  });

  it('composes scale → mirror → rotate → translate in that order', () => {
    // point (1,0): scale 2 → (2,0); mirror x (negate x) → (-2,0);
    // rotate 90° → (0,-2); translate (10,5) → (10,3)
    const m = matFromTransform({ tx: 10, ty: 5, theta: 90, sx: 2, sy: 2, mirror: 'x' });
    const [x, y] = matApply(m, 1, 0);
    expect(x).toBeCloseTo(10, 12);
    expect(y).toBeCloseTo(3, 12);
  });

  it('right-angle rotations are exact integers (no 6e-17 residue)', () => {
    for (const theta of [0, 90, 180, 270, 360, -90]) {
      const m = matFromTransform({ tx: 0, ty: 0, theta, sx: 1, sy: 1, mirror: null });
      for (const v of [m.a, m.b, m.c, m.d]) expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('matInvert · mat is identity; degenerate returns null', () => {
    const m = matFromTransform({ tx: 7, ty: -3, theta: 33, sx: 1.4, sy: 0.7, mirror: 'y' });
    const inv = matInvert(m);
    const [x, y] = matApply(inv, ...matApply(m, 2.25, -1.5));
    expect(x).toBeCloseTo(2.25, 9);
    expect(y).toBeCloseTo(-1.5, 9);
    expect(matInvert({ a: 0, b: 0, c: 0, d: 0, e: 1, f: 1 })).toBeNull();
  });

  it('isIntegerTranslation detects the lattice fast path', () => {
    expect(isIntegerTranslation(matFromTransform({ tx: 4, ty: -2, theta: 0, sx: 1, sy: 1, mirror: null }))).toBe(true);
    expect(isIntegerTranslation(matFromTransform({ tx: 4.5, ty: 0, theta: 0, sx: 1, sy: 1, mirror: null }))).toBe(false);
    expect(isIntegerTranslation(matFromTransform({ tx: 4, ty: 0, theta: 90, sx: 1, sy: 1, mirror: null }))).toBe(false);
  });

  it('transformAABB bounds a rotated box', () => {
    const m = matFromTransform({ tx: 0, ty: 0, theta: 90, sx: 1, sy: 1, mirror: null });
    const box = transformAABB(m, { minX: 0, minY: 0, maxX: 4, maxY: 2 });
    expect(box).toEqual({ minX: -2, minY: 0, maxX: 0, maxY: 4 });
  });

  it('matMul applies right operand first', () => {
    const t = matFromTransform({ tx: 10, ty: 0, theta: 0, sx: 1, sy: 1, mirror: null });
    const r = matFromTransform({ tx: 0, ty: 0, theta: 90, sx: 1, sy: 1, mirror: null });
    // t·r : rotate first then translate → (1,0) → (0,1) → (10,1)
    expect(matApply(matMul(t, r), 1, 0)).toEqual([10, 1]);
  });
});

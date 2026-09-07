import { describe, expect, it } from 'vitest';
import {
  toMask,
  maskUnion,
  maskIntersect,
  maskSubtract,
  maskInvert,
  clipCellsWithMask,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.masks.js';
import { createRect } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.geometry.js';
import { makeRational } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js';

describe('SCDL v2 immutable masks and lattice clipping', () => {
  const r0 = makeRational(0);
  const r2 = makeRational(2);
  const r4 = makeRational(4);

  const rectA = createRect({ origin: { x: r0, y: r0 }, size: { x: r4, y: r4 } }); // x: 0..3, y: 0..3
  const rectB = createRect({ origin: { x: r2, y: r0 }, size: { x: r4, y: r4 } }); // x: 2..5, y: 0..3

  it('creates mask from shape (toMask)', () => {
    const mask = toMask(rectA);
    expect(mask.kind).toBe('MASK');
    expect(mask.has(1, 1)).toBe(true);
    expect(mask.has(5, 5)).toBe(false);
  });

  it('performs mask boolean algebra (union, intersect, subtract)', () => {
    const mA = toMask(rectA);
    const mB = toMask(rectB);

    const mUnion = maskUnion(mA, mB);
    expect(mUnion.has(0, 0)).toBe(true);
    expect(mUnion.has(4, 0)).toBe(true);
    expect(mUnion.size).toBe(24);

    const mInter = maskIntersect(mA, mB);
    expect(mInter.has(0, 0)).toBe(false);
    expect(mInter.has(2, 0)).toBe(true);
    expect(mInter.size).toBe(8);

    const mSub = maskSubtract(mA, mB);
    expect(mSub.has(0, 0)).toBe(true);
    expect(mSub.has(2, 0)).toBe(false);
    expect(mSub.size).toBe(8);
  });

  it('inverts mask within given bounds', () => {
    const mA = toMask(rectA);
    // Invert within 4x4 canvas: all 16 cells in rectA inverted become 0 cells
    const invSmall = maskInvert(mA, { width: 4, height: 4 });
    expect(invSmall.size).toBe(0);

    // Invert within 8x8 canvas (64 cells total, rectA is 16) -> 48 cells
    const invLarge = maskInvert(mA, { width: 8, height: 8 });
    expect(invLarge.size).toBe(48);
    expect(invLarge.has(0, 0)).toBe(false);
    expect(invLarge.has(5, 5)).toBe(true);
  });

  it('clips cells with mask (clipCellsWithMask)', () => {
    const mask = toMask(rectA); // x: 0..3, y: 0..3
    const cells = [
      { x: 1, y: 1, color: '#FF0000' },
      { x: 5, y: 5, color: '#00FF00' },
      { x: 2, y: 2, color: '#0000FF' },
    ];
    const clipped = clipCellsWithMask(cells, mask);
    expect(clipped.length).toBe(2);
    expect(clipped.map((c) => c.color)).toEqual(['#FF0000', '#0000FF']);
  });
});

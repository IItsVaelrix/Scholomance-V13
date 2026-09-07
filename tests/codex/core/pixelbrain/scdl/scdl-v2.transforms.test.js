import { describe, expect, it } from 'vitest';
import {
  createAngle,
  angleToTurns,
  exactSinCos,
  identityTransform,
  translateTransform,
  rotateTransform,
  scaleTransform,
  composeTransforms,
  invertTransform,
  applyTransformToPoint,
  transformDeterminant,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.transforms.js';
import { makeRational } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js';

describe('SCDL v2 2D affine transforms and exact angles', () => {
  const r0 = makeRational(0);
  const r1 = makeRational(1);
  const r2 = makeRational(2);
  const r10 = makeRational(10);
  const r20 = makeRational(20);

  it('normalizes angles and provides exact cardinal sines and cosines', () => {
    const a0 = createAngle(0, 'DEGREES');
    const sc0 = exactSinCos(a0);
    expect(sc0.sin.numerator).toBe('0');
    expect(sc0.cos.numerator).toBe('1');

    const a90 = createAngle(90, 'DEGREES');
    const sc90 = exactSinCos(a90);
    expect(sc90.sin.numerator).toBe('1');
    expect(sc90.cos.numerator).toBe('0');

    const a180 = createAngle(0.5, 'TURNS');
    const sc180 = exactSinCos(a180);
    expect(sc180.sin.numerator).toBe('0');
    expect(sc180.cos.numerator).toBe('-1');

    const a270 = createAngle(270, 'DEGREES');
    const sc270 = exactSinCos(a270);
    expect(sc270.sin.numerator).toBe('-1');
    expect(sc270.cos.numerator).toBe('0');

    const a360 = createAngle(360, 'DEGREES');
    expect(angleToTurns(a360).numerator).toBe('0');
  });

  it('creates identity, translate, and scale transforms', () => {
    const id = identityTransform();
    const pt = { x: r10, y: r20 };
    const ptId = applyTransformToPoint(id, pt);
    expect(ptId.x.numerator).toBe('10');
    expect(ptId.y.numerator).toBe('20');

    const tr = translateTransform({ x: r2, y: makeRational(5) });
    const ptTr = applyTransformToPoint(tr, pt);
    expect(ptTr.x.numerator).toBe('12');
    expect(ptTr.y.numerator).toBe('25');

    const sc = scaleTransform(r2, makeRational(3));
    const ptSc = applyTransformToPoint(sc, pt);
    expect(ptSc.x.numerator).toBe('20');
    expect(ptSc.y.numerator).toBe('60');
  });

  it('performs exact 90-degree rotations around origin and pivot', () => {
    const rot90 = rotateTransform(createAngle(90, 'DEGREES'));
    const pt = { x: r10, y: r0 };
    const ptRot = applyTransformToPoint(rot90, pt);
    // (10, 0) rotated 90 deg -> (0, 10)
    expect(ptRot.x.numerator).toBe('0');
    expect(ptRot.y.numerator).toBe('10');

    // Rotate around pivot (10, 10)
    const pivot = { x: r10, y: r10 };
    const rotPivot = rotateTransform(createAngle(90, 'DEGREES'), pivot);
    // Point (10, 0) relative to pivot is (0, -10)
    // Rotated 90 deg -> (10, 0) relative to pivot -> (20, 10)
    const ptPivot = applyTransformToPoint(rotPivot, pt);
    expect(ptPivot.x.numerator).toBe('20');
    expect(ptPivot.y.numerator).toBe('10');
  });

  it('composes transforms and inverts non-singular transforms', () => {
    const tr = translateTransform({ x: r10, y: r10 });
    const sc = scaleTransform(r2, r2);
    // Combined: scale then translate
    const combined = composeTransforms(tr, sc);
    const pt = { x: makeRational(5), y: makeRational(5) };
    // scale (5,5) -> (10,10), then translate + (10,10) -> (20,20)
    const ptComb = applyTransformToPoint(combined, pt);
    expect(ptComb.x.numerator).toBe('20');
    expect(ptComb.y.numerator).toBe('20');

    // Invert combined transform
    const inv = invertTransform(combined);
    const ptInv = applyTransformToPoint(inv, ptComb);
    expect(ptInv.x.numerator).toBe('5');
    expect(ptInv.y.numerator).toBe('5');
  });

  it('detects singular non-invertible transforms', () => {
    const singular = scaleTransform(makeRational(0), r1);
    expect(transformDeterminant(singular).numerator).toBe('0');
    expect(() => invertTransform(singular)).toThrow(/singular/i);
  });
});

import { describe, it, expect } from 'vitest';
import {
  PCG32,
  deterministicNoise2D,
  gcdBigInt,
  lcmBigInt,
  sqrtRational,
  lerpRational,
  mapRangeRational,
  clampRational,
  minRational,
  maxRational,
  absRational,
  floorRational,
  ceilRational,
  roundRational,
  modBigInt,
  powRational,
  sinAngle,
  cosAngle,
  tanAngle,
  atan2Angle,
  distanceVec2,
  dotVec2,
  crossVec2,
  normalizeVec2,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.generative.js';
import { makeRational, rationalToNumber } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js';
import { createAngle } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.transforms.js';

describe('SCDL v2 Generative Math & RNG Kernel', () => {
  describe('PCG32 PRNG', () => {
    it('is fully deterministic across instances with same seed', () => {
      const rng1 = new PCG32(481516n);
      const rng2 = new PCG32(481516n);

      const seq1 = [rng1.nextUInt32(), rng1.nextUInt32(), rng1.nextUInt32()];
      const seq2 = [rng2.nextUInt32(), rng2.nextUInt32(), rng2.nextUInt32()];

      expect(seq1).toEqual(seq2);
    });

    it('generates bounded integers in range [min, max]', () => {
      const rng = new PCG32(12345n);
      for (let i = 0; i < 50; i++) {
        const val = rng.nextI32(-5, 10);
        expect(val).toBeGreaterThanOrEqual(-5);
        expect(val).toBeLessThanOrEqual(10);
      }
    });

    it('generates bounded rational scalars', () => {
      const rng = new PCG32(99999n);
      const min = makeRational(-2n);
      const max = makeRational(2n);

      for (let i = 0; i < 20; i++) {
        const s = rng.nextScalar(min, max);
        const num = rationalToNumber(s);
        expect(num).toBeGreaterThanOrEqual(-2.0001);
        expect(num).toBeLessThanOrEqual(2.0001);
      }
    });

    it('generates 2D vectors within bounds', () => {
      const rng = new PCG32(777n);
      const min = { x: makeRational(0n), y: makeRational(10n) };
      const max = { x: makeRational(5n), y: makeRational(20n) };

      const v = rng.nextVec2(min, max);
      expect(rationalToNumber(v.x)).toBeGreaterThanOrEqual(0);
      expect(rationalToNumber(v.x)).toBeLessThanOrEqual(5);
      expect(rationalToNumber(v.y)).toBeGreaterThanOrEqual(10);
      expect(rationalToNumber(v.y)).toBeLessThanOrEqual(20);
    });
  });

  describe('Deterministic 2D Noise', () => {
    it('is deterministic for identical seeds and coords', () => {
      const n1 = deterministicNoise2D(42, makeRational(1n, 10n), 2, makeRational(5n), makeRational(7n));
      const n2 = deterministicNoise2D(42, makeRational(1n, 10n), 2, makeRational(5n), makeRational(7n));

      expect(n1.numerator).toBe(n2.numerator);
      expect(n1.denominator).toBe(n2.denominator);
    });

    it('varies with different coordinates', () => {
      const n1 = deterministicNoise2D(42, makeRational(1n), 1, makeRational(15n, 10n), makeRational(25n, 10n));
      const n2 = deterministicNoise2D(42, makeRational(1n), 1, makeRational(85n, 10n), makeRational(95n, 10n));

      expect(rationalToNumber(n1)).not.toBe(rationalToNumber(n2));
    });
  });

  describe('Exact Math and Number Theory', () => {
    it('computes GCD and LCM correctly', () => {
      expect(gcdBigInt(48n, 18n)).toBe(6n);
      expect(gcdBigInt(-48n, 18n)).toBe(6n);
      expect(lcmBigInt(12n, 15n)).toBe(60n);
    });

    it('computes square root via Newton-Raphson', () => {
      const r4 = sqrtRational(makeRational(4n));
      expect(rationalToNumber(r4)).toBeCloseTo(2.0, 4);

      const r2 = sqrtRational(makeRational(2n));
      expect(rationalToNumber(r2)).toBeCloseTo(1.41421, 4);

      const r9_16 = sqrtRational(makeRational(9n, 16n));
      expect(rationalToNumber(r9_16)).toBeCloseTo(0.75, 4);
    });

    it('keeps zero and sub-pixel square roots inside the rational domain', () => {
      expect(sqrtRational(makeRational(0n))).toEqual(makeRational(0n));
      expect(rationalToNumber(sqrtRational(makeRational(1n, 1_000_000_000_000n)))).toBeCloseTo(0.000001, 8);
    });

    it('computes LERP and MAP_RANGE', () => {
      const l = lerpRational(makeRational(10n), makeRational(20n), makeRational(1n, 2n));
      expect(rationalToNumber(l)).toBe(15.0);

      const m = mapRangeRational(
        makeRational(5n),
        makeRational(0n),
        makeRational(10n),
        makeRational(100n),
        makeRational(200n)
      );
      expect(rationalToNumber(m)).toBe(150.0);

      expect(lerpRational(0, 10, 0.25)).toEqual(makeRational(5n, 2n));
      expect(mapRangeRational(5, 10, 10, 20, 30)).toEqual(makeRational(20n));
    });

    it('computes CLAMP, MIN, MAX, ABS', () => {
      expect(rationalToNumber(clampRational(makeRational(15n), makeRational(0n), makeRational(10n)))).toBe(10);
      expect(rationalToNumber(clampRational(makeRational(-5n), makeRational(0n), makeRational(10n)))).toBe(0);
      expect(rationalToNumber(minRational(makeRational(3n), makeRational(7n)))).toBe(3);
      expect(rationalToNumber(maxRational(makeRational(3n), makeRational(7n)))).toBe(7);
      expect(rationalToNumber(absRational(makeRational(-12n)))).toBe(12);

      const aboveSafeInteger = makeRational(9_007_199_254_740_993n);
      const safeInteger = makeRational(9_007_199_254_740_992n);
      expect(minRational(aboveSafeInteger, safeInteger)).toEqual(safeInteger);
      expect(maxRational(aboveSafeInteger, safeInteger)).toEqual(aboveSafeInteger);
    });

    it('computes FLOOR, CEIL, ROUND, MOD, POW', () => {
      expect(floorRational(makeRational(7n, 2n))).toBe(3);
      expect(ceilRational(makeRational(7n, 2n))).toBe(4);
      expect(roundRational(makeRational(7n, 2n))).toBe(4);
      expect(modBigInt(makeRational(17n), makeRational(5n)).numerator).toBe('2');
      expect(powRational(makeRational(2n), makeRational(3n)).numerator).toBe('8');
      expect(() => powRational(makeRational(4n), makeRational(1n, 2n))).toThrow(/integer exponent/i);
    });


    it('computes trigonometry', () => {
      const angle0 = { type: 'ANGLE', unit: 'DEGREES', value: makeRational(0n) };
      const angle90 = { type: 'ANGLE', unit: 'DEGREES', value: makeRational(90n) };

      expect(rationalToNumber(sinAngle(angle0))).toBeCloseTo(0.0, 3);
      expect(rationalToNumber(cosAngle(angle0))).toBeCloseTo(1.0, 3);
      expect(rationalToNumber(sinAngle(angle90))).toBeCloseTo(1.0, 3);
      expect(rationalToNumber(cosAngle(angle90))).toBeCloseTo(0.0, 3);

      const a2 = atan2Angle(makeRational(10n), makeRational(10n));
      expect(rationalToNumber(a2.value)).toBeCloseTo(45.0, 1);
    });

    it('accepts canonical transform angles and rejects undefined tangent', () => {
      const angle90 = createAngle(90, 'DEGREES');
      expect(sinAngle(angle90)).toEqual(makeRational(1n));
      expect(cosAngle(angle90)).toEqual(makeRational(0n));
      expect(() => tanAngle(angle90)).toThrow(/undefined/i);
    });

    it('computes 2D vector operations', () => {
      const v1 = { x: makeRational(0n), y: makeRational(0n) };
      const v2 = { x: makeRational(3n), y: makeRational(4n) };

      const dist = distanceVec2(v1, v2);
      expect(rationalToNumber(dist)).toBeCloseTo(5.0, 3);

      const dot = dotVec2(v1, v2);
      expect(rationalToNumber(dot)).toBe(0);

      const cross = crossVec2({ x: makeRational(1n), y: makeRational(0n) }, { x: makeRational(0n), y: makeRational(1n) });
      expect(rationalToNumber(cross)).toBe(1);

      const norm = normalizeVec2(v2);
      expect(rationalToNumber(norm.x)).toBeCloseTo(0.6, 3);
      expect(rationalToNumber(norm.y)).toBeCloseTo(0.8, 3);

      expect(normalizeVec2(v1)).toEqual({ x: makeRational(0n), y: makeRational(0n) });
    });
  });
});

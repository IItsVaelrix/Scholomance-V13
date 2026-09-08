import { describe, it, expect } from 'vitest';
import {
  isExactValue,
  canonicalizeValue,
  canonicalStringify,
  computeCanonicalDigest256,
  deriveSlotBlockHex,
} from '../../../../../codex/core/pixelbrain/scholomium-ink/scd128/scd128.canonical.js';

describe('SCD128 Canonical Serialization & Exact Values', () => {
  it('validates ExactValue contracts', () => {
    expect(isExactValue(42)).toBe(true);
    expect(isExactValue(-100)).toBe(true);
    expect(isExactValue(0)).toBe(true);
    expect(isExactValue(true)).toBe(true);
    expect(isExactValue(false)).toBe(true);
    expect(isExactValue('broad_oval')).toBe(true);
    expect(isExactValue({ numerator: '3', denominator: '4' })).toBe(true);
    expect(isExactValue({ numerator: '-5', denominator: '1' })).toBe(true);

    // Rejects
    expect(isExactValue(3.14159)).toBe(false);
    expect(isExactValue(NaN)).toBe(false);
    expect(isExactValue(Infinity)).toBe(false);
    expect(isExactValue(null)).toBe(false);
    expect(isExactValue(undefined)).toBe(false);
    // Unreduced rational (4/6 can be reduced to 2/3)
    expect(isExactValue({ numerator: '4', denominator: '6' })).toBe(false);
    // Zero denominator
    expect(isExactValue({ numerator: '1', denominator: '0' })).toBe(false);
  });

  it('serializes objects with sorted keys deterministically', () => {
    const objA = { z: 1, a: 2, m: { y: true, b: 'test' } };
    const objB = { a: 2, m: { b: 'test', y: true }, z: 1 };
    expect(canonicalStringify(objA)).toBe(canonicalStringify(objB));
    expect(canonicalStringify(objA)).toBe('{"a":2,"m":{"b":"test","y":true},"z":1}');
  });

  it('rejects binary floats in canonicalizeValue', () => {
    expect(() => canonicalizeValue({ ratio: 0.75 })).toThrow(/float/i);
    expect(() => canonicalizeValue({ val: NaN })).toThrow(/float/i);
  });

  it('computes 64-character uppercase SHA-256 digests', () => {
    const digest = computeCanonicalDigest256({ test: 123 });
    expect(digest).toHaveLength(64);
    expect(/^[0-9A-F]{64}$/.test(digest)).toBe(true);
  });

  it('derives correct slot blockHex for position 0 and positions 1..7', () => {
    const digest = 'ABCDEF1234567890' + '0'.repeat(48);
    const formSlot0 = deriveSlotBlockHex(digest, 0, 'form');
    expect(formSlot0).toBe('81ABCDEF');

    const realSlot0 = deriveSlotBlockHex(digest, 0, 'realization');
    expect(realSlot0).toBe('91ABCDEF');

    const slot3 = deriveSlotBlockHex(digest, 3, 'form');
    expect(slot3).toBe('ABCDEF12');
  });
});

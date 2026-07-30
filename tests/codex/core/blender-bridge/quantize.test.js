/**
 * Quantization law: the integer IS the value. Blender RNA floats are float32,
 * so a float64 that crosses the boundary is a different number coming back.
 * Quantizing at the producer makes the float derived and never authoritative.
 */
import { describe, it, expect } from 'vitest';
import { quantize, dequantize, INT32_MAX, SCALES, QuantizeError } from '../../../../codex/core/blender-bridge/quantize.js';
import { internTable } from '../../../../codex/core/blender-bridge/intern.js';

describe('quantize', () => {
  it('rounds to an integer at the declared scale', () => {
    expect(quantize(0.14285714285714285, 1e6)).toBe(142857);
    expect(quantize(0.5, 1000)).toBe(500);
    expect(quantize(-0.25, 1000)).toBe(-250);
  });

  it('round-trips through float32 without drift because the int is truth', () => {
    const q = quantize(0.14285714285714285, 1e6);
    const asFloat32 = Math.fround(dequantize(q, 1e6));
    expect(quantize(asFloat32, 1e6)).toBe(q);
  });

  it('refuses values that would exceed int32', () => {
    expect(() => quantize(3000, 1e6)).toThrow(QuantizeError);
    expect(() => quantize(1, INT32_MAX + 1)).toThrow(QuantizeError);
  });

  it('refuses non-finite input rather than emitting a null', () => {
    expect(() => quantize(NaN, 1000)).toThrow(QuantizeError);
    expect(() => quantize(Infinity, 1000)).toThrow(QuantizeError);
  });

  it('publishes frozen per-field scales', () => {
    expect(Object.isFrozen(SCALES)).toBe(true);
    expect(SCALES.UNIT).toBe(1e6);
    expect(SCALES.PIXEL).toBe(1);
  });

  it('is deterministic across repeated calls', () => {
    const a = Array.from({ length: 50 }, () => quantize(0.1234567, 1e6));
    expect(new Set(a).size).toBe(1);
  });
});

describe('internTable', () => {
  it('assigns stable ids in sorted order, not insertion order', () => {
    const a = internTable(['hilt', 'blade', 'pommel']);
    const b = internTable(['pommel', 'blade', 'hilt']);
    expect(a.table).toEqual(b.table);
    expect(a.table.blade).toBe(0);
  });

  it('maps null and undefined to a reserved sentinel id', () => {
    const t = internTable(['blade', null]);
    expect(t.lookup(null)).toBe(-1);
    expect(t.lookup(undefined)).toBe(-1);
  });

  it('throws on an unknown string rather than inventing an id', () => {
    const t = internTable(['blade']);
    expect(() => t.lookup('unknown')).toThrow(/not interned/);
  });
});

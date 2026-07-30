/**
 * Quantization law for the Blender wire.
 *
 * Blender RNA float properties are C float32: assigning 0.1234567890123456789
 * to object.location[0] reads back 0.12345679104328156. Rather than treat that
 * as loss to be tolerated, the quantized integer is DEFINED as the canonical
 * value. The float in bpy is derived and never authoritative, so truncation
 * cannot cause a receipt to diverge.
 *
 * ID custom properties are int32: 2**31 raises OverflowError. Every wire
 * numeric must therefore fit.
 */

export const INT32_MAX = 2147483647;
export const INT32_MIN = -2147483648;

export class QuantizeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QuantizeError';
  }
}

/** Declared per-field scales. A field's scale is part of the wire contract. */
export const SCALES = Object.freeze({
  /** Normalized [0,1] fields: emphasis, energy value, contrast delta. */
  UNIT: 1e6,
  /** Integer grid coordinates. Already integral. */
  PIXEL: 1,
  /** Camera matrix and world-space transforms. */
  TRANSFORM: 1e5,
});

export function quantize(value, scale) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new QuantizeError(`value must be a finite number, got ${value}`);
  }
  if (!Number.isFinite(scale) || scale <= 0 || scale > INT32_MAX) {
    throw new QuantizeError(`scale must be a positive finite number <= INT32_MAX, got ${scale}`);
  }
  const q = Math.round(value * scale);
  if (q > INT32_MAX || q < INT32_MIN) {
    throw new QuantizeError(`quantized value ${q} exceeds int32 (value=${value}, scale=${scale})`);
  }
  return q;
}

export function dequantize(int, scale) {
  if (!Number.isInteger(int)) {
    throw new QuantizeError(`expected an integer, got ${int}`);
  }
  return int / scale;
}

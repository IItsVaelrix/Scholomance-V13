/**
 * The colour law is computed ONCE, JS-side, and shipped as declared numbers.
 * Both consumers (Blender and the Remotion canvas) apply the same values, which
 * is what lets COLOR_LAW agree across engines honestly rather than by accident.
 *
 * palette.py previously computed hex_to_linear consumer-side, contrary to the
 * bridge's rule that the addon applies values and reports what it applied.
 */
import { describe, it, expect } from 'vitest';
import {
  srgbToLinear,
  linearToSrgb,
  hexIntToLinearTriple,
  linearTripleToHexInt,
  COLOR_LAW_EXACT,
  COLOR_LAW_TRANSFER,
} from '../../../../codex/core/blender-bridge/color-law.js';

describe('srgbToLinear', () => {
  it('pins the endpoints', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 12);
  });

  it('uses the linear segment below the 0.04045 knee', () => {
    expect(srgbToLinear(0.04)).toBeCloseTo(0.04 / 12.92, 12);
  });

  it('uses the power segment above the knee', () => {
    expect(srgbToLinear(0.5)).toBeCloseTo(((0.5 + 0.055) / 1.055) ** 2.4, 12);
  });
});

describe('linearToSrgb', () => {
  it('inverts srgbToLinear across the full 8-bit range', () => {
    // Every representable byte must survive the round trip, because the render
    // falsifier compares 8-bit values and a single off-by-one would fail it.
    for (let b = 0; b <= 255; b += 1) {
      const c = b / 255;
      const back = Math.round(linearToSrgb(srgbToLinear(c)) * 255);
      expect(back).toBe(b);
    }
  });
});

describe('hexIntToLinearTriple', () => {
  it('splits a packed hex int into three linear channels', () => {
    const [r, g, b] = hexIntToLinearTriple(0xDCB430);
    expect(r).toBeCloseTo(srgbToLinear(0xDC / 255), 12);
    expect(g).toBeCloseTo(srgbToLinear(0xB4 / 255), 12);
    expect(b).toBeCloseTo(srgbToLinear(0x30 / 255), 12);
  });

  it('maps black and white exactly', () => {
    expect(hexIntToLinearTriple(0x000000)).toEqual([0, 0, 0]);
    const [r, g, b] = hexIntToLinearTriple(0xFFFFFF);
    expect(r).toBeCloseTo(1, 12);
    expect(g).toBeCloseTo(1, 12);
    expect(b).toBeCloseTo(1, 12);
  });
});

describe('linearTripleToHexInt', () => {
  it('round-trips every specimen used by the render falsifier', () => {
    for (const hex of [0xDCB430, 0x4051B5, 0xFFFFFF, 0x000000, 0x7C3AED, 0x06B6D4]) {
      expect(linearTripleToHexInt(hexIntToLinearTriple(hex))).toBe(hex);
    }
  });
});

describe('COLOR_LAW_EXACT', () => {
  it('declares samples = 1 as part of the contract', () => {
    // Measured: 6/6 specimens byte-exact at 1 sample, 1/6 at 16, 0/6 at 64 with
    // a Gaussian filter. One sample per pixel has nothing to average, so the
    // filter only chooses where that sample lands. This is not a tuning knob.
    expect(COLOR_LAW_EXACT.samples).toBe(1);
  });

  it('declares the transfer function by name', () => {
    expect(COLOR_LAW_EXACT.transfer).toBe(COLOR_LAW_TRANSFER);
    expect(COLOR_LAW_TRANSFER).toBe('sRGB-IEC-61966-2-1');
  });

  it('pins the view transform and look', () => {
    expect(COLOR_LAW_EXACT.viewTransform).toBe('Standard');
    expect(COLOR_LAW_EXACT.look).toBe('None');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(COLOR_LAW_EXACT)).toBe(true);
  });
});

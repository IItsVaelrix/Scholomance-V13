/**
 * Palette wire tests — school palette serialization for the Blender addon.
 *
 * Hex values are sRGB display values. Under EXACT policy the authored hex
 * must survive byte-exact. The conversion is recorded in COLOR_LAW.
 * All wire values are quantized int32 at UNIT scale.
 */
import { describe, it, expect } from 'vitest';
import {
  SCHOOL_PALETTE, SCHOOL_NAMES, hexToSrgb, srgbToLinear, hexToLinear,
  paletteToWire, allPalettesToWire, validatePaletteWire, PaletteError,
} from '../../../../codex/core/blender-bridge/palette-wire.js';
import { dequantize, SCALES } from '../../../../codex/core/blender-bridge/quantize.js';

describe('SCHOOL_PALETTE', () => {
  it('contains six schools including default', () => {
    expect(SCHOOL_NAMES).toContain('SONIC');
    expect(SCHOOL_NAMES).toContain('PSYCHIC');
    expect(SCHOOL_NAMES).toContain('ALCHEMY');
    expect(SCHOOL_NAMES).toContain('WILL');
    expect(SCHOOL_NAMES).toContain('VOID');
    expect(SCHOOL_NAMES).toContain('default');
    expect(SCHOOL_NAMES).toHaveLength(6);
  });

  it('each school has primary, accent, glow', () => {
    for (const school of SCHOOL_NAMES) {
      const p = SCHOOL_PALETTE[school];
      expect(p.primary).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.glow).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('is deeply frozen', () => {
    expect(Object.isFrozen(SCHOOL_PALETTE)).toBe(true);
    expect(Object.isFrozen(SCHOOL_PALETTE.SONIC)).toBe(true);
  });
});

describe('hexToSrgb', () => {
  it('parses hex to [0,1] sRGB', () => {
    const [r, g, b] = hexToSrgb('#ff0000');
    expect(r).toBeCloseTo(1.0, 5);
    expect(g).toBeCloseTo(0.0, 5);
    expect(b).toBeCloseTo(0.0, 5);
  });

  it('handles mid-range values', () => {
    const [r, g, b] = hexToSrgb('#7c3aed');
    expect(r).toBeCloseTo(0x7c / 255, 5);
    expect(g).toBeCloseTo(0x3a / 255, 5);
    expect(b).toBeCloseTo(0xed / 255, 5);
  });

  it('refuses invalid hex', () => {
    expect(() => hexToSrgb('not-a-color')).toThrow(PaletteError);
    expect(() => hexToSrgb('#xyz')).toThrow(PaletteError);
    expect(() => hexToSrgb(42)).toThrow(PaletteError);
  });
});

describe('srgbToLinear', () => {
  it('converts 0 to 0', () => {
    expect(srgbToLinear(0)).toBeCloseTo(0, 10);
  });

  it('converts 1 to 1', () => {
    expect(srgbToLinear(1)).toBeCloseTo(1, 10);
  });

  it('applies the linear segment below 0.04045', () => {
    expect(srgbToLinear(0.04045)).toBeCloseTo(0.04045 / 12.92, 10);
  });

  it('applies the gamma segment above 0.04045', () => {
    const result = srgbToLinear(0.5);
    const expected = ((0.5 + 0.055) / 1.055) ** 2.4;
    expect(result).toBeCloseTo(expected, 10);
  });
});

describe('hexToLinear', () => {
  it('converts hex to scene-linear RGB', () => {
    const [r, g, b] = hexToLinear('#ffffff');
    expect(r).toBeCloseTo(1.0, 5);
    expect(g).toBeCloseTo(1.0, 5);
    expect(b).toBeCloseTo(1.0, 5);
  });

  it('black stays black', () => {
    const [r, g, b] = hexToLinear('#000000');
    expect(r).toBeCloseTo(0.0, 10);
    expect(g).toBeCloseTo(0.0, 10);
    expect(b).toBeCloseTo(0.0, 10);
  });
});

describe('paletteToWire', () => {
  it('serializes a school palette with quantized int32 values', () => {
    const wire = paletteToWire('SONIC');
    expect(wire.school).toBe('SONIC');
    expect(wire.scale).toBe(SCALES.UNIT);
    expect(wire.channels.primary.srgb).toHaveLength(3);
    expect(wire.channels.primary.linear).toHaveLength(3);
    wire.channels.primary.srgb.forEach((v) => expect(Number.isInteger(v)).toBe(true));
    wire.channels.primary.linear.forEach((v) => expect(Number.isInteger(v)).toBe(true));
  });

  it('falls back to default for unknown schools', () => {
    const wire = paletteToWire('NONEXISTENT');
    expect(wire.school).toBe('default');
  });

  it('declares the transfer function for EXACT policy', () => {
    const wire = paletteToWire('SONIC', { colorPolicy: 'EXACT' });
    expect(wire.transferFunction).toBe('sRGB-IEC-61966-2-1');
  });

  it('declares no transfer function for SYNTHESIZED policy', () => {
    const wire = paletteToWire('SONIC', { colorPolicy: 'SYNTHESIZED' });
    expect(wire.transferFunction).toBe('none');
  });

  it('quantized values round-trip through dequantize', () => {
    const wire = paletteToWire('ALCHEMY');
    const [r, g, b] = wire.channels.primary.srgb.map((v) => dequantize(v, SCALES.UNIT));
    const [er, eg, eb] = hexToSrgb('#f59e0b');
    expect(r).toBeCloseTo(er, 4);
    expect(g).toBeCloseTo(eg, 4);
    expect(b).toBeCloseTo(eb, 4);
  });

  it('is frozen', () => {
    const wire = paletteToWire('VOID');
    expect(Object.isFrozen(wire)).toBe(true);
    expect(Object.isFrozen(wire.channels)).toBe(true);
  });

  it('is deterministic across repeated calls', () => {
    const a = JSON.stringify(paletteToWire('PSYCHIC'));
    const b = JSON.stringify(paletteToWire('PSYCHIC'));
    expect(a).toBe(b);
  });
});

describe('allPalettesToWire', () => {
  it('serializes all six schools', () => {
    const all = allPalettesToWire();
    expect(Object.keys(all)).toHaveLength(6);
    for (const school of SCHOOL_NAMES) {
      expect(all[school]).toBeDefined();
      expect(all[school].school).toBe(school);
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(allPalettesToWire())).toBe(true);
  });
});

describe('validatePaletteWire', () => {
  it('accepts a valid palette wire', () => {
    const wire = paletteToWire('WILL');
    const result = validatePaletteWire(wire);
    expect(result.valid).toBe(true);
  });

  it('rejects null', () => {
    expect(validatePaletteWire(null).valid).toBe(false);
  });

  it('rejects missing school', () => {
    expect(validatePaletteWire({ channels: {} }).valid).toBe(false);
  });

  it('rejects non-integer channel values', () => {
    const wire = paletteToWire('SONIC');
    // Tamper with a value
    const tampered = JSON.parse(JSON.stringify(wire));
    tampered.channels.primary.srgb[0] = 0.5;
    expect(validatePaletteWire(tampered).valid).toBe(false);
  });
});

describe('determinism replay', () => {
  it('100-iteration replay produces identical wire output', () => {
    const results = [];
    for (let i = 0; i < 100; i++) {
      results.push(JSON.stringify(allPalettesToWire()));
    }
    expect(new Set(results).size).toBe(1);
  });
});

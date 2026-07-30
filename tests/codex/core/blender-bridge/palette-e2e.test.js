/**
 * Palette E2E tests — school palette node group applied to ingested asset.
 *
 * Under EXACT policy the authored hex must survive byte-exact. The transfer
 * function (sRGB → linear) is recorded in COLOR_LAW, not assumed.
 *
 * These tests use synthetic pixel buffers (not real Blender renders) to prove
 * the palette pipeline: validate, hash, mint receipt, compare.
 */
import { describe, it, expect } from 'vitest';
import {
  preparePalettePayload, runPaletteE2E, PaletteE2EError,
} from '../../../../codex/core/blender-bridge/palette-e2e.js';
import {
  paletteToWire, allPalettesToWire, validatePaletteWire,
  SCHOOL_PALETTE, SCHOOL_NAMES, hexToSrgb, srgbToLinear, hexToLinear,
} from '../../../../codex/core/blender-bridge/palette-wire.js';
import { mintReceipt, compareReceipts, hashPixelBuffer } from '../../../../codex/core/blender-bridge/receipt.js';
import { quantize, SCALES } from '../../../../codex/core/blender-bridge/quantize.js';

describe('preparePalettePayload', () => {
  it('prepares and validates all 6 school palettes', () => {
    const { palettes, validation } = preparePalettePayload();
    expect(SCHOOL_NAMES).toHaveLength(6);
    expect(validation).toHaveLength(6);
    for (const v of validation) {
      expect(v.valid).toBe(true);
    }
  });

  it('each palette has primary, accent, glow channels', () => {
    const { palettes } = preparePalettePayload();
    for (const school of SCHOOL_NAMES) {
      const p = palettes[school];
      expect(p.channels.primary).toBeDefined();
      expect(p.channels.accent).toBeDefined();
      expect(p.channels.glow).toBeDefined();
    }
  });

  it('all channel values are quantized int32', () => {
    const { palettes } = preparePalettePayload();
    for (const school of SCHOOL_NAMES) {
      const p = palettes[school];
      for (const role of ['primary', 'accent', 'glow']) {
        for (const space of ['srgb', 'linear']) {
          for (const v of p.channels[role][space]) {
            expect(Number.isInteger(v)).toBe(true);
          }
        }
      }
    }
  });

  it('EXACT policy records the sRGB transfer function', () => {
    const { palettes } = preparePalettePayload({ colorPolicy: 'EXACT' });
    for (const school of SCHOOL_NAMES) {
      expect(palettes[school].transferFunction).toBe('sRGB-IEC-61966-2-1');
    }
  });
});

describe('palette wire validation', () => {
  it('validates a correct palette wire', () => {
    const wire = paletteToWire('SONIC');
    const result = validatePaletteWire(wire);
    expect(result.valid).toBe(true);
  });

  it('rejects null palette', () => {
    expect(validatePaletteWire(null).valid).toBe(false);
  });

  it('rejects missing school', () => {
    expect(validatePaletteWire({ channels: {} }).valid).toBe(false);
  });

  it('rejects non-integer channel values', () => {
    const wire = paletteToWire('SONIC');
    // Corrupt a value
    const corrupted = { ...wire, channels: { ...wire.channels, primary: { ...wire.channels.primary, srgb: [0.5, 0, 0] } } };
    expect(validatePaletteWire(corrupted).valid).toBe(false);
  });
});

describe('sRGB to linear conversion', () => {
  it('converts known values correctly', () => {
    // Black stays black
    expect(srgbToLinear(0)).toBe(0);
    // White stays white
    expect(srgbToLinear(1)).toBeCloseTo(1, 10);
    // Mid grey
    expect(srgbToLinear(0.5)).toBeCloseTo(0.2140, 3);
  });

  it('hexToLinear produces scene-linear values', () => {
    const [r, g, b] = hexToLinear('#7c3aed');
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(1);
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(1);
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThan(1);
  });

  it('hexToSrgb produces display values', () => {
    const [r, g, b] = hexToSrgb('#FF0000');
    expect(r).toBeCloseTo(1.0, 5);
    expect(g).toBeCloseTo(0.0, 5);
    expect(b).toBeCloseTo(0.0, 5);
  });
});

describe('runPaletteE2E', () => {
  it('runs the full palette E2E pipeline', () => {
    const pixels = Buffer.from('palette-rendered-pixels');
    const claim = {
      engine: 'blender',
      packetId: 'test-packet',
      sourceChecksum: 'TESTSEAL',
      synthClass: 'RASTER',
      colorPolicy: 'EXACT',
      observed: {
        resolutionX: 160,
        resolutionY: 160,
        engine: 'CYCLES',
        device: 'CPU',
        seed: 7,
        samples: 64,
        blenderVersion: '5.2.0',
        buildHash: 'fbe6228777e7',
        viewTransform: 'Standard',
        look: 'None',
      },
    };

    const result = runPaletteE2E(claim, {
      dumpBuffer: pixels,
      school: 'SONIC',
      colorPolicy: 'EXACT',
    });

    expect(result.school).toBe('SONIC');
    expect(result.colorPolicy).toBe('EXACT');
    expect(result.validation.valid).toBe(true);
    expect(result.pixelHash).toMatch(/^[0-9A-F]{64}$/);
    expect(result.receipt.scd64).toMatch(/^[0-9A-F]{64}$/);
  });

  it('two identical palette renders yield REPRODUCED', () => {
    const pixels = Buffer.from('identical-palette-pixels');
    const claim = {
      engine: 'blender',
      packetId: 'test-packet',
      sourceChecksum: 'TESTSEAL',
      synthClass: 'RASTER',
      observed: { resolutionX: 160, resolutionY: 160, seed: 7, samples: 64 },
    };

    const r1 = runPaletteE2E(claim, { dumpBuffer: pixels, school: 'ALCHEMY' });
    const r2 = runPaletteE2E(claim, { dumpBuffer: pixels, school: 'ALCHEMY' });

    const comparison = compareReceipts(r1.receipt, r2.receipt);
    expect(comparison.verdict).toBe('REPRODUCED');
    expect(comparison.pixelMatch).toBe(true);
  });

  it('different schools produce different palette wires', () => {
    const sonic = paletteToWire('SONIC');
    const will = paletteToWire('WILL');
    expect(sonic.channels.primary.hex).not.toBe(will.channels.primary.hex);
    expect(sonic.channels.primary.srgb).not.toEqual(will.channels.primary.srgb);
  });

  it('unknown school falls back to default', () => {
    const wire = paletteToWire('NONEXISTENT');
    expect(wire.school).toBe('default');
    expect(wire.channels.primary.hex).toBe(SCHOOL_PALETTE.default.primary);
  });

  it('throws on missing dump', () => {
    const claim = { engine: 'blender', packetId: 'x', sourceChecksum: 'y', synthClass: 'RASTER' };
    expect(() => runPaletteE2E(claim, { school: 'SONIC' })).toThrow(PaletteE2EError);
  });

  it('throws on null claim', () => {
    expect(() => runPaletteE2E(null, { dumpBuffer: Buffer.from('x') })).toThrow(PaletteE2EError);
  });
});

describe('palette quantization', () => {
  it('quantizes sRGB values at UNIT scale', () => {
    const wire = paletteToWire('SONIC');
    const [r, g, b] = hexToSrgb('#7c3aed');
    expect(wire.channels.primary.srgb[0]).toBe(quantize(r, SCALES.UNIT));
    expect(wire.channels.primary.srgb[1]).toBe(quantize(g, SCALES.UNIT));
    expect(wire.channels.primary.srgb[2]).toBe(quantize(b, SCALES.UNIT));
  });

  it('quantizes linear values at UNIT scale', () => {
    const wire = paletteToWire('SONIC');
    const [r, g, b] = hexToLinear('#7c3aed');
    expect(wire.channels.primary.linear[0]).toBe(quantize(r, SCALES.UNIT));
    expect(wire.channels.primary.linear[1]).toBe(quantize(g, SCALES.UNIT));
    expect(wire.channels.primary.linear[2]).toBe(quantize(b, SCALES.UNIT));
  });
});

describe('determinism replay', () => {
  it('100-iteration replay of palette wire is identical', () => {
    const results = [];
    for (let i = 0; i < 100; i++) {
      results.push(JSON.stringify(paletteToWire('VOID')));
    }
    expect(new Set(results).size).toBe(1);
  });

  it('100-iteration replay of allPalettesToWire is identical', () => {
    const results = [];
    for (let i = 0; i < 100; i++) {
      results.push(JSON.stringify(allPalettesToWire()));
    }
    expect(new Set(results).size).toBe(1);
  });
});

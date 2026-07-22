import { describe, it, expect } from 'vitest';
import { quantizeLuminance } from '../../../src/core/phenotype/quantize/luminance';
import { quantizeChromaticity } from '../../../src/core/phenotype/quantize/chromaticity';
import { quantizeStacking } from '../../../src/core/phenotype/quantize/stacking';
import { quantizeSize } from '../../../src/core/phenotype/quantize/size';
import { quantizeShape } from '../../../src/core/phenotype/quantize/shape';

const PALETTE = [
  { name: 'ember', hue: 40 },
  { name: 'verdant', hue: 140 },
  { name: 'abyss', hue: 260 },
] as const;

describe('quantizeLuminance', () => {
  it('tiers black on white as high', () => {
    expect(quantizeLuminance('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBe('high');
  });

  it('tiers identical colours as fail', () => {
    expect(quantizeLuminance('rgb(120, 120, 120)', 'rgb(120, 120, 120)')).toBe('fail');
  });

  it('returns null when either colour is unparseable — never a default tier', () => {
    expect(quantizeLuminance('transparent', 'rgb(255, 255, 255)')).toBeNull();
  });

  it('places the WCAG boundaries at 3.0, 4.5 and 7.0', () => {
    // #767676 on white is ~4.54:1 — just into body.
    expect(quantizeLuminance('rgb(118, 118, 118)', 'rgb(255, 255, 255)')).toBe('body');
    // #949494 on white is ~3.03:1 — just into ui.
    expect(quantizeLuminance('rgb(148, 148, 148)', 'rgb(255, 255, 255)')).toBe('ui');
    // #ABABAB on white is ~2.32:1 — below 3.0.
    expect(quantizeLuminance('rgb(171, 171, 171)', 'rgb(255, 255, 255)')).toBe('fail');
  });
});

describe('quantizeChromaticity', () => {
  it('snaps #FF0000 (hue 40.0) to the ember role', () => {
    expect(quantizeChromaticity('rgb(255, 0, 0)', PALETTE)).toBe('ember');
  });

  it('snaps a shade of the same hue to the SAME role — the slot 1/slot 4 isolation', () => {
    expect(quantizeChromaticity('rgb(128, 0, 0)', PALETTE)).toBe('ember');
  });

  it('returns neutral for greys rather than a noisy hue role', () => {
    expect(quantizeChromaticity('rgb(128, 128, 128)', PALETTE)).toBe('neutral');
    expect(quantizeChromaticity('rgb(30, 30, 30)', PALETTE)).toBe('neutral');
  });

  it('returns off-palette past the hue tolerance rather than snapping silently', () => {
    // Hue ~196 — far from every role at the default 25 degree tolerance.
    expect(quantizeChromaticity('rgb(0, 180, 220)', PALETTE)).toBe('off-palette');
  });

  it('returns null when the colour is unparseable', () => {
    expect(quantizeChromaticity('transparent', PALETTE)).toBeNull();
  });

  it('is deterministic across repeated calls', () => {
    const runs = new Set(
      Array.from({ length: 100 }, () => quantizeChromaticity('rgb(255, 0, 0)', PALETTE)),
    );
    expect(runs.size).toBe(1);
  });
});

describe('quantizeStacking', () => {
  it('maps the Law 10 tier values', () => {
    expect(quantizeStacking('0')).toBe('base');
    expect(quantizeStacking('10')).toBe('above');
    expect(quantizeStacking('100')).toBe('overlay');
    expect(quantizeStacking('1000')).toBe('system');
  });

  it('floors values between tiers to the tier below', () => {
    expect(quantizeStacking('7')).toBe('base');
    expect(quantizeStacking('99')).toBe('above');
    expect(quantizeStacking('5000')).toBe('system');
  });

  it('treats auto as base — an unpositioned element participates at base', () => {
    expect(quantizeStacking('auto')).toBe('base');
  });

  it('returns null for a non-numeric, non-auto value', () => {
    expect(quantizeStacking('inherit')).toBeNull();
  });
});

describe('quantizeSize', () => {
  const VIEWPORT = 1280 * 720; // 921600

  it('tiers by area ratio, log-spaced', () => {
    expect(quantizeSize(100, VIEWPORT)).toBe('glyph');        // ~0.0001
    expect(quantizeSize(2000, VIEWPORT)).toBe('control');     // ~0.0022
    expect(quantizeSize(20000, VIEWPORT)).toBe('panel');      // ~0.022
    expect(quantizeSize(150000, VIEWPORT)).toBe('region');    // ~0.16
    expect(quantizeSize(500000, VIEWPORT)).toBe('surface');   // ~0.54
  });

  it('is scale-invariant — doubling both element and viewport keeps the tier', () => {
    expect(quantizeSize(20000, VIEWPORT)).toBe(quantizeSize(40000, VIEWPORT * 2));
  });

  it('returns null for a zero or negative viewport', () => {
    expect(quantizeSize(100, 0)).toBeNull();
  });
});

describe('quantizeShape', () => {
  it('reports rect for a square corner', () => {
    expect(quantizeShape({ width: 200, height: 100, borderRadiusPx: 0, clipPath: 'none' })).toBe('rect');
  });

  it('reports round for a modest radius', () => {
    expect(quantizeShape({ width: 200, height: 100, borderRadiusPx: 12, clipPath: 'none' })).toBe('round');
  });

  it('reports pill when fully rounded on a non-square element', () => {
    expect(quantizeShape({ width: 200, height: 100, borderRadiusPx: 50, clipPath: 'none' })).toBe('pill');
  });

  it('reports circle when fully rounded on a square element', () => {
    expect(quantizeShape({ width: 100, height: 100, borderRadiusPx: 50, clipPath: 'none' })).toBe('circle');
  });

  it('reports notched whenever a clip-path is present, regardless of radius', () => {
    expect(
      quantizeShape({ width: 200, height: 100, borderRadiusPx: 0, clipPath: 'polygon(0 0, 100% 0, 100% 80%)' }),
    ).toBe('notched');
  });

  it('is radius-RATIO based, so a pill stays a pill at any scale', () => {
    const small = quantizeShape({ width: 100, height: 50, borderRadiusPx: 25, clipPath: 'none' });
    const large = quantizeShape({ width: 400, height: 200, borderRadiusPx: 100, clipPath: 'none' });
    expect(small).toBe('pill');
    expect(large).toBe('pill');
  });

  it('returns null for a zero-area element', () => {
    expect(quantizeShape({ width: 0, height: 100, borderRadiusPx: 0, clipPath: 'none' })).toBeNull();
  });
});

import {
  clippedRegionArea,
  countInkPixels,
  quantizeDensity,
} from '../../../src/core/phenotype/quantize/density';

describe('clippedRegionArea — the denominator that decouples density from shape', () => {
  it('is width*height for a square-cornered rect', () => {
    expect(clippedRegionArea({ width: 200, height: 100, borderRadiusPx: 0 })).toBeCloseTo(20000, 6);
  });

  it('gives pi*r^2 for a full circle', () => {
    // 100x100 with radius 50 is a circle: area = pi * 50^2 = 7853.98
    expect(clippedRegionArea({ width: 100, height: 100, borderRadiusPx: 50 })).toBeCloseTo(
      Math.PI * 2500,
      3,
    );
  });

  it('removes exactly the four corner offcuts for a rounded rect', () => {
    // w*h - (4 - pi) * r^2
    const expected = 200 * 100 - (4 - Math.PI) * 20 * 20;
    expect(clippedRegionArea({ width: 200, height: 100, borderRadiusPx: 20 })).toBeCloseTo(expected, 6);
  });

  it('clamps a radius larger than half the short side', () => {
    // Radius 400 on a 100-tall element cannot exceed 50.
    expect(clippedRegionArea({ width: 100, height: 100, borderRadiusPx: 400 })).toBeCloseTo(
      Math.PI * 2500,
      3,
    );
  });
});

describe('countInkPixels', () => {
  const BG = { r: 0, g: 0, b: 0 };

  it('counts pixels differing from the background beyond the threshold', () => {
    // 4 RGB pixels: black, black, white, white.
    const raw = Buffer.from([0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255]);
    expect(countInkPixels(raw, 3, BG)).toBe(2);
  });

  it('ignores sub-threshold noise so anti-aliasing does not inflate density', () => {
    const raw = Buffer.from([2, 2, 2, 0, 0, 0]);
    expect(countInkPixels(raw, 3, BG)).toBe(0);
  });

  it('handles a 4-channel RGBA buffer by skipping alpha', () => {
    const raw = Buffer.from([255, 255, 255, 255, 0, 0, 0, 255]);
    expect(countInkPixels(raw, 4, BG)).toBe(1);
  });
});

describe('quantizeDensity', () => {
  it('tiers by ink ratio', () => {
    expect(quantizeDensity(50, 10000)).toBe('sparse');    // 0.005
    expect(quantizeDensity(1500, 10000)).toBe('measured'); // 0.15
    expect(quantizeDensity(4500, 10000)).toBe('dense');    // 0.45
    expect(quantizeDensity(9000, 10000)).toBe('packed');   // 0.90
  });

  it('is scale-invariant — same ratio at 4x the area gives the same tier', () => {
    expect(quantizeDensity(1500, 10000)).toBe(quantizeDensity(6000, 40000));
  });

  it('returns null for a zero clipped area rather than dividing by zero', () => {
    expect(quantizeDensity(10, 0)).toBeNull();
  });
});

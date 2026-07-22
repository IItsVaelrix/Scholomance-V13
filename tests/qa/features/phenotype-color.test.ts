import { describe, it, expect } from 'vitest';
import {
  parseCssColor,
  relativeLuminance,
  contrastRatio,
  rgbToLab,
  labToLch,
  hueDistanceDeg,
} from '../../../src/core/phenotype/color';

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };
const RED = { r: 255, g: 0, b: 0 };
const DARK_RED = { r: 128, g: 0, b: 0 };

describe('parseCssColor', () => {
  it('parses the rgb() form getComputedStyle returns', () => {
    expect(parseCssColor('rgb(255, 0, 0)')).toEqual(RED);
  });

  it('parses the rgba() form', () => {
    expect(parseCssColor('rgba(128, 0, 0, 0.5)')).toEqual(DARK_RED);
  });

  it('returns null for unparseable input rather than a default', () => {
    expect(parseCssColor('transparent')).toBeNull();
    expect(parseCssColor('')).toBeNull();
  });
});

describe('WCAG luminance and contrast', () => {
  it('gives white luminance 1 and black luminance 0', () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 6);
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 6);
  });

  it('gives the canonical 21:1 for black on white', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 4);
  });

  it('is symmetric — order of arguments does not change the ratio', () => {
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(contrastRatio(BLACK, WHITE), 10);
  });
});

describe('rgbToLab', () => {
  it('places white at L*=100 with no chroma', () => {
    const lab = rgbToLab(WHITE);
    expect(lab.L).toBeCloseTo(100, 3);
    expect(lab.a).toBeCloseTo(0, 3);
    expect(lab.b).toBeCloseTo(0, 3);
  });

  it('matches published values for #FF0000', () => {
    const lab = rgbToLab(RED);
    expect(lab.L).toBeCloseTo(53.23, 1);
    expect(lab.a).toBeCloseTo(80.09, 1);
    expect(lab.b).toBeCloseTo(67.20, 1);
  });

  it('matches published values for #800000', () => {
    const lab = rgbToLab(DARK_RED);
    expect(lab.L).toBeCloseTo(25.53, 1);
    expect(lab.a).toBeCloseTo(48.05, 1);
    expect(lab.b).toBeCloseTo(38.06, 1);
  });
});

describe('labToLch — the isolation that makes slot 4 orthogonal to slot 1', () => {
  it('holds hue near-constant across a shade of the same colour', () => {
    const bright = labToLch(rgbToLab(RED));
    const dark = labToLch(rgbToLab(DARK_RED));
    expect(bright.h).toBeCloseTo(40.0, 0);
    expect(dark.h).toBeCloseTo(38.4, 0);
    expect(hueDistanceDeg(bright.h, dark.h)).toBeLessThan(2);
  });

  it('shows raw a*/b* would NOT have been stable — the reason hue is used', () => {
    const bright = rgbToLab(RED);
    const dark = rgbToLab(DARK_RED);
    expect(Math.abs(bright.a - dark.a)).toBeGreaterThan(30);
    expect(Math.abs(bright.b - dark.b)).toBeGreaterThan(28);
  });

  it('reports near-zero chroma for greys', () => {
    expect(labToLch(rgbToLab({ r: 128, g: 128, b: 128 })).C).toBeLessThan(0.5);
  });
});

describe('hueDistanceDeg', () => {
  it('wraps around 360', () => {
    expect(hueDistanceDeg(350, 10)).toBeCloseTo(20, 6);
    expect(hueDistanceDeg(10, 350)).toBeCloseTo(20, 6);
  });

  it('never exceeds 180', () => {
    expect(hueDistanceDeg(0, 181)).toBeCloseTo(179, 6);
  });
});

import { describe, it, expect } from 'vitest';
import { quantizeLuminance } from '../../../src/core/phenotype/quantize/luminance';
import { quantizeChromaticity } from '../../../src/core/phenotype/quantize/chromaticity';

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

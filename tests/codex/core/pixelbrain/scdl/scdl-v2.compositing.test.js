import { describe, expect, it } from 'vitest';
import {
  parseColor,
  formatColor,
  blendColors,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compositing.js';

describe('SCDL v2 deterministic pixel-art compositing', () => {
  it('parses hex colors into integer RGBA channels', () => {
    expect(parseColor('#FF0080')).toEqual({ r: 255, g: 0, b: 128, a: 255 });
    expect(parseColor('#00FF0080')).toEqual({ r: 0, g: 255, b: 0, a: 128 });
    expect(parseColor('#ffffff')).toEqual({ r: 255, g: 255, b: 255, a: 255 });
  });

  it('formats RGBA channels to canonical hex string', () => {
    expect(formatColor({ r: 255, g: 0, b: 128, a: 255 })).toBe('#ff0080');
    expect(formatColor({ r: 0, g: 255, b: 0, a: 128 })).toBe('#00ff0080');
  });

  it('composites colors with OVER mode', () => {
    const dst = parseColor('#000000'); // black opaque
    const srcOpaque = parseColor('#FFFFFF'); // white opaque
    const result1 = blendColors(srcOpaque, dst, 'OVER');
    expect(formatColor(result1)).toBe('#ffffff');

    // Semi-transparent red over black: 50% red (128 alpha) over black (255) -> dark red
    const srcHalfRed = { r: 255, g: 0, b: 0, a: 128 };
    const result2 = blendColors(srcHalfRed, dst, 'OVER');
    expect(result2.r).toBeCloseTo(128, -1);
    expect(result2.a).toBe(255);
  });

  it('composites colors with ADD mode with clamping at 255', () => {
    const colA = { r: 200, g: 50, b: 0, a: 255 };
    const colB = { r: 100, g: 100, b: 50, a: 255 };
    const added = blendColors(colA, colB, 'ADD');
    expect(added.r).toBe(255); // clamped from 300
    expect(added.g).toBe(150);
    expect(added.b).toBe(50);
  });

  it('composites colors with SUBTRACT mode with clamping at 0', () => {
    const src = { r: 100, g: 200, b: 50, a: 255 };
    const dst = { r: 150, g: 100, b: 100, a: 255 };
    // dst - src
    const sub = blendColors(src, dst, 'SUBTRACT');
    expect(sub.r).toBe(50); // 150 - 100
    expect(sub.g).toBe(0); // 100 - 200 clamped to 0
    expect(sub.b).toBe(50); // 100 - 50
  });

  it('composites colors with MULTIPLY mode', () => {
    const colA = { r: 255, g: 128, b: 0, a: 255 };
    const colB = { r: 128, g: 255, b: 255, a: 255 };
    const mult = blendColors(colA, colB, 'MULTIPLY');
    // (255 * 128) / 255 = 128
    expect(mult.r).toBe(128);
    // (128 * 255) / 255 = 128
    expect(mult.g).toBe(128);
    // (0 * 255) / 255 = 0
    expect(mult.b).toBe(0);
  });
});

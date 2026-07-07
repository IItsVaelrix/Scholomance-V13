import { describe, it, expect } from 'vitest';
import {
  parseHex,
  hexToRgb255,
  hexToRgb01,
  hexToInt,
  intToHex,
  rgbToHex,
  normalizeHex,
} from '../../../../codex/core/pixelbrain/color-codec.js';

describe('color-codec', () => {
  it('parses #RGB, #RRGGBB and #RRGGBBAA forms', () => {
    expect(parseHex('#00E5FF')).toEqual({ r: 0, g: 229, b: 255, a: 255 });
    expect(parseHex('00e5ff')).toEqual({ r: 0, g: 229, b: 255, a: 255 });
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(parseHex('#00E5FF80')).toEqual({ r: 0, g: 229, b: 255, a: 128 });
  });

  it('returns null from parseHex for malformed input', () => {
    expect(parseHex('#00E5F')).toBeNull();
    expect(parseHex('#GGGGGG')).toBeNull();
    expect(parseHex('')).toBeNull();
    expect(parseHex(null)).toBeNull();
  });

  it('converters throw on malformed input unless a fallback is given', () => {
    expect(() => hexToRgb255('nope')).toThrow(TypeError);
    expect(hexToRgb255('nope', { r: 0, g: 0, b: 0 })).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToInt('#zz00zz', 0)).toBe(0);
  });

  it('hexToRgb01 produces 0–1 floats', () => {
    expect(hexToRgb01('#FF0080')).toEqual({ r: 1, g: 0, b: 128 / 255 });
  });

  it('hexToInt matches the Phaser exporter packing and round-trips via intToHex', () => {
    expect(hexToInt('#00E5FF')).toBe((0 << 16) | (229 << 8) | 255);
    expect(intToHex(hexToInt('#D8B84C'))).toBe('#d8b84c');
  });

  it('rgbToHex clamps and rounds channels', () => {
    expect(rgbToHex(300, -5, 127.6)).toBe('#ff0080');
  });

  it('normalizeHex canonicalizes to uppercase #RRGGBB', () => {
    expect(normalizeHex('d8b84c')).toBe('#D8B84C');
    expect(normalizeHex('#fff')).toBe('#FFFFFF');
    expect(normalizeHex('#00E5FF80')).toBe('#00E5FF');
  });
});

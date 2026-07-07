/**
 * Color Codec — canonical hex ↔ RGB conversions for PixelBrain.
 *
 * One home for the conversions that ~20 modules previously private-copied
 * with incompatible shapes and divergent malformed-input behavior.
 *
 * Malformed-input policy (the single documented rule):
 *   - `parseHex` is the lenient detector: returns null for anything that is
 *     not #RGB / #RRGGBB / #RRGGBBAA (leading '#' optional).
 *   - Every other converter throws TypeError on malformed input unless a
 *     `fallback` is supplied, in which case the fallback is returned.
 *
 * Adopt opportunistically: when touching a module with a private copy, swap
 * it for these and delete the copy. Do not mass-migrate.
 */

/**
 * Parse a hex color into { r, g, b, a } (0–255 ints, a defaults to 255).
 * Accepts #RGB, #RRGGBB, #RRGGBBAA (case-insensitive, '#' optional).
 * Returns null for malformed input.
 */
export function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  const clean = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
      a: 255,
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
      a: 255,
    };
  }
  if (/^[0-9a-fA-F]{8}$/.test(clean)) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
      a: parseInt(clean.slice(6, 8), 16),
    };
  }
  return null;
}

function parsed(hex, fallback, caller) {
  const rgb = parseHex(hex);
  if (rgb) return rgb;
  if (fallback !== undefined) return null;
  throw new TypeError(`${caller}: malformed hex color ${JSON.stringify(hex)}`);
}

/** Hex → { r, g, b } with 0–255 integer channels. */
export function hexToRgb255(hex, fallback) {
  const rgb = parsed(hex, fallback, 'hexToRgb255');
  if (!rgb) return fallback;
  return { r: rgb.r, g: rgb.g, b: rgb.b };
}

/** Hex → { r, g, b } with 0–1 float channels (shader-friendly). */
export function hexToRgb01(hex, fallback) {
  const rgb = parsed(hex, fallback, 'hexToRgb01');
  if (!rgb) return fallback;
  return { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 };
}

/** Hex → packed 24-bit integer (r<<16 | g<<8 | b), the Phaser exporter form. */
export function hexToInt(hex, fallback) {
  const rgb = parsed(hex, fallback, 'hexToInt');
  if (!rgb) return fallback;
  return (rgb.r << 16) | (rgb.g << 8) | rgb.b;
}

function channelToHex(v) {
  const clamped = Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
  return clamped.toString(16).padStart(2, '0');
}

/** RGB channels (0–255, clamped/rounded) → '#rrggbb'. */
export function rgbToHex(r, g, b) {
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
}

/** Packed 24-bit integer → '#rrggbb'. */
export function intToHex(int) {
  const n = Number(int) >>> 0;
  return rgbToHex((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
}

/** Any accepted hex form → canonical '#RRGGBB' (uppercase, alpha dropped). */
export function normalizeHex(hex, fallback) {
  const rgb = parsed(hex, fallback, 'normalizeHex');
  if (!rgb) return fallback;
  return rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase();
}

/**
 * palette-wire — serialize school palette data for the Blender addon.
 *
 * Hex values in SCHOOL_PALETTE are sRGB display values; shader inputs are
 * scene-linear. Under EXACT policy the authored hex must survive byte-exact,
 * so the conversion applied is recorded in the COLOR_LAW slot rather than
 * assumed.
 *
 * The palette crosses as quantized int32 RGB triples at UNIT scale, with the
 * sRGB→linear transfer function declared per wire. The addon creates the node
 * group; this module prepares the data.
 */

import { quantize, SCALES } from './quantize.js';
import { srgbToLinear as colorLawSrgbToLinear } from './color-law.js';

export class PaletteError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaletteError';
  }
}

/**
 * The school palette. sRGB display hex values.
 * These are the authored ground truth — the value-sketch law says authored hex
 * is an absolute [0,1] value sketch.
 */
export const SCHOOL_PALETTE = Object.freeze({
  SONIC:   Object.freeze({ primary: '#7c3aed', accent: '#a78bfa', glow: '#7c3aed' }),
  PSYCHIC: Object.freeze({ primary: '#06b6d4', accent: '#67e8f9', glow: '#06b6d4' }),
  ALCHEMY: Object.freeze({ primary: '#f59e0b', accent: '#fcd34d', glow: '#f59e0b' }),
  WILL:    Object.freeze({ primary: '#ef4444', accent: '#fca5a5', glow: '#ef4444' }),
  VOID:    Object.freeze({ primary: '#6366f1', accent: '#a5b4fc', glow: '#6366f1' }),
  default: Object.freeze({ primary: '#9ca3af', accent: '#d1d5db', glow: '#9ca3af' }),
});

export const SCHOOL_NAMES = Object.freeze(Object.keys(SCHOOL_PALETTE));

/**
 * Parse a hex color to [r, g, b] in [0, 1] sRGB.
 */
export function hexToSrgb(hex) {
  if (typeof hex !== 'string') throw new PaletteError(`hex must be a string, got ${typeof hex}`);
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new PaletteError(`invalid hex color: ${hex}`);
  return [
    parseInt(m[1].slice(0, 2), 16) / 255,
    parseInt(m[1].slice(2, 4), 16) / 255,
    parseInt(m[1].slice(4, 6), 16) / 255,
  ];
}

/**
 * sRGB component to scene-linear (IEC 61966-2-1).
 *
 * Delegates to color-law.js rather than reimplementing. There were three copies
 * of this function -- here, in palette.py, and in color-law.js -- and a colour
 * law with three implementations cannot be the thing two engines are compared
 * against: any drift between them surfaces as a COLOR_LAW disagreement that
 * cannot be attributed to either side.
 *
 * Kept as a function declaration, not `export const x = y`. The export form is
 * part of the contract: a const is not hoisted, so any consumer evaluating it
 * before this module finishes would hit the temporal dead zone. Delegating
 * costs one call and changes nothing for the ten call sites.
 */
export function srgbToLinear(c) {
  return colorLawSrgbToLinear(c);
}

/**
 * Convert hex to scene-linear [r, g, b].
 */
export function hexToLinear(hex) {
  return hexToSrgb(hex).map(srgbToLinear);
}

/**
 * Serialize a school palette to wire format.
 * All values are quantized int32 at UNIT scale.
 *
 * @param {string} school - school name (falls back to 'default')
 * @param {object} [options]
 * @param {string} [options.colorPolicy='EXACT'] - EXACT or SYNTHESIZED
 * @returns {Readonly<object>} wire-ready palette
 */
export function paletteToWire(school, options = {}) {
  const { colorPolicy = 'EXACT' } = options;
  const palette = SCHOOL_PALETTE[school] ?? SCHOOL_PALETTE.default;
  const resolvedSchool = SCHOOL_PALETTE[school] ? school : 'default';

  const channels = {};
  for (const [role, hex] of Object.entries(palette)) {
    const srgb = hexToSrgb(hex);
    const linear = hexToLinear(hex);

    channels[role] = Object.freeze({
      hex,
      srgb: Object.freeze(srgb.map((v) => quantize(v, SCALES.UNIT))),
      linear: Object.freeze(linear.map((v) => quantize(v, SCALES.UNIT))),
    });
  }

  return Object.freeze({
    school: resolvedSchool,
    colorPolicy,
    transferFunction: colorPolicy === 'EXACT' ? 'sRGB-IEC-61966-2-1' : 'none',
    scale: SCALES.UNIT,
    channels: Object.freeze(channels),
  });
}

/**
 * Serialize all school palettes to wire format.
 *
 * @param {object} [options]
 * @returns {Readonly<Record<string, object>>}
 */
export function allPalettesToWire(options = {}) {
  const result = {};
  for (const school of SCHOOL_NAMES) {
    result[school] = paletteToWire(school, options);
  }
  return Object.freeze(result);
}

/**
 * Validate that a palette wire packet contains no nulls and all values are int32.
 */
export function validatePaletteWire(wire) {
  if (!wire || typeof wire !== 'object') {
    return { valid: false, reason: 'palette wire must be a non-null object' };
  }
  if (!wire.school || typeof wire.school !== 'string') {
    return { valid: false, reason: 'school must be a non-empty string' };
  }
  if (!wire.channels || typeof wire.channels !== 'object') {
    return { valid: false, reason: 'channels must be a non-null object' };
  }
  for (const [role, ch] of Object.entries(wire.channels)) {
    for (const [space, values] of [['srgb', ch.srgb], ['linear', ch.linear]]) {
      if (!Array.isArray(values) || values.length !== 3) {
        return { valid: false, reason: `${role}.${space} must be a 3-element array` };
      }
      for (let i = 0; i < 3; i++) {
        if (!Number.isInteger(values[i])) {
          return { valid: false, reason: `${role}.${space}[${i}] must be an integer, got ${values[i]}` };
        }
        if (values[i] === null || values[i] === undefined) {
          return { valid: false, reason: `${role}.${space}[${i}] is null` };
        }
      }
    }
  }
  return { valid: true, reason: 'ok' };
}

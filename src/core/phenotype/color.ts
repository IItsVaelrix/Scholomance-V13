/**
 * PHENOTYPE — colour primitives.
 *
 * Pure, deterministic (VAELRIX Law 6). No dependencies: the LAB/LCh maths is
 * short and the project has no colour library.
 *
 * Slot 1 (luminance) and slot 4 (chromaticity) must be orthogonal, which is
 * why chromaticity is keyed on the LCh HUE ANGLE and not on the raw a-star and
 * b-star components: both move substantially under a tint or shade of the same
 * hue, which would couple slot 4 to slot 1. See spec §3.3.
 *
 * (Written "a-star" deliberately — the literal sequence would close this
 * comment block early.)
 */

export type Rgb = { r: number; g: number; b: number };
export type Lab = { L: number; a: number; b: number };
export type Lch = { L: number; C: number; h: number };

const RGB_PATTERN = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\)$/;

/** Parse the `rgb()` / `rgba()` forms getComputedStyle returns. Null when unparseable — never a default. */
export function parseCssColor(css: string): Rgb | null {
  const match = RGB_PATTERN.exec(css.trim());
  if (!match) return null;
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
  };
}

function srgbToLinear(channel8: number): number {
  const cs = channel8 / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * srgbToLinear(rgb.r) +
    0.7152 * srgbToLinear(rgb.g) +
    0.0722 * srgbToLinear(rgb.b)
  );
}

/** WCAG contrast ratio. Symmetric in its arguments. */
export function contrastRatio(fg: Rgb, bg: Rgb): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

// D65 reference white.
const XN = 0.9505;
const YN = 1.0;
const ZN = 1.0890;
const DELTA = 6 / 29;

function pivot(t: number): number {
  return t > DELTA ** 3 ? Math.cbrt(t) : t / (3 * DELTA ** 2) + 4 / 29;
}

export function rgbToLab(rgb: Rgb): Lab {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  const x = 0.4124 * r + 0.3576 * g + 0.1805 * b;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = 0.0193 * r + 0.1192 * g + 0.9505 * b;

  const fx = pivot(x / XN);
  const fy = pivot(y / YN);
  const fz = pivot(z / ZN);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function labToLch(lab: Lab): Lch {
  const C = Math.hypot(lab.a, lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L: lab.L, C, h };
}

/** Shortest angular distance in degrees, 0..180. */
export function hueDistanceDeg(a: number, b: number): number {
  const diff = Math.abs(((a - b) % 360 + 360) % 360);
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Slot 6 — density.
 *
 * ISOLATION CONTRACT
 *   source:        rasterized element pixels vs the resolved background colour
 *   normalization: ink / AREA INSIDE THE CLIPPED REGION, never / bounding box
 *   pausedState:   animations paused; sampled at a single settled frame
 *
 * The denominator is what decouples this axis from slot 5 (shape). With a
 * bounding-box denominator, a rect -> circle change alone would drop density by
 * (4 - pi) / 4 ~= 21% with no design change whatsoever, and the orthogonality
 * matrix would fail on the shape -> density pair. See spec §3.3.
 */

import type { Rgb } from '../color';

export type DensityTerm = 'sparse' | 'measured' | 'dense' | 'packed';

const BOUNDARIES: readonly (readonly [DensityTerm, number])[] = [
  ['sparse', 0.1],
  ['measured', 0.35],
  ['dense', 0.7],
];

/** Per-channel difference below which a pixel counts as background (anti-aliasing guard). */
const DEFAULT_INK_THRESHOLD = 8;

/**
 * Area of a rounded rectangle: the bounding box less the four corner offcuts.
 * Each corner removes (1 - pi/4) r^2, so four corners remove (4 - pi) r^2.
 * Exact for the circle case, where r = min(w, h) / 2.
 */
export function clippedRegionArea(input: {
  width: number;
  height: number;
  borderRadiusPx: number;
}): number {
  const { width, height } = input;
  const r = Math.min(input.borderRadiusPx, Math.min(width, height) / 2);
  return width * height - (4 - Math.PI) * r * r;
}

/** Count pixels in a raw buffer that differ from the background beyond the threshold. */
export function countInkPixels(
  raw: Buffer,
  channels: number,
  background: Rgb,
  threshold: number = DEFAULT_INK_THRESHOLD,
): number {
  let ink = 0;
  for (let i = 0; i + channels <= raw.length; i += channels) {
    const dr = Math.abs(raw[i] - background.r);
    const dg = Math.abs(raw[i + 1] - background.g);
    const db = Math.abs(raw[i + 2] - background.b);
    if (dr > threshold || dg > threshold || db > threshold) ink += 1;
  }
  return ink;
}

export function quantizeDensity(inkPixels: number, clippedArea: number): DensityTerm | null {
  if (!Number.isFinite(inkPixels) || !Number.isFinite(clippedArea)) return null;
  if (clippedArea <= 0 || inkPixels < 0) return null;

  const ratio = inkPixels / clippedArea;
  for (const [term, ceiling] of BOUNDARIES) {
    if (ratio < ceiling) return term;
  }
  return 'packed';
}

/**
 * Slot 3 — size.
 *
 * ISOLATION CONTRACT
 *   source:        getBoundingClientRect area
 *   normalization: area / viewport area (ratio, never absolute px)
 *   pausedState:   n/a (static property)
 *
 * Ratio, not pixels: an absolute-px quantizer would rewrite its block at every
 * responsive breakpoint and the code would stop meaning anything. Boundaries
 * are ~10x apart so a 10% nudge never crosses one but a 2x change always does.
 */

export type SizeTerm = 'glyph' | 'control' | 'panel' | 'region' | 'surface';

const BOUNDARIES: readonly (readonly [SizeTerm, number])[] = [
  ['glyph', 0.0005],
  ['control', 0.005],
  ['panel', 0.05],
  ['region', 0.3],
];

export function quantizeSize(area: number, viewportArea: number): SizeTerm | null {
  if (!Number.isFinite(area) || !Number.isFinite(viewportArea)) return null;
  if (viewportArea <= 0 || area < 0) return null;

  const ratio = area / viewportArea;
  for (const [term, ceiling] of BOUNDARIES) {
    if (ratio < ceiling) return term;
  }
  return 'surface';
}

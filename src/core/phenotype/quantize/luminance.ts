/**
 * Slot 1 — luminance relationship.
 *
 * ISOLATION CONTRACT
 *   source:        computed foreground/background colour pair
 *   normalization: WCAG contrast ratio
 *   pausedState:   n/a (static property)
 *
 * Read from computed styles, NEVER from screenshot pixels — that is what keeps
 * this axis orthogonal to slot 2 (stacking). The documented cost is blindness
 * to compositing; see spec §1.2.
 */

import { contrastRatio, parseCssColor } from '../color';

export type LuminanceTerm = 'fail' | 'ui' | 'body' | 'high';

/** WCAG boundaries. A published standard, not a tuning choice. */
const UI_MIN = 3.0;
const BODY_MIN = 4.5;
const HIGH_MIN = 7.0;

export function quantizeLuminance(fgCss: string, bgCss: string): LuminanceTerm | null {
  const fg = parseCssColor(fgCss);
  const bg = parseCssColor(bgCss);
  if (!fg || !bg) return null;

  const ratio = contrastRatio(fg, bg);
  if (ratio >= HIGH_MIN) return 'high';
  if (ratio >= BODY_MIN) return 'body';
  if (ratio >= UI_MIN) return 'ui';
  return 'fail';
}

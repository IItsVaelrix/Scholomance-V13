/**
 * Slot 4 — chromaticity.
 *
 * ISOLATION CONTRACT
 *   source:        computed colour, LCh hue angle only
 *   normalization: nearest palette role within a hue tolerance
 *   pausedState:   n/a (static property)
 *
 * Hue angle, not the raw a-star and b-star components: both move substantially
 * under a tint or shade of the same hue, which would couple this axis to
 * slot 1 (the literal sequence would close this comment block early). Below the
 * chroma floor the hue angle is numerically unstable, so greys quantize to
 * `neutral` rather than to a noise-selected role (Law 6). See spec §3.3.
 */

import { hueDistanceDeg, labToLch, parseCssColor, rgbToLab } from '../color';

export type PaletteRole = { name: string; hue: number };

const DEFAULT_HUE_TOLERANCE_DEG = 25;
const DEFAULT_CHROMA_FLOOR = 5;

export function quantizeChromaticity(
  cssColor: string,
  palette: readonly PaletteRole[],
  opts: { hueToleranceDeg?: number; chromaFloor?: number } = {},
): string | null {
  const rgb = parseCssColor(cssColor);
  if (!rgb) return null;

  const hueTolerance = opts.hueToleranceDeg ?? DEFAULT_HUE_TOLERANCE_DEG;
  const chromaFloor = opts.chromaFloor ?? DEFAULT_CHROMA_FLOOR;

  const lch = labToLch(rgbToLab(rgb));
  if (lch.C < chromaFloor) return 'neutral';

  let best: PaletteRole | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const role of palette) {
    const distance = hueDistanceDeg(lch.h, role.hue);
    // Strict `<` keeps the first declared role on an exact tie — a total,
    // deterministic order over the palette (Law 6).
    if (distance < bestDistance) {
      bestDistance = distance;
      best = role;
    }
  }

  if (!best || bestDistance > hueTolerance) return 'off-palette';
  return best.name;
}

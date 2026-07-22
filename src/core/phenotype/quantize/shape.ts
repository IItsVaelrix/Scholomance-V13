/**
 * Slot 5 — shape.
 *
 * ISOLATION CONTRACT
 *   source:        border-radius, width/height, clip-path
 *   normalization: radius / min(width, height) — a ratio, so a pill is a pill
 *                  at any scale
 *   pausedState:   n/a (static property)
 *
 * Geometry and clipping ONLY. This axis must never read painted extent, or it
 * would couple to slot 6 (density).
 */

export type ShapeTerm = 'rect' | 'round' | 'pill' | 'circle' | 'notched';

const ROUND_MIN = 0.05;
const FULL_MIN = 0.5;
/** Aspect within this of 1 counts as square. */
const SQUARE_TOLERANCE = 0.05;

export function quantizeShape(input: {
  width: number;
  height: number;
  borderRadiusPx: number;
  clipPath: string;
}): ShapeTerm | null {
  const { width, height, borderRadiusPx, clipPath } = input;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;

  // A clip-path dominates: the painted silhouette is no longer a rounded rect.
  if (clipPath && clipPath.trim() !== 'none') return 'notched';

  const shortSide = Math.min(width, height);
  const ratio = borderRadiusPx / shortSide;

  if (ratio < ROUND_MIN) return 'rect';
  if (ratio < FULL_MIN) return 'round';

  const aspect = width / height;
  return Math.abs(aspect - 1) <= SQUARE_TOLERANCE ? 'circle' : 'pill';
}

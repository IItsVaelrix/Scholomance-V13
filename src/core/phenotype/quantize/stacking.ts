/**
 * Slot 2 — stacking.
 *
 * ISOLATION CONTRACT
 *   source:        computed z-index
 *   normalization: floor to the nearest VAELRIX Law 10 tier
 *   pausedState:   n/a (static property)
 */

import { STACKING_TIERS } from '../../../data/stacking_tiers.js';

export type StackingTerm = 'base' | 'above' | 'overlay' | 'system';

/** Descending so the first threshold met wins. */
const TIERS: readonly (readonly [StackingTerm, number])[] = [
  ['system', STACKING_TIERS.SYSTEM],
  ['overlay', STACKING_TIERS.OVERLAY],
  ['above', STACKING_TIERS.ABOVE],
  ['base', STACKING_TIERS.BASE],
];

export function quantizeStacking(zIndexCss: string): StackingTerm | null {
  const raw = zIndexCss.trim();
  // `auto` means the element creates no stacking context of its own.
  const z = raw === 'auto' ? 0 : Number(raw);
  if (!Number.isFinite(z)) return null;

  for (const [term, threshold] of TIERS) {
    if (z >= threshold) return term;
  }
  return 'base';
}

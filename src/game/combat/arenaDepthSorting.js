export const ARENA_DEPTH_SORT_BASE = 20;
export const ARENA_DEPTH_SORT_STEP = 2;

export const ARENA_SORT_LAYER = Object.freeze({
  TORCH_SHADOW: -2,
  TORCH_AMBIENT: -1,
  TORCH_BODY: 0,
  LOOT_CHEST: 0,
  PLAYER: 1,
  PORTAL_WARDEN: 2,
});

/** Iso arena painter depth from grid tile — higher ty (south) draws in front. */
export function getGridSortDepth(tx, ty, layerOffset = 0) {
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return ARENA_DEPTH_SORT_BASE;
  return ARENA_DEPTH_SORT_BASE + (tx + ty) * ARENA_DEPTH_SORT_STEP + layerOffset;
}
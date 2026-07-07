export const VOID_SCENE_WIDTH = 1920;
export const VOID_SCENE_HEIGHT = 1080;
export const VOID_TILE_SIZE = 32;
export const VOID_GRID_COLS = 60;   // 1920 / 32
export const VOID_GRID_ROWS = 34;   // 1080 / 32

export const PHI = 1.6180339887;

export const VOID_PILLAR_A = { x: 734, y: 255 } as const;
export const VOID_PILLAR_B = { x: 1467, y: 413 } as const;
export const VOID_PILLAR_C = { x: 1187, y: 825 } as const;

export const VOID_SINGULARITY = { x: 960, y: 672 } as const;

// Tile corner (30, 21) — shared corner of four inner fibonacci squares
export const VOID_SINGULARITY_TILE = { col: 30, row: 21 } as const;

// All 15 tiles in the VOID damage zone (3 inner fibonacci squares)
export const VOID_DAMAGE_ZONE_TILES: ReadonlyArray<{ col: number; row: number }> = [
  // 1×1 upper-right
  { col: 30, row: 20 },
  // 1×1 lower-left
  { col: 29, row: 21 },
  // 2×2 (right of singularity)
  { col: 30, row: 21 }, { col: 31, row: 21 },
  { col: 30, row: 22 }, { col: 31, row: 22 },
  // 3×3 (upper-left of singularity)
  { col: 27, row: 18 }, { col: 28, row: 18 }, { col: 29, row: 18 },
  { col: 27, row: 19 }, { col: 28, row: 19 }, { col: 29, row: 19 },
  { col: 27, row: 20 }, { col: 28, row: 20 }, { col: 29, row: 20 },
] as const;

// Fibonacci-timed tick frame offsets (relative to impact at t=0)
export const VOID_TICK_FRAME_OFFSETS = [1, 2, 3, 5, 8, 13, 21, 34] as const;

export const VOID_TICK_DAMAGE_PERCENT = 2;
export const VOID_TICK_COUNT = 8;
export const VOID_MAX_EXPOSURE_PERCENT = VOID_TICK_COUNT * VOID_TICK_DAMAGE_PERCENT; // 16

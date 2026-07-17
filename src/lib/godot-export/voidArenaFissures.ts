import type { NormalizedSceneObject } from "../godot/frame-printer";
import { toStableGodotId } from "../godot/frame-printer";
import { VOID_TILE_SIZE } from "./voidArenaConstants";

// Clockwise spiral arm: sequence of (col, row) tile positions tracing the spiral
// from the outer edge toward the singularity. Generated from fibonacci rectangle
// boundaries; each entry is the center-tile of a spiral segment.
const FISSURE_SPIRAL_TILES: ReadonlyArray<{
  col: number;
  row: number;
  width: 1 | 2 | 3;
  rotation: number;
}> = [
  // Outer arm — right side (fibonacci square 8×8 boundary)
  { col: 47, row: 21, width: 1, rotation: 0 },
  { col: 46, row: 21, width: 1, rotation: 0 },
  { col: 45, row: 21, width: 1, rotation: 0 },
  // Bend: right → up
  { col: 44, row: 21, width: 1, rotation: Math.PI / 4 },
  // Up arm (5×5 boundary)
  { col: 42, row: 17, width: 1, rotation: Math.PI / 2 },
  { col: 42, row: 18, width: 1, rotation: Math.PI / 2 },
  { col: 42, row: 19, width: 1, rotation: Math.PI / 2 },
  // Bend: up → left
  { col: 42, row: 16, width: 2, rotation: (3 * Math.PI) / 4 },
  // Left arm (3×3 boundary)
  { col: 35, row: 14, width: 2, rotation: Math.PI },
  { col: 33, row: 14, width: 2, rotation: Math.PI },
  { col: 31, row: 14, width: 2, rotation: Math.PI },
  // Bend: left → down
  { col: 27, row: 14, width: 2, rotation: (5 * Math.PI) / 4 },
  // Down arm (2×2 boundary)
  { col: 27, row: 17, width: 2, rotation: (3 * Math.PI) / 2 },
  { col: 27, row: 19, width: 2, rotation: (3 * Math.PI) / 2 },
  // Inner convergence
  { col: 28, row: 20, width: 3, rotation: (7 * Math.PI) / 4 },
  { col: 29, row: 20, width: 3, rotation: 0 },
  { col: 30, row: 20, width: 3, rotation: 0 },
];

export function buildFissureObjects(): NormalizedSceneObject[] {
  return FISSURE_SPIRAL_TILES.map((tile, index) => ({
    id: toStableGodotId(["fissure", "spiral", index]),
    type: "AnimatedSprite2D" as const,
    transform: {
      x: tile.col * VOID_TILE_SIZE + VOID_TILE_SIZE / 2,
      y: tile.row * VOID_TILE_SIZE + VOID_TILE_SIZE / 2,
      rotation: tile.rotation,
      scaleX: 1,
      scaleY: 1,
      zIndex: 2,
    },
    props: {
      shader_param_glow: "#00E5FF",
      shader_param_aura_radius: 10,
      fissure_width: tile.width,
      animation: "idle_breathe",
    },
  }));
}

// Amethyst scatter — 28 tiles, three placement clusters
const AMETHYST_TILE_POSITIONS: ReadonlyArray<{ col: number; row: number }> = [
  // Pillar A cluster (22, 7) ±3 tiles
  { col: 20, row: 8 }, { col: 21, row: 9 }, { col: 23, row: 6 },
  { col: 24, row: 9 }, { col: 22, row: 10 },
  // Pillar B cluster (45, 12) ±3 tiles
  { col: 43, row: 11 }, { col: 46, row: 13 }, { col: 44, row: 14 },
  { col: 47, row: 11 }, { col: 43, row: 13 },
  // Pillar C cluster (37, 25) ±3 tiles
  { col: 35, row: 24 }, { col: 38, row: 26 }, { col: 36, row: 27 },
  { col: 39, row: 24 }, { col: 37, row: 26 },
  // Spiral border band (outside fissure centerline)
  { col: 48, row: 22 }, { col: 49, row: 20 }, { col: 43, row: 15 },
  { col: 36, row: 13 }, { col: 28, row: 15 }, { col: 26, row: 18 },
  { col: 26, row: 22 }, { col: 28, row: 24 },
  // Two isolated singles in negative space
  { col: 10, row: 5 },
  { col: 54, row: 29 },
];

export function buildAmethystCrackObjects(): NormalizedSceneObject[] {
  return AMETHYST_TILE_POSITIONS.map((tile, index) => ({
    id: toStableGodotId(["amethyst", "crack", index]),
    type: "Sprite2D" as const,
    transform: {
      x: tile.col * VOID_TILE_SIZE + VOID_TILE_SIZE / 2,
      y: tile.row * VOID_TILE_SIZE + VOID_TILE_SIZE / 2,
      rotation: (index * 0.7) % (Math.PI * 2),
      scaleX: 0.8 + (index % 3) * 0.15,
      scaleY: 0.8 + (index % 5) * 0.1,
      zIndex: 1,
    },
    props: {
      tint: "#7B2FBE",
      resource: "res://art/void/amethyst_crack.png",
    },
  }));
}

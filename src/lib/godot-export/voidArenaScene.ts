import type { NormalizedFrameState, NormalizedSceneObject } from "../godot/frame-printer";
import { toStableGodotId } from "../godot/frame-printer";
import {
  VOID_PILLAR_A, VOID_PILLAR_B, VOID_PILLAR_C,
  VOID_SINGULARITY,
} from "./voidArenaConstants";
import { buildFissureObjects, buildAmethystCrackObjects } from "./voidArenaFissures";

function buildPillar(
  key: "a" | "b" | "c",
  pos: { x: number; y: number },
  scaleY: number,
): NormalizedSceneObject {
  return {
    id: toStableGodotId(["pillar", key]),
    type: "Sprite2D",
    transform: {
      x: pos.x,
      y: pos.y,
      rotation: 0,
      scaleX: 1,
      scaleY,
      zIndex: 4,
    },
    props: {
      resource: "res://art/void/obsidian_pillar.png",
      tint: "#0D0D1A",
      shader_param_highlight_drift_speed: 0.05,
    },
  };
}

function buildSingularityMarker(): NormalizedSceneObject {
  return {
    id: toStableGodotId(["singularity", "marker"]),
    type: "AnimatedSprite2D",
    transform: {
      x: VOID_SINGULARITY.x,
      y: VOID_SINGULARITY.y,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: 3,
    },
    props: {
      animation: "idle_pulse",
      resource: "res://art/void/singularity.png",
    },
  };
}

export function buildVoidArenaRestingScene(): NormalizedFrameState {
  const objects: NormalizedSceneObject[] = [
    // Base tilemap
    {
      id: toStableGodotId(["tilemap", "base"]),
      type: "TileMap",
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 0 },
      props: {
        tile_size: 32,
        resource: "res://art/void/void_tileset.tres",
      },
    },
    // Amethyst floor cracks (below fissures)
    ...buildAmethystCrackObjects(),
    // Void fissure network
    ...buildFissureObjects(),
    // Singularity
    buildSingularityMarker(),
    // Obsidian pillars — scaleY encodes height class
    buildPillar("a", VOID_PILLAR_A, 2.8),
    buildPillar("b", VOID_PILLAR_B, 1.9),
    buildPillar("c", VOID_PILLAR_C, 1.2),
  ];

  return {
    frame: 0,
    timestampMs: 0,
    sceneId: "void_arena",
    seed: "void_arena_v1",
    objects,
  };
}

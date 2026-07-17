import type { NormalizedFrameState } from "../godot/frame-printer";
import { printFrameTimeline, toStableGodotId } from "../godot/frame-printer";
import type { FrameInstantiationTimeline } from "../godot/frame-printer";
import {
  VOID_TICK_FRAME_OFFSETS,
  VOID_DAMAGE_ZONE_TILES,
  VOID_SINGULARITY,
  VOID_TILE_SIZE,
} from "./voidArenaConstants";

function singularityFlashFrame(base: NormalizedFrameState, frameOffset: number): NormalizedFrameState {
  return {
    ...base,
    frame: frameOffset,
    timestampMs: (frameOffset / 60) * 1000,
    objects: base.objects.map((obj) => {
      if (obj.id === toStableGodotId(["singularity", "marker"])) {
        return {
          ...obj,
          props: { ...obj.props, animation: "trigger_flash" },
        };
      }
      return obj;
    }),
  };
}

function applyTickFrame(
  base: NormalizedFrameState,
  frameOffset: number,
  tickIndex: number,
): NormalizedFrameState {
  const isShardTick = tickIndex === 4; // 5th tick (t+8f), zero-indexed

  const newObjects = [...base.objects];

  // Widen fissures in the damage zone
  const updatedObjects = newObjects.map((obj) => {
    const isFissureInZone = VOID_DAMAGE_ZONE_TILES.some((tile) => {
      const tileX = tile.col * VOID_TILE_SIZE + VOID_TILE_SIZE / 2;
      const tileY = tile.row * VOID_TILE_SIZE + VOID_TILE_SIZE / 2;
      return (
        obj.type === "AnimatedSprite2D" &&
        Math.abs(obj.transform.x - tileX) < VOID_TILE_SIZE &&
        Math.abs(obj.transform.y - tileY) < VOID_TILE_SIZE
      );
    });

    if (isFissureInZone) {
      const currentWidth = (obj.props?.fissure_width as number) ?? 1;
      return {
        ...obj,
        props: {
          ...obj.props,
          fissure_width: Math.min(currentWidth + 1, 3) as 1 | 2 | 3,
          animation: "tick_pulse",
        },
      };
    }

    return obj;
  });

  // Spawn void shards on tick 5 (t+8f)
  const shardObjects = isShardTick
    ? [
        {
          id: toStableGodotId(["void", "shard", frameOffset, "a"]),
          type: "Sprite2D" as const,
          transform: {
            x: VOID_SINGULARITY.x + VOID_TILE_SIZE / 2,
            y: VOID_SINGULARITY.y - VOID_TILE_SIZE / 2,
            rotation: Math.PI / 6,
            scaleX: 0.6,
            scaleY: 0.6,
            zIndex: 3,
          },
          props: {
            resource: "res://art/void/void_shard.png",
            tint: "#00E5FF",
            drifting: true,
          },
        },
        {
          id: toStableGodotId(["void", "shard", frameOffset, "b"]),
          type: "Sprite2D" as const,
          transform: {
            x: VOID_SINGULARITY.x - VOID_TILE_SIZE,
            y: VOID_SINGULARITY.y,
            rotation: -Math.PI / 4,
            scaleX: 0.5,
            scaleY: 0.5,
            zIndex: 3,
          },
          props: {
            resource: "res://art/void/void_shard.png",
            tint: "#00E5FF",
            drifting: true,
          },
        },
      ]
    : [];

  return {
    ...base,
    frame: frameOffset,
    timestampMs: (frameOffset / 60) * 1000,
    objects: [...updatedObjects, ...shardObjects],
  };
}

export function buildSingularityTriggerFrames(
  baseState: NormalizedFrameState,
  frameOffset: number = 0,
): NormalizedFrameState[] {
  return [
    singularityFlashFrame(baseState, frameOffset),
    { ...baseState, frame: frameOffset + 2, timestampMs: ((frameOffset + 2) / 60) * 1000 },
    ...VOID_TICK_FRAME_OFFSETS.map((offset, tickIndex) =>
      applyTickFrame(baseState, frameOffset + offset + 2, tickIndex)
    ),
  ];
}

export function buildSingularityTriggerTimeline(
  baseState: NormalizedFrameState,
): FrameInstantiationTimeline {
  return printFrameTimeline(buildSingularityTriggerFrames(baseState, 0), {
    sceneId: "void_arena",
    fps: 60,
    seed: "void_arena_v1",
    sourceSystem: "manual",
    bytecodeContract: "framePacket",
    validate: true,
  });
}

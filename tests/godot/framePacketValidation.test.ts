import { describe, expect, it } from "vitest";
import { validateFrameTimeline } from "../../src/lib/godot/frame-printer";
import type { FrameInstantiationTimeline } from "../../src/lib/godot/frame-printer";

describe("validateFrameTimeline", () => {
  it("rejects unsupported node types", () => {
    const timeline: FrameInstantiationTimeline = {
      schemaVersion: 1,
      sceneId: "invalid_type_test",
      fps: 60,
      durationFrames: 1,
      seed: "seed_invalid",
      frames: [
        {
          frame: 0,
          timestampMs: 0,
          sceneId: "invalid_type_test",
          seed: "seed_invalid",
          create: [
            {
              op: "create",
              id: "bad_node",
              type: "UnsupportedNode" as never,
              transform: {
                x: 0,
                y: 0,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
              },
            },
          ],
          update: [],
          destroy: [],
        },
      ],
    };

    const result = validateFrameTimeline(timeline);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "FRAME_CREATE_UNSUPPORTED_NODE_TYPE")).toBe(
      true
    );
  });

  it("rejects updates targeting unknown ids", () => {
    const timeline: FrameInstantiationTimeline = {
      schemaVersion: 1,
      sceneId: "unknown_update_test",
      fps: 60,
      durationFrames: 1,
      seed: "seed_unknown_update",
      frames: [
        {
          frame: 0,
          timestampMs: 0,
          sceneId: "unknown_update_test",
          seed: "seed_unknown_update",
          create: [],
          update: [
            {
              op: "update",
              id: "missing_node",
              transform: {
                x: 100,
              },
            },
          ],
          destroy: [],
        },
      ],
    };

    const result = validateFrameTimeline(timeline);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "FRAME_UPDATE_UNKNOWN_ID")).toBe(true);
  });

  it("rejects destroys targeting unknown ids", () => {
    const timeline: FrameInstantiationTimeline = {
      schemaVersion: 1,
      sceneId: "unknown_destroy_test",
      fps: 60,
      durationFrames: 1,
      seed: "seed_unknown_destroy",
      frames: [
        {
          frame: 0,
          timestampMs: 0,
          sceneId: "unknown_destroy_test",
          seed: "seed_unknown_destroy",
          create: [],
          update: [],
          destroy: [
            {
              op: "destroy",
              id: "missing_node",
            },
          ],
        },
      ],
    };

    const result = validateFrameTimeline(timeline);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "FRAME_DESTROY_UNKNOWN_ID")).toBe(true);
  });

  it("rejects non-increasing frame order", () => {
    const timeline: FrameInstantiationTimeline = {
      schemaVersion: 1,
      sceneId: "frame_order_test",
      fps: 60,
      durationFrames: 2,
      seed: "seed_frame_order",
      frames: [
        {
          frame: 1,
          timestampMs: 16.6667,
          sceneId: "frame_order_test",
          seed: "seed_frame_order",
          create: [],
          update: [],
          destroy: [],
        },
        {
          frame: 1,
          timestampMs: 16.6667,
          sceneId: "frame_order_test",
          seed: "seed_frame_order",
          create: [],
          update: [],
          destroy: [],
        },
      ],
    };

    const result = validateFrameTimeline(timeline);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "FRAME_ORDER_INVALID")).toBe(true);
  });

  it("rejects non-finite prop numbers before JSON serialization can collapse them to null", () => {
    const timeline: FrameInstantiationTimeline = {
      schemaVersion: 1,
      sceneId: "non_finite_prop_test",
      fps: 60,
      durationFrames: 1,
      seed: "seed_non_finite_prop",
      frames: [
        {
          frame: 0,
          timestampMs: 0,
          sceneId: "non_finite_prop_test",
          seed: "seed_non_finite_prop",
          create: [
            {
              op: "create",
              id: "glyph",
              type: "Sprite2D",
              transform: {
                x: 0,
                y: 0,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
              },
              props: {
                opacity: Number.POSITIVE_INFINITY,
              },
            },
          ],
          update: [],
          destroy: [],
        },
      ],
    };

    const result = validateFrameTimeline(timeline);

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "FRAME_PROP_NON_FINITE_NUMBER")).toBe(
      true
    );
  });

  it("does not report duplicate ids for repeated missing create ids", () => {
    const timeline: FrameInstantiationTimeline = {
      schemaVersion: 1,
      sceneId: "missing_id_test",
      fps: 60,
      durationFrames: 2,
      seed: "seed_missing_id",
      frames: [
        {
          frame: 0,
          timestampMs: 0,
          sceneId: "missing_id_test",
          seed: "seed_missing_id",
          create: [
            {
              op: "create",
              id: "",
              type: "Sprite2D",
              transform: {
                x: 0,
                y: 0,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
              },
            },
          ],
          update: [],
          destroy: [],
        },
        {
          frame: 1,
          timestampMs: 16.6667,
          sceneId: "missing_id_test",
          seed: "seed_missing_id",
          create: [
            {
              op: "create",
              id: "",
              type: "Sprite2D",
              transform: {
                x: 1,
                y: 1,
                rotation: 0,
                scaleX: 1,
                scaleY: 1,
              },
            },
          ],
          update: [],
          destroy: [],
        },
      ],
    };

    const result = validateFrameTimeline(timeline);

    expect(result.ok).toBe(false);
    expect(result.issues.filter((issue) => issue.code === "FRAME_CREATE_MISSING_ID")).toHaveLength(
      2
    );
    expect(result.issues.some((issue) => issue.code === "FRAME_CREATE_DUPLICATE_ID")).toBe(false);
  });
});

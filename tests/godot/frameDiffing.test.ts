import { describe, expect, it } from "vitest";
import { diffFrameState } from "../../src/lib/godot/frame-printer";
import type { NormalizedFrameState } from "../../src/lib/godot/frame-printer";

describe("diffFrameState", () => {
  it("updates only changed transform fields", () => {
    const previousFrame: NormalizedFrameState = {
      frame: 0,
      timestampMs: 0,
      sceneId: "diff_test",
      seed: "seed_diff",
      objects: [
        {
          id: "orb",
          type: "Sprite2D",
          visible: true,
          transform: {
            x: 0,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          },
        },
      ],
    };

    const nextFrame: NormalizedFrameState = {
      frame: 1,
      timestampMs: 16.6667,
      sceneId: "diff_test",
      seed: "seed_diff",
      objects: [
        {
          id: "orb",
          type: "Sprite2D",
          visible: true,
          transform: {
            x: 10,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          },
        },
      ],
    };

    const diff = diffFrameState(previousFrame, nextFrame);

    expect(diff.create).toHaveLength(0);
    expect(diff.destroy).toHaveLength(0);
    expect(diff.update).toEqual([
      {
        op: "update",
        id: "orb",
        transform: {
          x: 10,
        },
        visible: undefined,
        props: undefined,
      },
    ]);
  });

  it("does not emit instructions for unchanged objects", () => {
    const frame: NormalizedFrameState = {
      frame: 0,
      timestampMs: 0,
      sceneId: "unchanged_test",
      seed: "seed_unchanged",
      objects: [
        {
          id: "still_label",
          type: "Label",
          visible: true,
          transform: {
            x: 0,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          },
          props: {
            text: "Still",
          },
        },
      ],
    };

    expect(diffFrameState(frame, { ...frame, frame: 1 }).update).toHaveLength(0);
  });

  it("does not emit ghost updates when explicit visibility becomes unspecified", () => {
    const previousFrame: NormalizedFrameState = {
      frame: 0,
      timestampMs: 0,
      sceneId: "visibility_unspecified_test",
      seed: "seed_visibility_unspecified",
      objects: [
        {
          id: "orb",
          type: "Sprite2D",
          visible: true,
          transform: {
            x: 0,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          },
        },
      ],
    };

    const nextFrame: NormalizedFrameState = {
      ...previousFrame,
      frame: 1,
      objects: [
        {
          ...previousFrame.objects[0],
          visible: undefined,
        },
      ],
    };

    const diff = diffFrameState(previousFrame, nextFrame);

    expect(diff.update).toHaveLength(0);
    expect(JSON.stringify(diff.update)).toBe("[]");
  });

  it("distinguishes null from non-finite prop numbers", () => {
    const previousFrame: NormalizedFrameState = {
      frame: 0,
      timestampMs: 0,
      sceneId: "non_finite_props_test",
      seed: "seed_non_finite_props",
      objects: [
        {
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
            opacity: null,
          },
        },
      ],
    };

    const nextFrame: NormalizedFrameState = {
      ...previousFrame,
      frame: 1,
      objects: [
        {
          ...previousFrame.objects[0],
          props: {
            opacity: Number.NaN,
          },
        },
      ],
    };

    expect(diffFrameState(previousFrame, nextFrame).update).toEqual([
      {
        op: "update",
        id: "glyph",
        transform: undefined,
        visible: undefined,
        props: {
          opacity: Number.NaN,
        },
      },
    ]);
  });

  it("emits destroy when an object disappears", () => {
    const previousFrame: NormalizedFrameState = {
      frame: 0,
      timestampMs: 0,
      sceneId: "destroy_test",
      seed: "seed_destroy",
      objects: [
        {
          id: "temporary_glyph",
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
    };

    const nextFrame: NormalizedFrameState = {
      frame: 1,
      timestampMs: 16.6667,
      sceneId: "destroy_test",
      seed: "seed_destroy",
      objects: [],
    };

    const diff = diffFrameState(previousFrame, nextFrame);

    expect(diff.destroy).toEqual([
      {
        op: "destroy",
        id: "temporary_glyph",
      },
    ]);
  });
});

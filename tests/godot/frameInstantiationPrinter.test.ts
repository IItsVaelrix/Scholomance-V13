import { describe, expect, it } from "vitest";
import {
  printFrameTimeline,
  shadowPrintGodotFrameTimeline,
  toGodotRuntimeJson,
  type NormalizedFrameState,
} from "../../src/lib/godot/frame-printer";
import { buildShadowGodotFrameTimelineExport } from "../../src/lib/godot-export/shadowFrameTimeline";

function makeFrames(): NormalizedFrameState[] {
  return [
    {
      frame: 0,
      timestampMs: 0,
      sceneId: "determinism_test",
      seed: "seed_a",
      objects: [
        {
          id: "orb",
          type: "Sprite2D",
          resource: "res://orb.png",
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
    },
  ];
}

describe("printFrameTimeline", () => {
  it("prints deterministic timelines for identical input", () => {
    const left = printFrameTimeline(makeFrames(), {
      sceneId: "determinism_test",
      fps: 60,
      seed: "seed_a",
      sourceSystem: "manual",
    });

    const right = printFrameTimeline(makeFrames(), {
      sceneId: "determinism_test",
      fps: 60,
      seed: "seed_a",
      sourceSystem: "manual",
    });

    expect(left).toEqual(right);
    expect(left.metadata?.deterministicHash).toBe(right.metadata?.deterministicHash);
  });

  it("pins the known-good deterministic timeline hash", () => {
    const timeline = printFrameTimeline(makeFrames(), {
      sceneId: "determinism_test",
      fps: 60,
      seed: "seed_a",
      sourceSystem: "manual",
    });

    expect(timeline.metadata?.deterministicHash).toBe("fnv1a_b9b65a9c");
    expect(timeline.frames[0].metadata?.deterministicHash).toBe("fnv1a_4355bd0d");
  });

  it("creates objects that appear in the first frame", () => {
    const frames: NormalizedFrameState[] = [
      {
        frame: 0,
        timestampMs: 0,
        sceneId: "create_test",
        seed: "seed_create",
        objects: [
          {
            id: "label_intro",
            type: "Label",
            visible: true,
            transform: {
              x: 10,
              y: 20,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
            },
            props: {
              text: "ChronoPress online",
            },
          },
        ],
      },
    ];

    const timeline = printFrameTimeline(frames, {
      sceneId: "create_test",
      fps: 60,
      seed: "seed_create",
      sourceSystem: "manual",
    });

    expect(timeline.frames[0].create).toHaveLength(1);
    expect(timeline.frames[0].create[0].id).toBe("label_intro");
    expect(timeline.frames[0].update).toHaveLength(0);
    expect(timeline.frames[0].destroy).toHaveLength(0);
  });

  it("serializes stable Godot runtime JSON", () => {
    const timeline = printFrameTimeline(makeFrames(), {
      sceneId: "determinism_test",
      fps: 60,
      seed: "seed_a",
      sourceSystem: "manual",
    });

    expect(toGodotRuntimeJson(timeline)).toBe(`${toGodotRuntimeJson(timeline).trim()}\n`);
    expect(JSON.parse(toGodotRuntimeJson(timeline))).toEqual(timeline);
  });

  it("exposes shadow timeline export without changing existing artifact builders", () => {
    const direct = shadowPrintGodotFrameTimeline(makeFrames(), {
      sceneId: "shadow_test",
      fps: 60,
      seed: "shadow_seed",
    });
    const bridged = buildShadowGodotFrameTimelineExport(makeFrames(), {
      sceneId: "shadow_test",
      fps: 60,
      seed: "shadow_seed",
    });

    expect(bridged).toBe(direct);
    expect(JSON.parse(bridged).metadata.sourceSystem).toBe("manual");
  });
});

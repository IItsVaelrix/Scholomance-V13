import { describe, expect, it } from "vitest";
import { buildVoidArenaRestingScene } from "../../src/lib/godot-export/voidArenaScene";
import { buildSingularityTriggerTimeline } from "../../src/lib/godot-export/voidSingularityTrigger";
import { validateFrameTimeline } from "../../src/lib/godot/frame-printer";
import { VOID_TICK_FRAME_OFFSETS, VOID_TICK_COUNT } from "../../src/lib/godot-export/voidArenaConstants";

describe("buildSingularityTriggerTimeline", () => {
  it("produces a valid frame timeline", () => {
    const base = buildVoidArenaRestingScene();
    const timeline = buildSingularityTriggerTimeline(base);
    const result = validateFrameTimeline(timeline);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("contains the correct number of tick frames", () => {
    const base = buildVoidArenaRestingScene();
    const timeline = buildSingularityTriggerTimeline(base);
    // flash(0) + snap(2) + 8 ticks = 10 packets
    expect(timeline.frames.length).toBe(2 + VOID_TICK_COUNT);
  });

  it("frames are in strictly ascending order", () => {
    const base = buildVoidArenaRestingScene();
    const timeline = buildSingularityTriggerTimeline(base);
    for (let i = 1; i < timeline.frames.length; i++) {
      expect(timeline.frames[i].frame).toBeGreaterThan(timeline.frames[i - 1].frame);
    }
  });

  it("spawns exactly 2 void shards on the 5th tick", () => {
    const base = buildVoidArenaRestingScene();
    const timeline = buildSingularityTriggerTimeline(base);
    // 5th tick is at index 2 + 4 = 6 in the frames array (0=flash, 1=snap, 2-9=ticks)
    const tick5Packet = timeline.frames[6];
    const shardCreates = tick5Packet.create.filter((c) => c.id.startsWith("void_shard"));
    expect(shardCreates).toHaveLength(2);
  });

  it("tick frame offsets match fibonacci sequence (offset from flash end)", () => {
    const base = buildVoidArenaRestingScene();
    const timeline = buildSingularityTriggerTimeline(base);
    // first tick is at index 2
    for (let i = 0; i < VOID_TICK_COUNT; i++) {
      expect(timeline.frames[i + 2].frame).toBe(VOID_TICK_FRAME_OFFSETS[i] + 2);
    }
  });
});

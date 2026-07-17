import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { validateFrameTimeline } from "../../src/lib/godot/frame-printer";
import type { FrameInstantiationTimeline } from "../../src/lib/godot/frame-printer";

const FRAMEPKT_PATH = join(process.cwd(), "godot_project/assets/void_arena.framepkt");

describe("void_arena.framepkt export", () => {
  it("file exists after export script is run", () => {
    expect(existsSync(FRAMEPKT_PATH)).toBe(true);
  });

  it("parses as valid JSON", () => {
    const raw = readFileSync(FRAMEPKT_PATH, "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("passes FrameInstantiationTimeline validation", () => {
    const timeline = JSON.parse(readFileSync(FRAMEPKT_PATH, "utf-8")) as FrameInstantiationTimeline;
    const result = validateFrameTimeline(timeline);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("singularity is at x=960, y=672", () => {
    const timeline = JSON.parse(readFileSync(FRAMEPKT_PATH, "utf-8")) as FrameInstantiationTimeline;
    const frame0 = timeline.frames[0];
    const singularity = frame0.create.find((c) => c.id === "singularity_marker");
    expect(singularity?.transform.x).toBe(960);
    expect(singularity?.transform.y).toBe(672);
  });

  it("contains exactly 3 pillar create instructions", () => {
    const timeline = JSON.parse(readFileSync(FRAMEPKT_PATH, "utf-8")) as FrameInstantiationTimeline;
    const pillars = timeline.frames[0].create.filter((c) => c.id.startsWith("pillar_"));
    expect(pillars).toHaveLength(3);
  });

  it("has schemaVersion 1", () => {
    const timeline = JSON.parse(readFileSync(FRAMEPKT_PATH, "utf-8")) as FrameInstantiationTimeline;
    expect(timeline.schemaVersion).toBe(1);
  });
});

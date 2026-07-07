import { describe, expect, it } from "vitest";
import { buildVoidArenaRestingScene } from "../../src/lib/godot-export/voidArenaScene";
import { toStableGodotId } from "../../src/lib/godot/frame-printer";
import { VOID_PILLAR_A, VOID_PILLAR_B, VOID_PILLAR_C, VOID_SINGULARITY } from "../../src/lib/godot-export/voidArenaConstants";

describe("buildVoidArenaRestingScene", () => {
  it("places pillars at phi-triangle coordinates", () => {
    const scene = buildVoidArenaRestingScene();
    const pillarA = scene.objects.find((o) => o.id === toStableGodotId(["pillar", "a"]));
    const pillarB = scene.objects.find((o) => o.id === toStableGodotId(["pillar", "b"]));
    const pillarC = scene.objects.find((o) => o.id === toStableGodotId(["pillar", "c"]));

    expect(pillarA?.transform.x).toBe(VOID_PILLAR_A.x);
    expect(pillarA?.transform.y).toBe(VOID_PILLAR_A.y);
    expect(pillarB?.transform.x).toBe(VOID_PILLAR_B.x);
    expect(pillarC?.transform.x).toBe(VOID_PILLAR_C.x);
  });

  it("places singularity at convergence coordinate", () => {
    const scene = buildVoidArenaRestingScene();
    const marker = scene.objects.find((o) => o.id === toStableGodotId(["singularity", "marker"]));
    expect(marker?.transform.x).toBe(VOID_SINGULARITY.x);
    expect(marker?.transform.y).toBe(VOID_SINGULARITY.y);
  });

  it("contains no amethyst cracks inside the 15-tile damage zone", () => {
    const scene = buildVoidArenaRestingScene();
    const amethystObjects = scene.objects.filter((o) => o.id.startsWith("amethyst_crack"));
    // damage zone bounds: cols 27-31, rows 18-22 (approximate bounding box)
    const inZone = amethystObjects.filter((o) => {
      const col = Math.floor(o.transform.x / 32);
      const row = Math.floor(o.transform.y / 32);
      return col >= 27 && col <= 31 && row >= 18 && row <= 22;
    });
    expect(inZone).toHaveLength(0);
  });

  it("produces a valid frame state with unique IDs", () => {
    const scene = buildVoidArenaRestingScene();
    const ids = scene.objects.map((o) => o.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

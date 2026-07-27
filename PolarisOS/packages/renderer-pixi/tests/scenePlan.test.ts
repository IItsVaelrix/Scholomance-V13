/**
 * scenePlan unit tests — Milestone 5 client-side visual projection.
 *
 * These run in a plain node env (no PixiJS, no DOM): the whole point of
 * scenePlan.ts is that the manifest → plan projection is pure and deterministic
 * so it can be verified without a WebGL context.
 *
 * Covers:
 *   - determinism: same manifest → same planHash, independent of layer order
 *   - z-ordering: sprites sorted by zIndex then layerId
 *   - visibility: hidden layers dropped
 *   - MVP visual rules: lantern hides when taken; brazier unlit→lit swap + warm
 *     overlay + lighting tint (scenario steps 6–10)
 *   - hotspot projection (visible only, sorted, command-carrying)
 *   - fallback text mode (PDR §5.4 / §16.3)
 */

import { describe, it, expect } from "vitest";
import type { SceneManifest, SceneLayer } from "@polaris/contracts";
import { buildScenePlan } from "@polaris/renderer-pixi";

// --- Manifest factory -------------------------------------------------------

function layer(overrides: Partial<SceneLayer> & Pick<SceneLayer, "layerId" | "layerType">): SceneLayer {
  return {
    assetKey: null,
    position: { x: 0, y: 0 },
    zIndex: 10,
    visible: true,
    flags: {},
    ...overrides,
  };
}

function makeManifest(overrides: Partial<SceneManifest> = {}): SceneManifest {
  return {
    sceneId: "ruined_shrine_rev0",
    roomId: "ruined_shrine",
    roomRevision: 0,
    visualRevision: 0,
    worldId: "codex_vale_mvp",
    backgroundAssetKey: "rooms/ruined_shrine/background",
    layers: [
      layer({ layerId: "ruined_shrine_bg", layerType: "background", zIndex: 0 }),
      layer({
        layerId: "ruined_shrine_entity_shrine_lantern",
        layerType: "entity",
        assetKey: "entities/lantern",
        position: { x: 320, y: 240 },
        flags: { displayName: "Brass Lantern" },
      }),
      layer({
        layerId: "ruined_shrine_entity_shrine_brazier_unlit",
        layerType: "prop",
        assetKey: "entities/brazier",
        position: { x: 400, y: 280 },
        visible: true,
      }),
      layer({
        layerId: "ruined_shrine_entity_shrine_brazier_lit",
        layerType: "prop",
        assetKey: "entities/brazier_lit",
        position: { x: 400, y: 280 },
        visible: false,
      }),
      layer({
        layerId: "ruined_shrine_player_alice",
        layerType: "player-marker",
        assetKey: "players/marker_default",
        zIndex: 20,
        flags: { displayName: "Alice" },
      }),
    ],
    hotspots: [
      {
        hotspotId: "ruined_shrine_hotspot_shrine_lantern",
        entityId: "shrine_lantern",
        label: "Brass Lantern",
        command: "take lantern",
        region: { x: 272, y: 192, w: 96, h: 96 },
        visible: true,
      },
      {
        hotspotId: "ruined_shrine_hotspot_shrine_brazier",
        entityId: "shrine_brazier",
        label: "Iron Brazier",
        command: "light brazier",
        region: { x: 352, y: 232, w: 96, h: 96 },
        visible: true,
      },
    ],
    textRegions: [
      { regionId: "ruined_shrine_title", kind: "title", anchor: { x: 24, y: 24 }, width: 640, text: "The Ruined Shrine" },
      { regionId: "ruined_shrine_description", kind: "description", anchor: { x: 24, y: 64 }, width: 640, text: "Stone walls lean…" },
    ],
    lightingState: "ambient_moonlight",
    ambientEffects: ["dust_motes"],
    contractHash: "abc123def4567890",
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// --- Tests ------------------------------------------------------------------

describe("buildScenePlan — determinism", () => {
  it("produces an identical planHash for the same manifest across calls", () => {
    const m = makeManifest();
    const a = buildScenePlan(m);
    const b = buildScenePlan(m);
    expect(a.planHash).toBe(b.planHash);
    expect(a.planHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is independent of input layer ordering (total stable order)", () => {
    const m1 = makeManifest();
    const shuffled = makeManifest({ layers: [...m1.layers].reverse() });
    expect(buildScenePlan(m1).planHash).toBe(buildScenePlan(shuffled).planHash);
  });

  it("excludes generatedAt from the plan hash (only non-deterministic field)", () => {
    const a = buildScenePlan(makeManifest({ generatedAt: "2026-01-01T00:00:00.000Z" }));
    const b = buildScenePlan(makeManifest({ generatedAt: "2099-12-31T23:59:59.999Z" }));
    expect(a.planHash).toBe(b.planHash);
  });

  it("changes the planHash when a visually-meaningful field changes", () => {
    const base = buildScenePlan(makeManifest());
    const lit = buildScenePlan(makeManifest({ lightingState: "warm_firelight" }));
    expect(base.planHash).not.toBe(lit.planHash);
  });
});

describe("buildScenePlan — ordering & visibility", () => {
  it("drops the background and hidden layers, sorts by zIndex then layerId", () => {
    const plan = buildScenePlan(makeManifest());
    const ids = plan.sprites.map((s) => s.layerId);
    // background excluded; brazier_lit hidden → excluded.
    expect(ids).not.toContain("ruined_shrine_bg");
    expect(ids).not.toContain("ruined_shrine_entity_shrine_brazier_lit");
    // zIndex 10 (entity/prop) before zIndex 20 (player-marker).
    expect(ids).toEqual([
      "ruined_shrine_entity_shrine_brazier_unlit",
      "ruined_shrine_entity_shrine_lantern",
      "ruined_shrine_player_alice",
    ]);
  });

  it("carries the authored display label from layer flags", () => {
    const plan = buildScenePlan(makeManifest());
    const lantern = plan.sprites.find((s) => s.layerId === "ruined_shrine_entity_shrine_lantern");
    expect(lantern?.label).toBe("Brass Lantern");
  });
});

describe("buildScenePlan — MVP visual rules (scenario steps 6–10)", () => {
  it("hides the lantern layer once it is taken (moved to inventory)", () => {
    const taken = makeManifest();
    // The compiler marks the lantern layer invisible when it leaves the room.
    taken.layers = taken.layers.map((l) =>
      l.layerId === "ruined_shrine_entity_shrine_lantern" ? { ...l, visible: false } : l,
    );
    const plan = buildScenePlan(taken);
    expect(plan.sprites.map((s) => s.layerId)).not.toContain("ruined_shrine_entity_shrine_lantern");
  });

  it("swaps brazier unlit→lit and adds the warm overlay + firelight tint when lit", () => {
    const lit = makeManifest({ lightingState: "warm_firelight" });
    lit.layers = lit.layers.map((l) => {
      if (l.layerId.endsWith("_unlit")) return { ...l, visible: false };
      if (l.layerId.endsWith("_lit")) return { ...l, visible: true };
      return l;
    });
    lit.layers.push(
      layer({ layerId: "ruined_shrine_warm_light_overlay", layerType: "lighting", assetKey: "rooms/ruined_shrine/lit_overlay", zIndex: 30, flags: { source: "brazier" } }),
    );

    const plan = buildScenePlan(lit);
    const ids = plan.sprites.map((s) => s.layerId);
    expect(ids).toContain("ruined_shrine_entity_shrine_brazier_lit");
    expect(ids).not.toContain("ruined_shrine_entity_shrine_brazier_unlit");
    expect(ids).toContain("ruined_shrine_warm_light_overlay");
    expect(plan.lightingState).toBe("warm_firelight");
    // Warm firelight uses a warm (orange) tint, distinct from cool moonlight.
    expect(plan.lightingTint).toBe(0xffb066);
  });

  it("uses a cool tint for ambient moonlight", () => {
    const plan = buildScenePlan(makeManifest({ lightingState: "ambient_moonlight" }));
    expect(plan.lightingTint).toBe(0x8fa9d6);
  });
});

describe("buildScenePlan — hotspots & fallback", () => {
  it("projects only visible hotspots, sorted, with their authored commands", () => {
    const m = makeManifest();
    m.hotspots.push({
      hotspotId: "ruined_shrine_hotspot_hidden",
      entityId: "x",
      label: "Hidden",
      command: "take x",
      region: { x: 0, y: 0, w: 10, h: 10 },
      visible: false,
    });
    const plan = buildScenePlan(m);
    expect(plan.hotspots.map((h) => h.hotspotId)).toEqual([
      "ruined_shrine_hotspot_shrine_brazier",
      "ruined_shrine_hotspot_shrine_lantern",
    ]);
    const lantern = plan.hotspots.find((h) => h.entityId === "shrine_lantern");
    expect(lantern?.command).toBe("take lantern");
  });

  it("produces a text fallback projection with lighting + interact lines", () => {
    const plan = buildScenePlan(makeManifest(), { fallbackMode: true });
    expect(plan.mode).toBe("fallback");
    expect(plan.fallbackLines.some((l) => l.startsWith("Lighting:"))).toBe(true);
    expect(plan.fallbackLines.some((l) => l.includes("Brass Lantern"))).toBe(true);
    expect(plan.fallbackLines.some((l) => l.startsWith("Interact:"))).toBe(true);
  });

  it("fallback mode changes the planHash vs illustrated mode", () => {
    const m = makeManifest();
    expect(buildScenePlan(m).planHash).not.toBe(buildScenePlan(m, { fallbackMode: true }).planHash);
  });
});

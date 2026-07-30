/**
 * buildSealedPacket.test.ts — Defold Bridge Design §"Testing / scene-packet"
 *
 * Covers:
 *   - Determinism: same manifest + sequence → same sealed packet.
 *   - Mode independence: the packet has no mode field.
 *   - Float quantization: all fractional values become milli-integers.
 *   - Null projection: null assetKey/label become "".
 *   - Sort order: sprites by zIndex/layerId, hotspots by hotspotId.
 *   - Seal format: plan1: + 64 hex chars.
 */

import { describe, it, expect } from "vitest";
import type { SceneManifest, SceneLayer } from "@polaris/contracts";
import { buildSealedPacket } from "../src/buildSealedPacket.js";

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
      layer({ layerId: "bg", layerType: "background", zIndex: 0 }),
      layer({
        layerId: "lantern",
        layerType: "entity",
        assetKey: "entities/lantern",
        position: { x: 320.5, y: 240.25 },
        flags: { displayName: "Brass Lantern" },
      }),
      layer({
        layerId: "brazier",
        layerType: "prop",
        assetKey: null,  // null assetKey → "" on wire
        position: { x: 400, y: 280 },
      }),
    ],
    hotspots: [
      {
        hotspotId: "hs_brazier",
        entityId: "shrine_brazier",
        label: "Iron Brazier",
        command: "light brazier",
        region: { x: 352.5, y: 232.5, w: 96, h: 96 },
        visible: true,
      },
      {
        hotspotId: "hs_lantern",
        entityId: "shrine_lantern",
        label: "Brass Lantern",
        command: "take lantern",
        region: { x: 272, y: 192, w: 96, h: 96 },
        visible: true,
      },
    ],
    textRegions: [
      { regionId: "title", kind: "title", anchor: { x: 24, y: 24 }, width: 640, text: "The Ruined Shrine" },
    ],
    lightingState: "ambient_moonlight",
    ambientEffects: ["dust_motes", "fog"],
    contractHash: "abc123def456",
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildSealedPacket", () => {
  it("produces a valid plan1: seal", () => {
    const packet = buildSealedPacket(makeManifest(), { sequence: 1 });
    expect(packet.seal).toMatch(/^plan1:[0-9a-f]{64}$/);
  });

  it("is deterministic: same manifest + sequence → same packet", () => {
    const a = buildSealedPacket(makeManifest(), { sequence: 1 });
    const b = buildSealedPacket(makeManifest(), { sequence: 1 });
    expect(a).toEqual(b);
  });

  it("packet has no mode field (mode is in the claim, not the packet)", () => {
    const packet = buildSealedPacket(makeManifest(), { sequence: 1 });
    expect("mode" in packet).toBe(false);
  });

  it("quantizes fractional positions to milli-integers", () => {
    const packet = buildSealedPacket(makeManifest(), { sequence: 1 });
    const lantern = packet.sprites.find((s) => s.layerId === "lantern")!;
    expect(lantern.xMilli).toBe(320500);
    expect(lantern.yMilli).toBe(240250);
    expect(Number.isInteger(lantern.xMilli)).toBe(true);
    expect(Number.isInteger(lantern.yMilli)).toBe(true);
  });

  it("quantizes lightingAlpha to milli-integers", () => {
    const packet = buildSealedPacket(makeManifest(), { sequence: 1 });
    expect(packet.lightingAlphaMilli).toBe(160); // 0.16 * 1000
    expect(Number.isInteger(packet.lightingAlphaMilli)).toBe(true);
  });

  it("projects null assetKey as empty string (Lua safety)", () => {
    const packet = buildSealedPacket(makeManifest(), { sequence: 1 });
    const brazier = packet.sprites.find((s) => s.layerId === "brazier")!;
    expect(brazier.assetKey).toBe("");
  });

  it("projects null label as empty string (Lua safety)", () => {
    const packet = buildSealedPacket(makeManifest(), { sequence: 1 });
    const brazier = packet.sprites.find((s) => s.layerId === "brazier")!;
    expect(brazier.label).toBe("");
  });

  it("sorts sprites by zIndex asc then layerId", () => {
    const packet = buildSealedPacket(makeManifest(), { sequence: 1 });
    const ids = packet.sprites.map((s) => s.layerId);
    // Both have zIndex 10, so sorted by layerId: "brazier" < "lantern"
    expect(ids).toEqual(["brazier", "lantern"]);
  });

  it("sorts hotspots by hotspotId", () => {
    const packet = buildSealedPacket(makeManifest(), { sequence: 1 });
    const ids = packet.hotspots.map((h) => h.hotspotId);
    expect(ids).toEqual(["hs_brazier", "hs_lantern"]);
  });

  it("sorts ambientEffects alphabetically", () => {
    const packet = buildSealedPacket(makeManifest(), { sequence: 1 });
    expect(packet.ambientEffects).toEqual(["dust_motes", "fog"]);
  });

  it("excludes background layers from sprites", () => {
    const packet = buildSealedPacket(makeManifest(), { sequence: 1 });
    expect(packet.sprites.find((s) => s.layerId === "bg")).toBeUndefined();
  });

  it("excludes hidden layers from sprites", () => {
    const manifest = makeManifest({
      layers: [
        layer({ layerId: "visible", layerType: "entity", visible: true }),
        layer({ layerId: "hidden", layerType: "entity", visible: false }),
      ],
    });
    const packet = buildSealedPacket(manifest, { sequence: 1 });
    expect(packet.sprites.map((s) => s.layerId)).toEqual(["visible"]);
  });

  it("quantizes hotspot region to milli-integers", () => {
    const packet = buildSealedPacket(makeManifest(), { sequence: 1 });
    const hs = packet.hotspots.find((h) => h.hotspotId === "hs_brazier")!;
    expect(hs.xMilli).toBe(352500);
    expect(hs.yMilli).toBe(232500);
    expect(hs.wMilli).toBe(96000);
    expect(hs.hMilli).toBe(96000);
  });

  it("includes fallbackLines", () => {
    const packet = buildSealedPacket(makeManifest(), { sequence: 1 });
    expect(packet.fallbackLines).toContain("The Ruined Shrine");
  });

  it("sequence is carried on the packet but does not affect the seal", () => {
    const a = buildSealedPacket(makeManifest(), { sequence: 1 });
    const b = buildSealedPacket(makeManifest(), { sequence: 42 });
    expect(a.seal).toBe(b.seal);
    expect(a.sequence).toBe(1);
    expect(b.sequence).toBe(42);
  });
});

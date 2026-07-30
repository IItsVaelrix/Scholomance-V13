/**
 * wire.test.ts — Defold Bridge Design §"Testing / defold-bridge"
 *
 * Covers:
 *   - Projection emits no nulls and no ambiguous empty tables.
 *   - Round-trip through json.decode semantics preserves list-ness.
 *   - Explicit counts match array lengths.
 *   - Determinism: same packet → same wire JSON.
 */

import { describe, it, expect } from "vitest";
import type { SealedScenePacket } from "@polaris/scene-packet";
import { toLuaWire, serializeWirePacket, assertNoNulls } from "../src/wire.js";

function makePacket(overrides: Partial<SealedScenePacket> = {}): SealedScenePacket {
  return {
    packetVersion: 1,
    sceneId: "ruined_shrine_rev0",
    roomId: "ruined_shrine",
    worldId: "codex_vale_mvp",
    roomRevision: 0,
    visualRevision: 0,
    contractHash: "abc123",
    width: 800,
    height: 480,
    backgroundAssetKey: "rooms/ruined_shrine/background",
    backgroundGlyph: { shape: "rect", color: 0x10142a, width: 800, height: 480, alphaMilli: 1000 },
    lightingState: "ambient_moonlight",
    lightingTint: 0x8fa9d6,
    lightingAlphaMilli: 160,
    ambientEffects: ["dust_motes"],
    sprites: [
      {
        layerId: "lantern",
        layerType: "entity",
        assetKey: "entities/lantern",
        xMilli: 320000,
        yMilli: 240000,
        zIndex: 10,
        visible: true,
        glyph: { shape: "diamond", color: 0xe6c15a, width: 34, height: 46, alphaMilli: 1000 },
        label: "Brass Lantern",
      },
      {
        layerId: "brazier",
        layerType: "prop",
        assetKey: "",  // null projected as ""
        xMilli: 400000,
        yMilli: 280000,
        zIndex: 10,
        visible: true,
        glyph: { shape: "flame", color: 0x6b6f7a, width: 72, height: 88, alphaMilli: 1000 },
        label: "",  // null projected as ""
      },
    ],
    hotspots: [
      {
        hotspotId: "hs_lantern",
        entityId: "shrine_lantern",
        label: "Brass Lantern",
        command: "take lantern",
        xMilli: 272000,
        yMilli: 192000,
        wMilli: 96000,
        hMilli: 96000,
      },
    ],
    textRegions: [
      { regionId: "title", kind: "title", xMilli: 24000, yMilli: 24000, widthMilli: 640000, text: "The Ruined Shrine" },
    ],
    fallbackLines: ["The Ruined Shrine", "Stone walls lean…"],
    sequence: 1,
    seal: "plan1:" + "a".repeat(64),
    ...overrides,
  };
}

describe("toLuaWire", () => {
  it("emits no null values anywhere in the wire object", () => {
    const wire = toLuaWire(makePacket());
    expect(() => assertNoNulls(wire)).not.toThrow();
  });

  it("emits no nulls even with empty arrays", () => {
    const wire = toLuaWire(makePacket({
      sprites: [],
      hotspots: [],
      textRegions: [],
      ambientEffects: [],
      fallbackLines: [],
    }));
    expect(() => assertNoNulls(wire)).not.toThrow();
  });

  it("carries explicit counts matching array lengths", () => {
    const wire = toLuaWire(makePacket());
    expect(wire.spriteCount).toBe(wire.sprites.length);
    expect(wire.hotspotCount).toBe(wire.hotspots.length);
    expect(wire.textRegionCount).toBe(wire.textRegions.length);
    expect(wire.ambientEffectCount).toBe(wire.ambientEffects.length);
    expect(wire.fallbackLineCount).toBe(wire.fallbackLines.length);
  });

  it("flattens glyph spec into scalar fields (no nested objects)", () => {
    const wire = toLuaWire(makePacket());
    const sprite = wire.sprites[0];
    expect(sprite.glyphShape).toBe("diamond");
    expect(sprite.glyphColor).toBe(0xe6c15a);
    expect(sprite.glyphWidth).toBe(34);
    expect(sprite.glyphHeight).toBe(46);
    expect(sprite.glyphAlphaMilli).toBe(1000);
    // No nested glyph object
    expect("glyph" in sprite).toBe(false);
  });

  it("flattens backgroundGlyph into scalar fields", () => {
    const wire = toLuaWire(makePacket());
    expect(wire.backgroundGlyphShape).toBe("rect");
    expect(wire.backgroundGlyphColor).toBe(0x10142a);
    expect("backgroundGlyph" in wire).toBe(false);
  });

  it("is deterministic: same packet → same wire object", () => {
    const a = toLuaWire(makePacket());
    const b = toLuaWire(makePacket());
    expect(a).toEqual(b);
  });
});

describe("serializeWirePacket", () => {
  it("produces valid JSON", () => {
    const json = serializeWirePacket(makePacket());
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("is deterministic: same packet → same JSON string", () => {
    const a = serializeWirePacket(makePacket());
    const b = serializeWirePacket(makePacket());
    expect(a).toBe(b);
  });

  it("JSON round-trip preserves all fields (simulates json.decode)", () => {
    const packet = makePacket();
    const json = serializeWirePacket(packet);
    const decoded = JSON.parse(json);
    expect(decoded.seal).toBe(packet.seal);
    expect(decoded.roomRevision).toBe(packet.roomRevision);
    expect(decoded.spriteCount).toBe(2);
    expect(decoded.sprites[0].layerId).toBe("lantern");
    expect(decoded.sprites[1].assetKey).toBe("");  // null → ""
  });

  it("empty arrays survive JSON round-trip as arrays (Lua list-ness)", () => {
    const packet = makePacket({ sprites: [], hotspots: [] });
    const json = serializeWirePacket(packet);
    const decoded = JSON.parse(json);
    expect(Array.isArray(decoded.sprites)).toBe(true);
    expect(Array.isArray(decoded.hotspots)).toBe(true);
    expect(decoded.spriteCount).toBe(0);
    expect(decoded.hotspotCount).toBe(0);
  });
});

describe("assertNoNulls", () => {
  it("throws on null at any depth", () => {
    expect(() => assertNoNulls({ a: { b: null } })).toThrow(/Null found/);
    expect(() => assertNoNulls([1, null, 3])).toThrow(/Null found/);
    expect(() => assertNoNulls(null)).toThrow(/Null found/);
  });

  it("passes for null-free structures", () => {
    expect(() => assertNoNulls({ a: 1, b: "x", c: [1, 2], d: { e: true } })).not.toThrow();
    expect(() => assertNoNulls([])).not.toThrow();
    expect(() => assertNoNulls("")).not.toThrow();
  });
});

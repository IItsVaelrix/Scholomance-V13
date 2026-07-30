/**
 * wire — SealedScenePacket → Lua-safe JSON projection.
 *
 * Defold Bridge Design §"Components / defold-bridge":
 *   The wire projection is not a no-op. Defold's json.decode renders [] and {}
 *   as the same empty table, and SceneLayer.assetKey is z.string().nullable() —
 *   nulls exist in real data. The projection therefore emits NO NULLS and
 *   carries explicit counts wherever Lua must know a list is a list.
 *
 * This module is pure TypeScript. It produces a plain object that
 * JSON.stringify renders into the exact bytes Defold's json.decode will parse.
 */

import type { SealedScenePacket } from "@polaris/scene-packet";

/**
 * Lua-safe wire representation of a SealedScenePacket.
 *
 * Invariants:
 *   - No null values anywhere. Nullable strings become "".
 *   - Every array field carries an explicit `*Count` sibling so Lua can
 *     distinguish an empty list from an absent field.
 *   - All numeric fields are safe integers (milli-quantized upstream).
 *   - No nested objects with ambiguous empty-table semantics.
 */
export interface LuaWirePacket {
  packetVersion: number;
  sceneId: string;
  roomId: string;
  worldId: string;
  roomRevision: number;
  visualRevision: number;
  contractHash: string;
  width: number;
  height: number;
  backgroundAssetKey: string;
  backgroundGlyphShape: string;
  backgroundGlyphColor: number;
  backgroundGlyphWidth: number;
  backgroundGlyphHeight: number;
  backgroundGlyphAlphaMilli: number;
  lightingState: string;
  lightingTint: number;
  lightingAlphaMilli: number;
  ambientEffectCount: number;
  ambientEffects: string[];
  spriteCount: number;
  sprites: LuaWireSprite[];
  hotspotCount: number;
  hotspots: LuaWireHotspot[];
  textRegionCount: number;
  textRegions: LuaWireText[];
  fallbackLineCount: number;
  fallbackLines: string[];
  sequence: number;
  seal: string;
}

export interface LuaWireSprite {
  layerId: string;
  layerType: string;
  assetKey: string;
  xMilli: number;
  yMilli: number;
  zIndex: number;
  glyphShape: string;
  glyphColor: number;
  glyphWidth: number;
  glyphHeight: number;
  glyphAlphaMilli: number;
  label: string;
}

export interface LuaWireHotspot {
  hotspotId: string;
  entityId: string;
  label: string;
  command: string;
  xMilli: number;
  yMilli: number;
  wMilli: number;
  hMilli: number;
}

export interface LuaWireText {
  regionId: string;
  kind: string;
  xMilli: number;
  yMilli: number;
  widthMilli: number;
  text: string;
}

/**
 * Project a SealedScenePacket into its Lua-safe wire form.
 *
 * Pure and deterministic: same packet → same wire object, always.
 * The result is ready for JSON.stringify → WebSocket text frame.
 */
export function toLuaWire(packet: SealedScenePacket): LuaWirePacket {
  return {
    packetVersion: packet.packetVersion,
    sceneId: packet.sceneId,
    roomId: packet.roomId,
    worldId: packet.worldId,
    roomRevision: packet.roomRevision,
    visualRevision: packet.visualRevision,
    contractHash: packet.contractHash,
    width: packet.width,
    height: packet.height,
    backgroundAssetKey: packet.backgroundAssetKey,
    backgroundGlyphShape: packet.backgroundGlyph.shape,
    backgroundGlyphColor: packet.backgroundGlyph.color,
    backgroundGlyphWidth: packet.backgroundGlyph.width,
    backgroundGlyphHeight: packet.backgroundGlyph.height,
    backgroundGlyphAlphaMilli: packet.backgroundGlyph.alphaMilli,
    lightingState: packet.lightingState,
    lightingTint: packet.lightingTint,
    lightingAlphaMilli: packet.lightingAlphaMilli,
    ambientEffectCount: packet.ambientEffects.length,
    ambientEffects: packet.ambientEffects,
    spriteCount: packet.sprites.length,
    sprites: packet.sprites.map((s) => ({
      layerId: s.layerId,
      layerType: s.layerType,
      assetKey: s.assetKey,
      xMilli: s.xMilli,
      yMilli: s.yMilli,
      zIndex: s.zIndex,
      glyphShape: s.glyph.shape,
      glyphColor: s.glyph.color,
      glyphWidth: s.glyph.width,
      glyphHeight: s.glyph.height,
      glyphAlphaMilli: s.glyph.alphaMilli,
      label: s.label,
    })),
    hotspotCount: packet.hotspots.length,
    hotspots: packet.hotspots.map((h) => ({
      hotspotId: h.hotspotId,
      entityId: h.entityId,
      label: h.label,
      command: h.command,
      xMilli: h.xMilli,
      yMilli: h.yMilli,
      wMilli: h.wMilli,
      hMilli: h.hMilli,
    })),
    textRegionCount: packet.textRegions.length,
    textRegions: packet.textRegions.map((t) => ({
      regionId: t.regionId,
      kind: t.kind,
      xMilli: t.xMilli,
      yMilli: t.yMilli,
      widthMilli: t.widthMilli,
      text: t.text,
    })),
    fallbackLineCount: packet.fallbackLines.length,
    fallbackLines: packet.fallbackLines,
    sequence: packet.sequence,
    seal: packet.seal,
  };
}

/**
 * Serialize a SealedScenePacket to the exact JSON string that goes on the wire.
 * Deterministic: JSON.stringify with sorted keys is not needed here because
 * the wire object has a fixed field order and no ambiguous types.
 */
export function serializeWirePacket(packet: SealedScenePacket): string {
  return JSON.stringify(toLuaWire(packet));
}

/**
 * Validate that a wire object contains no null values.
 * Used in tests to prove the Lua-safety invariant.
 */
export function assertNoNulls(value: unknown, path = "$"): void {
  if (value === null) {
    throw new Error(`Null found at ${path} — Lua json.decode cannot distinguish null from absent`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoNulls(item, `${path}[${i}]`));
  } else if (typeof value === "object" && value !== null) {
    for (const [key, val] of Object.entries(value)) {
      assertNoNulls(val, `${path}.${key}`);
    }
  }
}

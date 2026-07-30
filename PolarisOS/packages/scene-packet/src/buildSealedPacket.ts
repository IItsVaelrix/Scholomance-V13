/**
 * buildSealedPacket — SceneManifest → SealedScenePacket.
 *
 * Hoisted from scenePlan.ts (renderer-pixi), minus `mode`. The seal producer
 * is the server; this is the only place a seal is ever computed.
 *
 * Guarantees:
 *   - Pure: same manifest + same sequence → same sealed packet, always.
 *   - All floats quantized to milli-units before sealing.
 *   - Null assetKey/label projected as "" (Lua json.decode safety).
 *   - Sprites sorted zIndex asc then layerId; hotspots by hotspotId;
 *     textRegions by regionId; ambientEffects sorted.
 *   - `mode` is NOT in the packet. One packet describes both modes.
 */

import type { SceneManifest, SceneLayer, SceneLayerType } from "@polaris/contracts";
import { computePlanSeal, alphaToMilli, toMilli } from "./seal.js";
import type {
  SealedScenePacket,
  GlyphSpec,
  PlanSprite,
  PlanHotspot,
  PlanText,
} from "./contracts.js";

// --- Logical canvas (matches scenePlan.ts) ----------------------------------

export const SCENE_WIDTH = 800;
export const SCENE_HEIGHT = 480;

// --- Lighting table (matches scenePlan.ts) ----------------------------------

const LIGHTING: Record<string, { tint: number; alpha: number; background: number }> = {
  warm_firelight: { tint: 0xffb066, alpha: 0.28, background: 0x2a1c10 },
  ambient_moonlight: { tint: 0x8fa9d6, alpha: 0.16, background: 0x10142a },
};
const DEFAULT_LIGHTING = LIGHTING.ambient_moonlight;

// --- Glyph tables (matches scenePlan.ts) ------------------------------------

type GlyphShape = GlyphSpec["shape"];

const GLYPH_BY_ASSET: Record<string, Omit<GlyphSpec, "alphaMilli"> & { alpha: number }> = {
  "entities/brazier":      { shape: "flame",   color: 0x6b6f7a, width: 72,  height: 88,  alpha: 1 },
  "entities/brazier_lit":  { shape: "flame",   color: 0xff8c2e, width: 80,  height: 104, alpha: 1 },
  "entities/lantern":      { shape: "diamond", color: 0xe6c15a, width: 34,  height: 46,  alpha: 1 },
  "entities/altar":        { shape: "rect",    color: 0x5a5f6e, width: 120, height: 64,  alpha: 1 },
  "entities/well":         { shape: "circle",  color: 0x4a5f6e, width: 84,  height: 84,  alpha: 1 },
  "entities/sign":         { shape: "rect",    color: 0x7a5a3a, width: 64,  height: 40,  alpha: 1 },
  "players/marker_default":{ shape: "marker",  color: 0x8fd694, width: 28,  height: 28,  alpha: 1 },
};

const GLYPH_BY_TYPE: Record<SceneLayerType, Omit<GlyphSpec, "alphaMilli"> & { alpha: number }> = {
  background:      { shape: "rect",    color: 0x10142a, width: SCENE_WIDTH,  height: SCENE_HEIGHT, alpha: 1 },
  entity:          { shape: "diamond", color: 0xc9a96e, width: 40,  height: 40,  alpha: 1 },
  prop:            { shape: "rect",    color: 0x8a8f9e, width: 64,  height: 64,  alpha: 1 },
  lighting:        { shape: "overlay", color: 0xffb066, width: SCENE_WIDTH,  height: SCENE_HEIGHT, alpha: 0.25 },
  effect:          { shape: "circle",  color: 0xaab4c8, width: 12,  height: 12,  alpha: 0.6 },
  hotspot:         { shape: "rect",    color: 0x9fd0e0, width: 48,  height: 48,  alpha: 0.4 },
  "player-marker": { shape: "marker",  color: 0x8fd694, width: 28,  height: 28,  alpha: 1 },
};

function toGlyphSpec(raw: Omit<GlyphSpec, "alphaMilli"> & { alpha: number }): GlyphSpec {
  return { shape: raw.shape, color: raw.color, width: raw.width, height: raw.height, alphaMilli: alphaToMilli(raw.alpha) };
}

function glyphFor(layer: SceneLayer): GlyphSpec {
  if (layer.layerType === "lighting") {
    const lit = LIGHTING[layer.assetKey?.includes("lit") ? "warm_firelight" : "ambient_moonlight"];
    return toGlyphSpec({ ...GLYPH_BY_TYPE.lighting, color: lit.tint });
  }
  if (layer.assetKey && GLYPH_BY_ASSET[layer.assetKey]) {
    return toGlyphSpec(GLYPH_BY_ASSET[layer.assetKey]);
  }
  return toGlyphSpec(GLYPH_BY_TYPE[layer.layerType] ?? GLYPH_BY_TYPE.prop);
}

function labelOf(layer: SceneLayer): string {
  const name = layer.flags?.displayName;
  return typeof name === "string" && name.length > 0 ? name : "";
}

// --- Fallback lines (matches scenePlan.ts buildFallbackLines) ---------------

function buildFallbackLines(
  manifest: SceneManifest,
  sprites: PlanSprite[],
  hotspots: PlanHotspot[],
): string[] {
  const lines: string[] = [];
  const title = manifest.textRegions.find((t) => t.kind === "title");
  if (title) lines.push(title.text);
  const desc = manifest.textRegions.find((t) => t.kind === "description");
  if (desc) lines.push(desc.text);
  for (const sprite of sprites) {
    if (sprite.label) lines.push(`[ ${sprite.label} ]`);
  }
  for (const hotspot of hotspots) {
    lines.push(`> ${hotspot.label} (${hotspot.command})`);
  }
  return lines;
}

// --- Packet builder ---------------------------------------------------------

export interface BuildSealedPacketOptions {
  /** Per-connection delivery sequence number. Excluded from the seal. */
  sequence: number;
}

/**
 * Project a SceneManifest into a SealedScenePacket.
 *
 * Pure: identical manifest + sequence → identical packet + seal, always.
 * This is the ONLY place a plan1: seal is ever computed.
 */
export function buildSealedPacket(
  manifest: SceneManifest,
  options: BuildSealedPacketOptions,
): SealedScenePacket {
  const lighting = LIGHTING[manifest.lightingState] ?? DEFAULT_LIGHTING;

  const sprites: PlanSprite[] = manifest.layers
    .filter((l) => l.visible && l.layerType !== "background")
    .map((l) => ({
      layerId: l.layerId,
      layerType: l.layerType,
      assetKey: l.assetKey ?? "",
      xMilli: toMilli(l.position.x),
      yMilli: toMilli(l.position.y),
      zIndex: l.zIndex,
      visible: true as const,
      glyph: glyphFor(l),
      label: labelOf(l),
    }))
    .sort((a, b) => (a.zIndex - b.zIndex) || a.layerId.localeCompare(b.layerId));

  const hotspots: PlanHotspot[] = manifest.hotspots
    .filter((h) => h.visible)
    .map((h) => ({
      hotspotId: h.hotspotId,
      entityId: h.entityId,
      label: h.label,
      command: h.command,
      xMilli: toMilli(h.region.x),
      yMilli: toMilli(h.region.y),
      wMilli: toMilli(h.region.w),
      hMilli: toMilli(h.region.h),
    }))
    .sort((a, b) => a.hotspotId.localeCompare(b.hotspotId));

  const textRegions: PlanText[] = manifest.textRegions
    .map((t) => ({
      regionId: t.regionId,
      kind: t.kind,
      xMilli: toMilli(t.anchor.x),
      yMilli: toMilli(t.anchor.y),
      widthMilli: toMilli(t.width),
      text: t.text,
    }))
    .sort((a, b) => a.regionId.localeCompare(b.regionId));

  const backgroundGlyph: GlyphSpec = {
    shape: "rect",
    color: lighting.background,
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    alphaMilli: 1000,
  };

  const fallbackLines = buildFallbackLines(manifest, sprites, hotspots);

  const unsigned: Omit<SealedScenePacket, "seal"> = {
    packetVersion: 1,
    sceneId: manifest.sceneId,
    roomId: manifest.roomId,
    worldId: manifest.worldId,
    roomRevision: manifest.roomRevision,
    visualRevision: manifest.visualRevision,
    contractHash: manifest.contractHash,
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    backgroundAssetKey: manifest.backgroundAssetKey,
    backgroundGlyph,
    lightingState: manifest.lightingState,
    lightingTint: lighting.tint,
    lightingAlphaMilli: alphaToMilli(lighting.alpha),
    ambientEffects: [...manifest.ambientEffects].sort(),
    sprites,
    hotspots,
    textRegions,
    fallbackLines,
    sequence: options.sequence,
  };

  return { ...unsigned, seal: computePlanSeal(unsigned) };
}

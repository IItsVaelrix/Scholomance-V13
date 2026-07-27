/**
 * scenePlan — deterministic SceneManifest → SceneRenderPlan projection.
 *
 * Milestone 5 (PDR §25, §5.3, §5.4). This is the pure, browser-safe heart of
 * the illustrated client. It turns an authoritative SceneManifest into an
 * ordered list of draw instructions (a "plan") that a renderer can execute.
 *
 * Why a separate pure module?
 *   - "The world produces the picture." The manifest is the single source of
 *     visual truth; the plan is a deterministic projection of it. Two clients
 *     handed the same manifest MUST derive the same plan (§15.4 parity).
 *   - PixiJS needs WebGL + DOM and cannot run under the node test runner. By
 *     isolating all projection logic here (no PixiJS, no DOM, no node:crypto),
 *     the visual contract stays fully unit-testable in a plain node env.
 *
 * Guarantees:
 *   - buildScenePlan is a pure function: same manifest → same plan, always.
 *   - Sprite ordering is total and stable (zIndex, then layerId) so rendering
 *     never depends on input array order.
 *   - planHash folds every visually-meaningful field; generatedAt is excluded
 *     (it is the manifest's only non-deterministic field).
 */

import type { SceneManifest, SceneLayer, SceneLayerType } from "@polaris/contracts";

// --- Logical canvas the plan is laid out against ---------------------------

export const SCENE_WIDTH = 800;
export const SCENE_HEIGHT = 480;

// --- Procedural glyph palette ----------------------------------------------
//
// The MVP ships without binary art assets (worldpacks/.../assets is empty).
// PDR §5.4 requires the world to stay playable when an asset fails to load,
// so every layer carries a procedural glyph spec: a vector stand-in the
// renderer draws when the texture for `assetKey` is unavailable. This keeps
// the scene illustrated (not blank) while remaining a pure projection of state.

export type GlyphShape = "rect" | "circle" | "diamond" | "flame" | "marker" | "overlay";

export interface GlyphSpec {
  shape: GlyphShape;
  /** 24-bit RGB, e.g. 0xc9a96e. */
  color: number;
  width: number;
  height: number;
  alpha: number;
}

export interface PlanSprite {
  layerId: string;
  layerType: SceneLayerType;
  assetKey: string | null;
  x: number;
  y: number;
  zIndex: number;
  visible: true;
  /** Procedural stand-in used when the texture for assetKey cannot be loaded. */
  glyph: GlyphSpec;
  /** Display label lifted from layer flags, when authored. */
  label: string | null;
}

export interface PlanHotspot {
  hotspotId: string;
  entityId: string;
  label: string;
  command: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlanText {
  regionId: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  text: string;
}

export interface SceneRenderPlan {
  sceneId: string;
  roomId: string;
  roomRevision: number;
  visualRevision: number;
  contractHash: string;
  /** "illustrated" (PixiJS) or "fallback" (accessible text only). */
  mode: "illustrated" | "fallback";
  width: number;
  height: number;
  backgroundAssetKey: string;
  backgroundGlyph: GlyphSpec;
  lightingState: string;
  /** Full-canvas tint applied for the current lighting state. */
  lightingTint: number;
  lightingAlpha: number;
  ambientEffects: string[];
  /** Visible sprites in deterministic draw order (zIndex asc, then layerId). */
  sprites: PlanSprite[];
  /** Visible interactable hotspots, sorted by hotspotId. */
  hotspots: PlanHotspot[];
  textRegions: PlanText[];
  /** Accessible text projection of the scene (PDR §16.3 fallback mode). */
  fallbackLines: string[];
  /** Deterministic hash of the plan itself (client-side projection check). */
  planHash: string;
}

// --- Lighting ---------------------------------------------------------------

const LIGHTING: Record<string, { tint: number; alpha: number; background: number }> = {
  warm_firelight: { tint: 0xffb066, alpha: 0.28, background: 0x2a1c10 },
  ambient_moonlight: { tint: 0x8fa9d6, alpha: 0.16, background: 0x10142a },
};
const DEFAULT_LIGHTING = LIGHTING.ambient_moonlight;

// --- Procedural glyph resolution -------------------------------------------

const GLYPH_BY_ASSET: Record<string, GlyphSpec> = {
  "entities/brazier": { shape: "flame", color: 0x6b6f7a, width: 72, height: 88, alpha: 1 },
  "entities/brazier_lit": { shape: "flame", color: 0xff8c2e, width: 80, height: 104, alpha: 1 },
  "entities/lantern": { shape: "diamond", color: 0xe6c15a, width: 34, height: 46, alpha: 1 },
  "entities/altar": { shape: "rect", color: 0x5a5f6e, width: 120, height: 64, alpha: 1 },
  "entities/well": { shape: "circle", color: 0x4a5f6e, width: 84, height: 84, alpha: 1 },
  "entities/sign": { shape: "rect", color: 0x7a5a3a, width: 64, height: 40, alpha: 1 },
  "players/marker_default": { shape: "marker", color: 0x8fd694, width: 28, height: 28, alpha: 1 },
};

const GLYPH_BY_TYPE: Record<SceneLayerType, GlyphSpec> = {
  background: { shape: "rect", color: 0x10142a, width: SCENE_WIDTH, height: SCENE_HEIGHT, alpha: 1 },
  entity: { shape: "diamond", color: 0xc9a96e, width: 40, height: 40, alpha: 1 },
  prop: { shape: "rect", color: 0x8a8f9e, width: 64, height: 64, alpha: 1 },
  lighting: { shape: "overlay", color: 0xffb066, width: SCENE_WIDTH, height: SCENE_HEIGHT, alpha: 0.25 },
  effect: { shape: "circle", color: 0xaab4c8, width: 12, height: 12, alpha: 0.6 },
  hotspot: { shape: "rect", color: 0x9fd0e0, width: 48, height: 48, alpha: 0.4 },
  "player-marker": { shape: "marker", color: 0x8fd694, width: 28, height: 28, alpha: 1 },
};

function glyphFor(layer: SceneLayer): GlyphSpec {
  if (layer.layerType === "lighting") {
    // A lighting layer adopts the active lighting tint.
    const lit = LIGHTING[layer.assetKey?.includes("lit") ? "warm_firelight" : "ambient_moonlight"];
    return { ...GLYPH_BY_TYPE.lighting, color: lit.tint };
  }
  if (layer.assetKey && GLYPH_BY_ASSET[layer.assetKey]) {
    return GLYPH_BY_ASSET[layer.assetKey];
  }
  return GLYPH_BY_TYPE[layer.layerType] ?? GLYPH_BY_TYPE.prop;
}

function labelOf(layer: SceneLayer): string | null {
  const name = layer.flags?.displayName;
  return typeof name === "string" && name.length > 0 ? name : null;
}

// --- Deterministic hashing (browser-safe, no node:crypto) -------------------

/** FNV-1a 32-bit, rendered as 8 hex chars. Pure and platform-independent. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// --- Plan construction ------------------------------------------------------

export interface BuildPlanOptions {
  /** Force text-only projection regardless of manifest content. */
  fallbackMode?: boolean;
}

/**
 * Project a SceneManifest into a deterministic SceneRenderPlan.
 *
 * Pure: identical manifests always yield identical plans (and planHash).
 */
export function buildScenePlan(manifest: SceneManifest, options: BuildPlanOptions = {}): SceneRenderPlan {
  const lighting = LIGHTING[manifest.lightingState] ?? DEFAULT_LIGHTING;

  // Visible, non-background layers in total deterministic order.
  const sprites: PlanSprite[] = manifest.layers
    .filter((l) => l.visible && l.layerType !== "background")
    .map((l) => ({
      layerId: l.layerId,
      layerType: l.layerType,
      assetKey: l.assetKey,
      x: l.position.x,
      y: l.position.y,
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
      x: h.region.x,
      y: h.region.y,
      w: h.region.w,
      h: h.region.h,
    }))
    .sort((a, b) => a.hotspotId.localeCompare(b.hotspotId));

  const textRegions: PlanText[] = manifest.textRegions
    .map((t) => ({
      regionId: t.regionId,
      kind: t.kind,
      x: t.anchor.x,
      y: t.anchor.y,
      width: t.width,
      text: t.text,
    }))
    .sort((a, b) => a.regionId.localeCompare(b.regionId));

  const backgroundGlyph: GlyphSpec = {
    shape: "rect",
    color: lighting.background,
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    alpha: 1,
  };

  const fallbackLines = buildFallbackLines(manifest, sprites, hotspots);

  const mode: SceneRenderPlan["mode"] = options.fallbackMode ? "fallback" : "illustrated";

  const plan: Omit<SceneRenderPlan, "planHash"> = {
    sceneId: manifest.sceneId,
    roomId: manifest.roomId,
    roomRevision: manifest.roomRevision,
    visualRevision: manifest.visualRevision,
    contractHash: manifest.contractHash,
    mode,
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    backgroundAssetKey: manifest.backgroundAssetKey,
    backgroundGlyph,
    lightingState: manifest.lightingState,
    lightingTint: lighting.tint,
    lightingAlpha: lighting.alpha,
    ambientEffects: [...manifest.ambientEffects].sort(),
    sprites,
    hotspots,
    textRegions,
    fallbackLines,
  };

  // planHash folds every visually-meaningful field. `mode` is included so a
  // fallback projection never collides with an illustrated one.
  const hashContent = JSON.stringify({
    mode: plan.mode,
    sceneId: plan.sceneId,
    roomRevision: plan.roomRevision,
    visualRevision: plan.visualRevision,
    contractHash: plan.contractHash,
    lighting: plan.lightingState,
    sprites: plan.sprites.map((s) => ({
      id: s.layerId,
      type: s.layerType,
      asset: s.assetKey,
      x: s.x,
      y: s.y,
      z: s.zIndex,
      glyph: s.glyph.shape,
      color: s.glyph.color,
    })),
    hotspots: plan.hotspots.map((h) => ({ id: h.hotspotId, command: h.command })),
    text: plan.textRegions.map((t) => ({ id: t.regionId, text: t.text })),
    effects: plan.ambientEffects,
  });

  return { ...plan, planHash: fnv1a(hashContent) };
}

/**
 * Accessible text projection of the scene (PDR §16.3). Used both by the
 * fallback text renderer and by screen-reader output in illustrated mode.
 */
function buildFallbackLines(manifest: SceneManifest, sprites: PlanSprite[], hotspots: PlanHotspot[]): string[] {
  const lines: string[] = [];
  lines.push(`Lighting: ${manifest.lightingState.replace(/_/g, " ")}`);

  const described = sprites.filter((s) => s.layerType !== "lighting" && s.layerType !== "effect");
  if (described.length === 0) {
    lines.push("The scene is quiet.");
  } else {
    for (const s of described) {
      const name = s.label ?? s.assetKey ?? s.layerId;
      lines.push(`[${s.layerType}] ${name}`);
    }
  }

  if (manifest.ambientEffects.length > 0) {
    lines.push(`Effects: ${[...manifest.ambientEffects].sort().join(", ")}`);
  }
  if (hotspots.length > 0) {
    lines.push(`Interact: ${hotspots.map((h) => h.label).join(", ")}`);
  }
  return lines;
}

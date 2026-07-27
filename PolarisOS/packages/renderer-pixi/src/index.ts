/**
 * @polaris/renderer-pixi
 *
 * PixiJS-based illustrated renderer (Milestone 5).
 * Consumes SceneManifests and renders layered visual scenes.
 * Browser-only adapter — never imported by kernel.
 *
 * The pure, deterministic projection (SceneManifest → SceneRenderPlan) lives in
 * scenePlan.ts and is safe to import anywhere (no PixiJS, no DOM, no node:crypto).
 */

export { PixiSceneRenderer } from "./PixiSceneRenderer.js";
export type { RendererConfig } from "./PixiSceneRenderer.js";
export {
  buildScenePlan,
  SCENE_WIDTH,
  SCENE_HEIGHT,
} from "./scenePlan.js";
export type {
  SceneRenderPlan,
  PlanSprite,
  PlanHotspot,
  PlanText,
  GlyphSpec,
  GlyphShape,
  BuildPlanOptions,
} from "./scenePlan.js";

export {
  PixelBrainAssetResolver,
  readBoundedResponseBytes,
} from "./PixelBrainAssetResolver.js";
export type {
  AssetFallback,
  AssetResolution,
  PixelBrainAssetRegistry,
  PixelBrainAssetRegistryEntry,
  PixelBrainAssetResolverOptions,
  PngDimensions,
} from "./PixelBrainAssetResolver.js";

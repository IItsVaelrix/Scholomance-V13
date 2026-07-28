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

export {
  PixiSceneRenderer,
  pixiApplicationOptions,
} from "./PixiSceneRenderer.js";
export type {
  RendererConfig,
  SceneRenderOutcome,
} from "./PixiSceneRenderer.js";
export {
  buildScenePlan,
  glyphFallbackForAssetKey,
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
  buildAtmospherePlan,
  emitterKindForEffect,
  moodForLightingState,
  computeParticleFrame,
  atmosphereUnit,
  atmosphereSeed,
  MAX_PARTICLES,
  ATMOSPHERE_WIDTH,
  ATMOSPHERE_HEIGHT,
  PARTICLE_CYCLE_SECONDS,
} from "./atmospherePlan.js";
export type {
  AtmospherePlan,
  AtmosphereMood,
  BackgroundGradient,
  GradientStop,
  VignetteSpec,
  GlowField,
  ParticleEmitter,
  EmitterKind,
  MoonbeamSpec,
  StarSpec,
  ParticleFrame,
  BuildAtmosphereOptions,
} from "./atmospherePlan.js";

export {
  PixelBrainAssetResolver,
  readBoundedResponseBytes,
} from "./PixelBrainAssetResolver.js";

export {
  DEFAULT_PIXELBRAIN_TEXTURE_CACHE_POLICY,
  PixelBrainTextureCache,
} from "./PixelBrainTextureCache.js";
export type {
  PixelBrainTextureCacheOptions,
  PixelBrainTextureCachePolicy,
  PixelBrainTextureCacheStats,
  TextureCacheInput,
  TextureLease,
  TextureResource,
} from "./PixelBrainTextureCache.js";

export {
  SceneRenderCoordinator,
} from "./SceneRenderCoordinator.js";

export {
  AtmosphereRenderer,
} from "./AtmosphereRenderer.js";
export type {
  AtmosphereLayer,
  AtmospherePixiApi,
  AtmosphereTicker,
} from "./AtmosphereRenderer.js";

export {
  computeSceneRenderHash,
  createRgbaTextureResource,
  destroyTextureResource,
  toResolvedAssetLedgerEntry,
} from "./renderIdentity.js";
export type {
  ResolvedAssetLedgerEntry,
  ResolvedAssetSource,
} from "./renderIdentity.js";
export type {
  Releasable,
  SceneRenderTransaction,
  SceneRenderTransactionStatus,
} from "./SceneRenderCoordinator.js";
export type {
  AssetFallback,
  AssetResolution,
  PixelBrainAssetRegistry,
  PixelBrainAssetRegistryEntry,
  PixelBrainAssetResolverOptions,
  PngDimensions,
} from "./PixelBrainAssetResolver.js";

/**
 * Browser-only PixiJS adapter for deterministic Polaris scene plans.
 *
 * PixelBrain owns packet-local pixels. Polaris owns placement, z-order,
 * visibility, interaction and world state. This adapter is the lifecycle shell
 * between those two contracts.
 */

import type { SceneManifest } from "@polaris/contracts";
import {
  createDiagnostic,
  type PixelBrainDiagnostic,
} from "@polaris/pixelbrain-bridge";
import {
  PixelBrainAssetResolver,
  type AssetResolution,
  type PixelBrainAssetRegistry,
  type PngDimensions,
} from "./PixelBrainAssetResolver.js";
import {
  PixelBrainTextureCache,
  type TextureLease,
} from "./PixelBrainTextureCache.js";
import {
  SceneRenderCoordinator,
  type Releasable,
} from "./SceneRenderCoordinator.js";
import {
  computeSceneRenderHash,
  createRgbaTextureResource,
  destroyTextureResource,
  toResolvedAssetLedgerEntry,
  type ResolvedAssetLedgerEntry,
} from "./renderIdentity.js";
import {
  buildScenePlan,
  type GlyphSpec,
  type PlanSprite,
  type SceneRenderPlan,
} from "./scenePlan.js";
import { buildAtmospherePlan } from "./atmospherePlan.js";
import {
  AtmosphereRenderer,
  type AtmosphereLayer,
  type AtmosphereTicker,
} from "./AtmosphereRenderer.js";

export interface RendererConfig {
  container: HTMLElement;
  /** Retained for backward compatibility; registry URLs are authoritative. */
  assetBaseUrl?: string;
  assetRegistry?: PixelBrainAssetRegistry;
  fallbackMode?: boolean;
  onCommand?: (command: string) => void;
  onDiagnostic?: (diagnostic: PixelBrainDiagnostic) => void;
  fetch?: (url: string) => Promise<Response>;
  decodePngDimensions?: (bytes: Uint8Array) => Promise<PngDimensions>;
  width?: number;
  height?: number;
  /**
   * Enable the presentation-layer atmosphere pass (glow, particles, gradient
   * backdrop, vignette). Default true. Set false to strip all atmosphere
   * ornamentation — the scene remains fully operable (design spec §3 goal 4).
   */
  atmosphere?: boolean;
  /**
   * Force reduced-motion (one static seeded frame, zero animation). When
   * undefined, honors the platform `prefers-reduced-motion` media query.
   */
  reducedMotion?: boolean;
}

export interface SceneRenderOutcome {
  status: "COMMITTED" | "STALE" | "FAILED";
  plan: SceneRenderPlan;
  renderHash: `render1:${string}` | null;
  resolvedAssets: readonly ResolvedAssetLedgerEntry[];
}

interface PixiContainer {
  addChild(child: unknown): void;
  removeChild(child: unknown): void;
  destroy(options?: Record<string, unknown>): void;
}

interface PixiApp {
  init(options: Record<string, unknown>): Promise<void>;
  stage: PixiContainer;
  canvas: HTMLCanvasElement;
  ticker?: AtmosphereTicker;
  destroy(removeCanvas?: boolean, options?: Record<string, unknown>): void;
}

interface ResolvedRecord {
  assetKey: string;
  glyph: GlyphSpec | null;
  accessibleLabel: string;
  resolution: AssetResolution;
}

interface BuiltScene {
  root: PixiContainer;
  ledger: ResolvedAssetLedgerEntry[];
  renderHash: `render1:${string}`;
  /** Presentation-layer atmosphere (null when disabled or in fallback). */
  atmosphere: AtmosphereLayer | null;
}

export function pixiApplicationOptions(
  width: number,
  height: number,
): Record<string, unknown> {
  return {
    background: "#0f0f23",
    resizeTo: undefined,
    width,
    height,
    antialias: false,
    roundPixels: true,
    preference: "webgl",
  };
}

async function decodePngRgba(
  bytes: Uint8Array,
  width: number,
  height: number,
): Promise<Uint8Array> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("createImageBitmap is unavailable");
  }
  const ownedBuffer = bytes.slice().buffer as ArrayBuffer;
  const bitmap = await createImageBitmap(
    new Blob([ownedBuffer], { type: "image/png" }),
  );
  try {
    let context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
      | null = null;
    if (typeof OffscreenCanvas === "function") {
      const canvas = new OffscreenCanvas(width, height);
      context = canvas.getContext("2d", { willReadFrequently: true });
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      context = canvas.getContext("2d", { willReadFrequently: true });
    }
    if (context === null) throw new Error("2D canvas context is unavailable");
    context.clearRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    return new Uint8Array(
      context.getImageData(0, 0, width, height).data,
    );
  } finally {
    bitmap.close();
  }
}

function releaseRoot(root: PixiContainer): Releasable {
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      root.destroy({ children: true });
    },
  };
}

/** Honor the platform reduced-motion preference; safe where matchMedia is absent. */
function detectReducedMotion(): boolean {
  try {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  } catch {
    // fall through to false
  }
  return false;
}

export class PixiSceneRenderer {
  private readonly config: RendererConfig;
  private readonly resolver: PixelBrainAssetResolver;
  private readonly coordinator = new SceneRenderCoordinator();
  private app: PixiApp | null = null;
  private pixi: typeof import("pixi.js") | null = null;
  private textureCache: PixelBrainTextureCache<unknown> | null = null;
  private fallback: boolean;
  private fallbackEl: HTMLElement | null = null;
  private lastPlan: SceneRenderPlan | null = null;
  private lastManifest: SceneManifest | null = null;
  private renderHash: `render1:${string}` | null = null;
  private ledger: readonly ResolvedAssetLedgerEntry[] = [];
  private activeRoot: PixiContainer | null = null;
  private activeResources: readonly Releasable[] = [];
  private activeAtmosphere: AtmosphereLayer | null = null;
  private atmosphereRenderer: AtmosphereRenderer | null = null;
  private readonly atmosphereEnabled: boolean;
  private readonly reducedMotion: boolean;
  private initialized = false;
  private destroyed = false;
  private initPromise: Promise<void> | null = null;

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.coordinator.invalidate();
  };

  private readonly onContextRestored = (): void => {
    this.coordinator.invalidate();
    try {
      this.textureCache?.restoreContext();
    } catch (cause) {
      this.emitDiagnostic(createDiagnostic("RASTERIZATION_FAILED", "ERROR", {
        detail: cause instanceof Error
          ? `Texture restoration failed: ${cause.message}`
          : "Texture restoration failed",
      }));
    }
    if (this.lastManifest !== null && !this.destroyed) {
      void this.renderScene(this.lastManifest);
    }
  };

  constructor(config: RendererConfig) {
    this.config = config;
    this.fallback = config.fallbackMode === true;
    this.atmosphereEnabled = config.atmosphere !== false;
    this.reducedMotion = config.reducedMotion ?? detectReducedMotion();
    this.resolver = new PixelBrainAssetResolver({
      registry: config.assetRegistry ?? {},
      ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
      ...(config.decodePngDimensions === undefined
        ? {}
        : { decodePngDimensions: config.decodePngDimensions }),
      onDiagnostic: (diagnostic) => this.emitDiagnostic(diagnostic),
    });
  }

  get isFallback(): boolean {
    return this.fallback;
  }

  get currentPlan(): SceneRenderPlan | null {
    return this.lastPlan;
  }

  get currentRenderHash(): `render1:${string}` | null {
    return this.renderHash;
  }

  get resolvedAssets(): readonly ResolvedAssetLedgerEntry[] {
    return this.ledger;
  }

  private emitDiagnostic(diagnostic: PixelBrainDiagnostic): void {
    this.config.onDiagnostic?.(diagnostic);
  }

  /**
   * Memoized init promise. renderScene/preload await this so they never observe
   * a half-initialized renderer (app/pixi still null while the Pixi import and
   * Application.init are in flight). Without this, a scene manifest that arrives
   * before init completes would take the text-fallback path, claim its contract
   * hash, and never retry — leaving the canvas blank until an unrelated mutation
   * forces a fresh render (Dual-State Art Pass: initial-render race fix).
   */
  init(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    if (this.initPromise === null) {
      this.initPromise = this.performInit();
    }
    return this.initPromise;
  }

  private async performInit(): Promise<void> {
    if (this.initialized || this.destroyed) return;
    this.initialized = true;
    if (this.fallback) {
      this.mountFallback();
      return;
    }

    try {
      const pixi = await import("pixi.js");
      const app = new pixi.Application() as unknown as PixiApp;
      await app.init(pixiApplicationOptions(
        this.config.width ?? 800,
        this.config.height ?? 480,
      ));
      app.canvas.style.width = "100%";
      app.canvas.style.height = "auto";
      app.canvas.style.display = "block";
      app.canvas.setAttribute("role", "img");
      app.canvas.setAttribute("aria-label", "Illustrated room scene");
      app.canvas.addEventListener("webglcontextlost", this.onContextLost);
      app.canvas.addEventListener(
        "webglcontextrestored",
        this.onContextRestored,
      );
      this.config.container.innerHTML = "";
      this.config.container.appendChild(app.canvas);
      this.pixi = pixi;
      this.app = app;
      this.textureCache = new PixelBrainTextureCache({
        create: (input) => createRgbaTextureResource(pixi, input),
        destroy: destroyTextureResource,
      });
      if (this.atmosphereEnabled) {
        this.atmosphereRenderer = new AtmosphereRenderer(
          pixi as unknown as ConstructorParameters<typeof AtmosphereRenderer>[0],
        );
      }
    } catch {
      this.fallback = true;
      this.app = null;
      this.pixi = null;
      this.mountFallback();
    }
  }

  private collectAssetRequests(plan: SceneRenderPlan): Array<{
    assetKey: string;
    glyph: GlyphSpec | null;
    accessibleLabel: string;
  }> {
    const requests = new Map<string, {
      assetKey: string;
      glyph: GlyphSpec | null;
      accessibleLabel: string;
    }>();
    requests.set(plan.backgroundAssetKey, {
      assetKey: plan.backgroundAssetKey,
      glyph: plan.backgroundGlyph,
      accessibleLabel: plan.roomId,
    });
    for (const sprite of plan.sprites) {
      if (sprite.assetKey === null || requests.has(sprite.assetKey)) continue;
      requests.set(sprite.assetKey, {
        assetKey: sprite.assetKey,
        glyph: sprite.glyph,
        accessibleLabel: sprite.label ?? sprite.assetKey,
      });
    }
    return [...requests.values()].sort((left, right) => (
      left.assetKey.localeCompare(right.assetKey)
    ));
  }

  private fallbackResolution(
    record: ResolvedRecord,
    diagnostics: readonly PixelBrainDiagnostic[],
  ): AssetResolution {
    return record.glyph === null
      ? {
          status: "TEXT",
          accessibleLabel: record.accessibleLabel,
          diagnostics,
        }
      : { status: "GLYPH", glyph: record.glyph, diagnostics };
  }

  private resourceFailure(
    record: ResolvedRecord,
    detail: string,
  ): void {
    const diagnostic = createDiagnostic(
      "RENDERER_RESOURCE_LIMIT_EXCEEDED",
      "WARNING",
      { detail },
    );
    this.emitDiagnostic(diagnostic);
    record.resolution = this.fallbackResolution(record, [
      ...record.resolution.diagnostics,
      diagnostic,
    ]);
  }

  private async acquireTextures(
    records: ResolvedRecord[],
  ): Promise<readonly TextureLease<unknown>[]> {
    if (this.textureCache === null) return [];
    const leases: TextureLease<unknown>[] = [];
    let proposedActiveSceneBytes = 0;

    for (const record of records) {
      let input:
        | {
            cacheKey: string;
            retainedBytes: Uint8Array;
            uploadBytes?: Uint8Array;
            width: number;
            height: number;
            proposedActiveSceneBytes: number;
          }
        | null = null;
      if (record.resolution.status === "PIXELBRAIN") {
        const raster = record.resolution.raster;
        input = {
          cacheKey: raster.rasterHash,
          retainedBytes: raster.rgba,
          width: raster.width,
          height: raster.height,
          proposedActiveSceneBytes,
        };
      } else if (record.resolution.status === "PNG") {
        try {
          const rgba = await decodePngRgba(
            record.resolution.pngBytes,
            record.resolution.width,
            record.resolution.height,
          );
          input = {
            cacheKey: record.resolution.pngRevision,
            retainedBytes: record.resolution.pngBytes,
            uploadBytes: rgba,
            width: record.resolution.width,
            height: record.resolution.height,
            proposedActiveSceneBytes,
          };
        } catch (cause) {
          this.resourceFailure(
            record,
            cause instanceof Error
              ? `PNG decode failed for ${record.assetKey}: ${cause.message}`
              : `PNG decode failed for ${record.assetKey}`,
          );
        }
      }
      if (input === null) continue;

      const lease = this.textureCache.acquire(input);
      if (lease === null) {
        this.resourceFailure(
          record,
          `Texture budget rejected ${record.assetKey}`,
        );
        continue;
      }
      leases.push(lease);
      proposedActiveSceneBytes += input.width * input.height * 4;
    }
    return leases;
  }

  async renderScene(manifest: SceneManifest): Promise<SceneRenderOutcome> {
    await this.init();
    const plan = buildScenePlan(manifest, { fallbackMode: this.fallback });

    if (this.fallback || this.app === null || this.pixi === null) {
      this.coordinator.invalidate();
      const records = this.collectAssetRequests(plan);
      const ledger = records.map(({ assetKey }) => ({
        requestedAssetKey: assetKey,
        source: "TEXT" as const,
        packetId: null,
        packetContentHash: null,
        rasterHash: null,
        pngRevision: null,
      }));
      const renderHash = computeSceneRenderHash(plan, ledger);
      this.renderFallback(plan);
      this.lastPlan = plan;
      this.lastManifest = manifest;
      this.ledger = ledger;
      this.renderHash = renderHash;
      return {
        status: "COMMITTED",
        plan,
        renderHash,
        resolvedAssets: ledger,
      };
    }

    let records: ResolvedRecord[] = [];
    const status = await this.coordinator.run({
      resolve: async () => {
        records = await Promise.all(this.collectAssetRequests(plan).map(
          async (request): Promise<ResolvedRecord> => ({
            ...request,
            resolution: await this.resolver.resolve(request.assetKey, {
              glyph: request.glyph,
              accessibleLabel: request.accessibleLabel,
            }),
          }),
        ));
        return records;
      },
      acquire: async (resolved) => this.acquireTextures(resolved),
      build: async (resolved, leases) => (
        this.buildSceneRoot(plan, resolved, leases as TextureLease<unknown>[])
      ),
      discard: (built) => {
        built.atmosphere?.destroy();
        built.root.destroy({ children: true });
      },
      commit: (built, leases) => {
        const previous: Releasable[] = [...this.activeResources];
        this.app!.stage.addChild(built.root);
        if (this.activeRoot !== null) {
          try {
            this.app!.stage.removeChild(this.activeRoot);
            previous.push(releaseRoot(this.activeRoot));
          } catch (cause) {
            this.app!.stage.removeChild(built.root);
            throw cause;
          }
        }
        // Retire the previous atmosphere: stop its ticker and queue destruction
        // of its per-build textures after the new frame is committed.
        if (this.activeAtmosphere !== null) {
          const retired = this.activeAtmosphere;
          retired.stop();
          previous.push({ release: () => retired.destroy() });
        }
        this.activeRoot = built.root;
        this.activeResources = leases;
        this.activeAtmosphere = built.atmosphere;
        // Begin animation on the new atmosphere (no-op under reduced motion).
        if (built.atmosphere !== null && this.app!.ticker !== undefined) {
          built.atmosphere.start(this.app!.ticker);
        }
        this.lastPlan = plan;
        this.lastManifest = manifest;
        this.ledger = built.ledger;
        this.renderHash = built.renderHash;
        return previous;
      },
      onFailure: (cause) => {
        this.emitDiagnostic(createDiagnostic("RASTERIZATION_FAILED", "ERROR", {
          detail: cause instanceof Error
            ? `Scene draw failed: ${cause.message}`
            : "Scene draw failed",
        }));
      },
    });

    if (status === "FAILED" && this.lastPlan === null) {
      this.fallback = true;
      const fallbackPlan = buildScenePlan(manifest, { fallbackMode: true });
      this.renderFallback(fallbackPlan);
    }

    return {
      status,
      plan,
      renderHash: this.renderHash,
      resolvedAssets: this.ledger,
    };
  }

  async applyPatch(manifest: SceneManifest): Promise<SceneRenderOutcome> {
    return this.renderScene(manifest);
  }

  private buildSceneRoot(
    plan: SceneRenderPlan,
    records: readonly ResolvedRecord[],
    leases: readonly TextureLease<unknown>[],
  ): BuiltScene {
    const pixi = this.pixi!;
    const root = new pixi.Container() as unknown as PixiContainer;
    const byAsset = new Map(records.map((record) => [
      record.assetKey,
      record,
    ]));
    const byTexture = new Map(leases.map((lease) => [
      lease.cacheKey,
      lease.texture,
    ]));

    // Presentation-layer atmosphere (design spec §5). Built first so its
    // gradient backdrop can replace the flat room fill; its overlay (glow +
    // particles) and vignette are layered around the authoritative sprites.
    // Null when the atmosphere pass is disabled or unavailable — the flat
    // background + lighting tint below keep the scene fully operable.
    const atmosphere = this.atmosphereRenderer !== null
      ? this.atmosphereRenderer.build(
          buildAtmospherePlan(plan, { reducedMotion: this.reducedMotion }),
          plan.width,
          plan.height,
        )
      : null;

    // Layer 0 — flat room base. Always present; visible only where neither the
    // atmosphere gradient nor an authored backdrop covers it.
    const base = new pixi.Graphics();
    base.rect(0, 0, plan.width, plan.height).fill({
      color: plan.backgroundGlyph.color,
      alpha: 1,
    });
    root.addChild(base);

    // Layer 1 — atmosphere mood gradient + stars + moonbeams (opaque gradient
    // covers the base; stars/moonbeams read through backdrop openings).
    if (atmosphere !== null) {
      root.addChild(atmosphere.backdrop);
    }

    // Layer 2 — authored room backdrop (walls/floor/opening). Transparent
    // regions reveal the mood gradient beneath; falls back to the gradient or
    // base when no backdrop packet resolved.
    const backdropSprite = this.buildBackgroundSprite(
      plan,
      byAsset,
      byTexture,
    );
    if (backdropSprite !== null) {
      root.addChild(backdropSprite);
    }

    for (const sprite of plan.sprites) {
      root.addChild(this.buildSprite(sprite, byAsset, byTexture));
    }

    // Additive glow + particles bloom over the world objects.
    if (atmosphere !== null) {
      root.addChild(atmosphere.overlay);
    }

    const tint = new pixi.Graphics();
    tint.rect(0, 0, plan.width, plan.height).fill({
      color: plan.lightingTint,
      alpha: plan.lightingAlpha,
    });
    root.addChild(tint);

    // Edge vignette sits over the tint but under text so labels stay legible.
    if (atmosphere !== null) {
      root.addChild(atmosphere.vignette);
    }

    for (const region of plan.textRegions) {
      if (!region.text) continue;
      const isTitle = region.kind === "title";
      const text = new pixi.Text({
        text: region.text,
        style: {
          fontFamily: "Georgia, serif",
          fontSize: isTitle ? 26 : region.kind === "description" ? 14 : 13,
          fill: isTitle
            ? 0xc9a96e
            : region.kind === "description" ? 0xb8b0a0 : 0xe0d8c8,
          fontStyle: region.kind === "description" ? "italic" : "normal",
          wordWrap: true,
          wordWrapWidth: region.width || 320,
        },
      });
      text.x = Math.round(region.x);
      text.y = Math.round(region.y);
      root.addChild(text);
    }

    for (const hotspot of plan.hotspots) {
      const hit = new pixi.Graphics();
      hit.rect(hotspot.x, hotspot.y, hotspot.w, hotspot.h)
        .fill({ color: 0x9fd0e0, alpha: 0.001 })
        .stroke({ color: 0x9fd0e0, alpha: 0.5, width: 1.5 });
      hit.eventMode = "static";
      hit.cursor = "pointer";
      hit.on("pointertap", () => this.config.onCommand?.(hotspot.command));
      const caption = new pixi.Text({
        text: hotspot.label,
        style: {
          fontFamily: "Georgia, serif",
          fontSize: 12,
          fill: 0x9fd0e0,
        },
      });
      caption.x = Math.round(hotspot.x);
      caption.y = Math.max(0, Math.round(hotspot.y - 16));
      root.addChild(hit);
      root.addChild(caption);
    }

    const ledger = records.map((record) => (
      toResolvedAssetLedgerEntry(record.assetKey, record.resolution)
    ));
    return {
      root,
      ledger,
      renderHash: computeSceneRenderHash(plan, ledger),
      atmosphere,
    };
  }

  private buildBackgroundSprite(
    plan: SceneRenderPlan,
    byAsset: ReadonlyMap<string, ResolvedRecord>,
    byTexture: ReadonlyMap<string, unknown>,
  ): unknown | null {
    const record = byAsset.get(plan.backgroundAssetKey);
    const resolution = record?.resolution;
    const cacheKey = resolution?.status === "PIXELBRAIN"
      ? resolution.raster.rasterHash
      : resolution?.status === "PNG" ? resolution.pngRevision : null;
    const texture = cacheKey === null ? undefined : byTexture.get(cacheKey);
    if (texture === undefined) return null;

    const pixi = this.pixi!;
    const sprite = new pixi.Sprite(texture as never);
    // Stretch the authored backdrop to fill the logical canvas. Backdrops are
    // authored at the canvas aspect (parent §10.3 raster law), so this is a
    // whole-number-friendly fit; nearest-neighbor sampling keeps pixels crisp.
    sprite.x = 0;
    sprite.y = 0;
    sprite.width = plan.width;
    sprite.height = plan.height;
    return sprite;
  }

  private buildSprite(
    sprite: PlanSprite,
    byAsset: ReadonlyMap<string, ResolvedRecord>,
    byTexture: ReadonlyMap<string, unknown>,
  ): unknown {
    const pixi = this.pixi!;
    const record = sprite.assetKey === null
      ? undefined
      : byAsset.get(sprite.assetKey);
    const resolution = record?.resolution;
    const cacheKey = resolution?.status === "PIXELBRAIN"
      ? resolution.raster.rasterHash
      : resolution?.status === "PNG" ? resolution.pngRevision : null;
    const texture = cacheKey === null ? undefined : byTexture.get(cacheKey);
    if (texture !== undefined) {
      const result = new pixi.Sprite(texture as never);
      result.anchor.set(0.5);
      result.x = Math.round(sprite.x);
      result.y = Math.round(sprite.y);
      const sourceWidth = resolution?.status === "PIXELBRAIN"
        ? resolution.raster.width
        : resolution?.status === "PNG" ? resolution.width : sprite.glyph.width;
      const sourceHeight = resolution?.status === "PIXELBRAIN"
        ? resolution.raster.height
        : resolution?.status === "PNG" ? resolution.height : sprite.glyph.height;
      const scale = Math.max(1, Math.round(Math.min(
        sprite.glyph.width / sourceWidth,
        sprite.glyph.height / sourceHeight,
      )));
      result.scale.set(scale);
      return result;
    }
    if (resolution?.status === "TEXT") {
      const text = new pixi.Text({
        text: resolution.accessibleLabel,
        style: { fontFamily: "Georgia, serif", fontSize: 12, fill: 0xe0d8c8 },
      });
      text.x = Math.round(sprite.x);
      text.y = Math.round(sprite.y);
      return text;
    }
    return this.drawGlyph(sprite);
  }

  private drawGlyph(sprite: PlanSprite): unknown {
    const pixi = this.pixi!;
    const graphics = new pixi.Graphics();
    const glyph = sprite.glyph;
    const x = Math.round(sprite.x);
    const y = Math.round(sprite.y);
    const halfWidth = glyph.width / 2;
    const halfHeight = glyph.height / 2;
    const fill = { color: glyph.color, alpha: glyph.alpha };

    switch (glyph.shape) {
      case "rect":
        graphics.rect(
          x - halfWidth,
          y - halfHeight,
          glyph.width,
          glyph.height,
        ).fill(fill);
        break;
      case "circle":
        graphics.circle(x, y, Math.max(halfWidth, halfHeight)).fill(fill);
        break;
      case "diamond":
        graphics.moveTo(x, y - halfHeight)
          .lineTo(x + halfWidth, y)
          .lineTo(x, y + halfHeight)
          .lineTo(x - halfWidth, y)
          .closePath()
          .fill(fill);
        break;
      case "flame":
        graphics.rect(x - halfWidth, y, glyph.width, halfHeight)
          .fill({ color: 0x3a3a44, alpha: 1 });
        graphics.moveTo(x, y - halfHeight)
          .lineTo(x + halfWidth * 0.7, y)
          .lineTo(x - halfWidth * 0.7, y)
          .closePath()
          .fill(fill);
        break;
      case "marker":
        graphics.circle(x, y, halfWidth).fill(fill);
        graphics.circle(x, y, halfWidth)
          .stroke({ color: 0xffffff, alpha: 0.7, width: 2 });
        break;
      case "overlay":
        graphics.rect(
          x - halfWidth,
          y - halfHeight,
          glyph.width,
          glyph.height,
        ).fill(fill);
        break;
    }
    return graphics;
  }

  async preload(assetKeys: string[]): Promise<void> {
    await this.init();
    if (this.fallback || this.textureCache === null) return;
    const records = await Promise.all([...new Set(assetKeys)].sort().map(
      async (assetKey): Promise<ResolvedRecord> => ({
        assetKey,
        glyph: null,
        accessibleLabel: assetKey,
        resolution: await this.resolver.resolve(assetKey, {
          glyph: null,
          accessibleLabel: assetKey,
        }),
      }),
    ));
    const leases = await this.acquireTextures(records);
    for (const lease of leases) lease.release();
  }

  private mountFallback(): void {
    if (this.fallbackEl !== null) return;
    this.config.container.innerHTML = "";
    const element = document.createElement("div");
    element.className = "scene-fallback";
    element.setAttribute("role", "region");
    element.setAttribute("aria-label", "Scene description (text mode)");
    this.config.container.appendChild(element);
    this.fallbackEl = element;
  }

  private renderFallback(plan: SceneRenderPlan): void {
    if (this.fallbackEl === null) this.mountFallback();
    const element = this.fallbackEl!;
    element.innerHTML = "";
    const heading = document.createElement("div");
    heading.className = "lighting";
    heading.textContent = `☀ ${plan.lightingState.replace(/_/g, " ")}`;
    element.appendChild(heading);

    for (const line of plan.fallbackLines) {
      if (line.startsWith("Lighting:")) continue;
      const row = document.createElement("div");
      row.className = "layer";
      row.textContent = `• ${line}`;
      element.appendChild(row);
    }
    if (plan.hotspots.length > 0) {
      const bar = document.createElement("div");
      bar.className = "hotspots";
      for (const hotspot of plan.hotspots) {
        const button = document.createElement("button");
        button.className = "hotspot";
        button.textContent = hotspot.label;
        button.title = hotspot.command;
        button.addEventListener(
          "click",
          () => this.config.onCommand?.(hotspot.command),
        );
        bar.appendChild(button);
      }
      element.appendChild(bar);
    }
    const hash = document.createElement("div");
    hash.className = "contract-hash";
    hash.textContent =
      `scene ${plan.sceneId} · #${plan.contractHash} · plan #${plan.planHash} · text mode`;
    element.appendChild(hash);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.coordinator.destroy();
    for (const resource of this.activeResources) resource.release();
    this.activeResources = [];
    if (this.activeAtmosphere !== null) {
      this.activeAtmosphere.stop();
      this.activeAtmosphere.destroy();
      this.activeAtmosphere = null;
    }
    this.atmosphereRenderer?.destroy();
    this.atmosphereRenderer = null;
    if (this.activeRoot !== null) {
      this.app?.stage.removeChild(this.activeRoot);
      releaseRoot(this.activeRoot).release();
      this.activeRoot = null;
    }
    this.textureCache?.destroy();
    this.textureCache = null;
    if (this.app !== null) {
      this.app.canvas.removeEventListener(
        "webglcontextlost",
        this.onContextLost,
      );
      this.app.canvas.removeEventListener(
        "webglcontextrestored",
        this.onContextRestored,
      );
      this.app.destroy(true, { children: true });
      this.app = null;
    }
    this.fallbackEl?.remove();
    this.fallbackEl = null;
    this.pixi = null;
    this.lastPlan = null;
    this.lastManifest = null;
    this.renderHash = null;
    this.ledger = [];
    this.initialized = false;
  }
}

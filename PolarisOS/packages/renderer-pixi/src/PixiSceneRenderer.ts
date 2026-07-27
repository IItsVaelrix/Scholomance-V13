/**
 * PixiSceneRenderer — browser adapter that executes a SceneRenderPlan via PixiJS.
 *
 * Milestone 5 (PDR §25, §5.3, §5.4). This is the illustrated renderer. It is a
 * thin, browser-only shell over the pure `buildScenePlan` projection:
 *
 *     SceneManifest  ──buildScenePlan──▶  SceneRenderPlan  ──PixiJS──▶  pixels
 *
 * All visual decisions (ordering, lighting tint, glyph choice, hotspot layout,
 * fallback text) live in scenePlan.ts so they stay deterministic and testable.
 * This file only knows how to draw a plan.
 *
 * Graceful degradation (PDR §5.4):
 *   - pixi.js is imported lazily, so merely importing this module never touches
 *     WebGL (keeps node typecheck/tests clean).
 *   - If the WebGL context cannot be created, the renderer switches to fallback
 *     text mode and projects the scene as accessible DOM text.
 *   - Each layer draws a procedural vector glyph immediately; an authored
 *     texture is overlaid only if it loads. A missing asset never blanks a layer.
 *
 * The renderer never mutates world state. Hotspots report their authored command
 * upward via `onCommand`; the client submits it to the authoritative server.
 */

import type { SceneManifest } from "@polaris/contracts";
import {
  buildScenePlan,
  type SceneRenderPlan,
  type PlanSprite,
  type GlyphSpec,
} from "./scenePlan.js";

export interface RendererConfig {
  /** Container element the canvas (or fallback text) is mounted into. */
  container: HTMLElement;
  /** Base URL prefixed to every assetKey when loading textures. */
  assetBaseUrl: string;
  /** Force text-only mode (skip PixiJS entirely). */
  fallbackMode?: boolean;
  /** Called when the user activates a hotspot; argument is the authored command. */
  onCommand?: (command: string) => void;
  /** Optional logical canvas size override. */
  width?: number;
  height?: number;
}

// Minimal structural type for the lazily-imported pixi.js Application so this
// module typechecks without a hard top-level dependency on pixi internals.
interface PixiApp {
  init(opts: Record<string, unknown>): Promise<void>;
  stage: PixiContainer;
  canvas: HTMLCanvasElement;
  destroy(removeCanvas?: boolean, options?: Record<string, unknown>): void;
}
interface PixiContainer {
  addChild(child: unknown): void;
  removeChildren(): unknown[];
  destroy(options?: Record<string, unknown>): void;
}

export class PixiSceneRenderer {
  private config: RendererConfig;
  private app: PixiApp | null = null;
  private pixi: typeof import("pixi.js") | null = null;
  private textureCache = new Map<string, unknown>();
  private fallback = false;
  private fallbackEl: HTMLElement | null = null;
  private lastPlan: SceneRenderPlan | null = null;
  private initialized = false;

  constructor(config: RendererConfig) {
    this.config = config;
    this.fallback = config.fallbackMode === true;
  }

  /** True when rendering as accessible text rather than WebGL illustration. */
  get isFallback(): boolean {
    return this.fallback;
  }

  get currentPlan(): SceneRenderPlan | null {
    return this.lastPlan;
  }

  /**
   * Lazily create the PixiJS application. Safe to call multiple times. If WebGL
   * is unavailable, flips to fallback text mode instead of throwing.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    if (this.fallback) {
      this.mountFallback();
      return;
    }

    try {
      const pixi = await import("pixi.js");
      this.pixi = pixi;
      const app = new pixi.Application() as unknown as PixiApp;
      await app.init({
        background: "#0f0f23",
        resizeTo: undefined,
        width: this.config.width ?? 800,
        height: this.config.height ?? 480,
        antialias: true,
        // Fail fast if there is no WebGL so we can degrade gracefully.
        preference: "webgl",
      });
      app.canvas.style.width = "100%";
      app.canvas.style.height = "auto";
      app.canvas.style.display = "block";
      app.canvas.setAttribute("role", "img");
      app.canvas.setAttribute("aria-label", "Illustrated room scene");
      this.config.container.innerHTML = "";
      this.config.container.appendChild(app.canvas);
      this.app = app;
    } catch (err) {
      // WebGL unavailable / context creation failed → text mode (PDR §5.4).
      console.warn("[PixiSceneRenderer] WebGL unavailable, using fallback text mode:", err);
      this.fallback = true;
      this.app = null;
      this.mountFallback();
    }
  }

  /**
   * Render a scene manifest. Builds the deterministic plan, then either draws
   * it via PixiJS or projects it as fallback text.
   */
  async renderScene(manifest: SceneManifest): Promise<SceneRenderPlan> {
    if (!this.initialized) await this.init();

    const plan = buildScenePlan(manifest, { fallbackMode: this.fallback });
    this.lastPlan = plan;

    if (this.fallback || !this.app || !this.pixi) {
      this.renderFallback(plan);
      return plan;
    }

    this.drawPlan(plan);
    return plan;
  }

  /**
   * Apply a scene patch. The server sends a full manifest on scene.patch, so a
   * patch is just a fresh deterministic re-projection (PDR §15.4 parity).
   */
  async applyPatch(manifest: SceneManifest): Promise<SceneRenderPlan> {
    return this.renderScene(manifest);
  }

  // --- PixiJS drawing -------------------------------------------------------

  private drawPlan(plan: SceneRenderPlan): void {
    const pixi = this.pixi!;
    const app = this.app!;
    app.stage.removeChildren();

    // Background fill (procedural; textured background would overlay if present).
    const bg = new pixi.Graphics();
    bg.rect(0, 0, plan.width, plan.height).fill({ color: plan.backgroundGlyph.color, alpha: 1 });
    app.stage.addChild(bg);

    // Sprites in deterministic z-order.
    for (const sprite of plan.sprites) {
      app.stage.addChild(this.buildSprite(pixi, sprite));
    }

    // Full-canvas lighting tint on top of the world layers.
    const tint = new pixi.Graphics();
    tint
      .rect(0, 0, plan.width, plan.height)
      .fill({ color: plan.lightingTint, alpha: plan.lightingAlpha });
    app.stage.addChild(tint);

    // Text regions (title, description, entity labels).
    for (const region of plan.textRegions) {
      if (!region.text) continue;
      const isTitle = region.kind === "title";
      const text = new pixi.Text({
        text: region.text,
        style: {
          fontFamily: "Georgia, serif",
          fontSize: isTitle ? 26 : region.kind === "description" ? 14 : 13,
          fill: isTitle ? 0xc9a96e : region.kind === "description" ? 0xb8b0a0 : 0xe0d8c8,
          fontStyle: region.kind === "description" ? "italic" : "normal",
          wordWrap: true,
          wordWrapWidth: region.width || 320,
        },
      });
      text.x = region.x;
      text.y = region.y;
      app.stage.addChild(text);
    }

    // Interactable hotspots drawn last (topmost), wired to onCommand.
    for (const hotspot of plan.hotspots) {
      const hit = new pixi.Graphics();
      hit
        .rect(hotspot.x, hotspot.y, hotspot.w, hotspot.h)
        .fill({ color: 0x9fd0e0, alpha: 0.001 })
        .stroke({ color: 0x9fd0e0, alpha: 0.5, width: 1.5 });
      hit.eventMode = "static";
      hit.cursor = "pointer";
      hit.on("pointertap", () => this.config.onCommand?.(hotspot.command));
      // Accessible label as a small caption above the hotspot.
      const caption = new pixi.Text({
        text: hotspot.label,
        style: { fontFamily: "Georgia, serif", fontSize: 12, fill: 0x9fd0e0 },
      });
      caption.x = hotspot.x;
      caption.y = Math.max(0, hotspot.y - 16);
      app.stage.addChild(hit);
      app.stage.addChild(caption);
    }
  }

  private buildSprite(pixi: typeof import("pixi.js"), sprite: PlanSprite): unknown {
    // If a texture was previously loaded for this asset, use a Sprite; otherwise
    // draw the procedural glyph. Textures are loaded best-effort (see preload).
    const tex = sprite.assetKey ? this.textureCache.get(sprite.assetKey) : undefined;
    if (tex) {
      const s = new pixi.Sprite(tex as any);
      s.anchor.set(0.5);
      s.x = sprite.x;
      s.y = sprite.y;
      return s;
    }
    return this.drawGlyph(pixi, sprite);
  }

  private drawGlyph(pixi: typeof import("pixi.js"), sprite: PlanSprite): unknown {
    const g = new pixi.Graphics();
    const glyph: GlyphSpec = sprite.glyph;
    const { x, y } = sprite;
    const half_w = glyph.width / 2;
    const half_h = glyph.height / 2;
    const fill = { color: glyph.color, alpha: glyph.alpha };

    switch (glyph.shape) {
      case "rect":
        g.rect(x - half_w, y - half_h, glyph.width, glyph.height).fill(fill);
        break;
      case "circle":
        g.circle(x, y, Math.max(half_w, half_h)).fill(fill);
        break;
      case "diamond":
        g.moveTo(x, y - half_h)
          .lineTo(x + half_w, y)
          .lineTo(x, y + half_h)
          .lineTo(x - half_w, y)
          .closePath()
          .fill(fill);
        break;
      case "flame": {
        // Brazier basin + flame.
        g.rect(x - half_w, y, glyph.width, half_h).fill({ color: 0x3a3a44, alpha: 1 });
        g.moveTo(x, y - half_h)
          .lineTo(x + half_w * 0.7, y)
          .lineTo(x - half_w * 0.7, y)
          .closePath()
          .fill(fill);
        break;
      }
      case "marker": {
        g.circle(x, y, half_w).fill(fill);
        g.circle(x, y, half_w).stroke({ color: 0xffffff, alpha: 0.7, width: 2 });
        break;
      }
      case "overlay":
        g.rect(x - half_w, y - half_h, glyph.width, glyph.height).fill(fill);
        break;
    }
    return g;
  }

  /**
   * Best-effort texture preload. Called by the client when it learns asset URLs;
   * a successful load is cached so the next renderScene uses a real Sprite.
   * Failures are silent — the procedural glyph remains authoritative visually.
   */
  async preload(assetKeys: string[]): Promise<void> {
    if (!this.pixi || this.fallback) return;
    const { Assets } = this.pixi;
    await Promise.all(
      assetKeys.map(async (key) => {
        if (!key || this.textureCache.has(key)) return;
        try {
          const texture = await Assets.load(`${this.config.assetBaseUrl}/${key}.png`);
          this.textureCache.set(key, texture);
        } catch {
          /* missing asset — procedural glyph stays in place (PDR §5.4) */
        }
      }),
    );
  }

  // --- Fallback text mode (PDR §16.3) ---------------------------------------

  private mountFallback(): void {
    if (this.fallbackEl) return;
    this.config.container.innerHTML = "";
    const el = document.createElement("div");
    el.className = "scene-fallback";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Scene description (text mode)");
    this.config.container.appendChild(el);
    this.fallbackEl = el;
  }

  private renderFallback(plan: SceneRenderPlan): void {
    if (!this.fallbackEl) this.mountFallback();
    const el = this.fallbackEl!;
    el.innerHTML = "";

    const heading = document.createElement("div");
    heading.className = "lighting";
    heading.textContent = `☀ ${plan.lightingState.replace(/_/g, " ")}`;
    el.appendChild(heading);

    for (const line of plan.fallbackLines) {
      const div = document.createElement("div");
      div.className = "layer";
      div.textContent = line.startsWith("Lighting:") ? "" : `• ${line}`;
      if (div.textContent) el.appendChild(div);
    }

    // Hotspots remain interactive even in text mode.
    if (plan.hotspots.length > 0) {
      const bar = document.createElement("div");
      bar.className = "hotspots";
      for (const h of plan.hotspots) {
        const btn = document.createElement("button");
        btn.className = "hotspot";
        btn.textContent = h.label;
        btn.title = h.command;
        btn.addEventListener("click", () => this.config.onCommand?.(h.command));
        bar.appendChild(btn);
      }
      el.appendChild(bar);
    }

    const hash = document.createElement("div");
    hash.className = "contract-hash";
    hash.textContent = `scene ${plan.sceneId} · #${plan.contractHash} · plan #${plan.planHash} · text mode`;
    el.appendChild(hash);
  }

  /** Tear down the PixiJS application and any mounted DOM. */
  destroy(): void {
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
    }
    if (this.fallbackEl) {
      this.fallbackEl.remove();
      this.fallbackEl = null;
    }
    this.textureCache.clear();
    this.initialized = false;
    this.lastPlan = null;
  }
}

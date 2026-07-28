/**
 * AtmosphereRenderer — browser-only PixiJS execution of an AtmospherePlan.
 *
 * Dual-State Art Pass (design spec §5). This is the thin Pixi shell that turns
 * the pure, deterministic AtmospherePlan into pixels. All projection math lives
 * in atmospherePlan.ts (node-testable); this module only draws and animates.
 *
 * Laws honored here:
 *   - No Pixi filter pipeline (no blur/bloom). Glow is faked with pre-rendered
 *     radial-gradient textures generated once and cached (spec §5.6).
 *   - Particles live in one shared container, capped by the plan's budget
 *     (≤ MAX_PARTICLES). Positions come from the pure computeParticleFrame —
 *     the ticker advances absolute time but NEVER reseeds (QUANT-0101/0102).
 *   - reducedMotion draws one static seeded frame and never starts the ticker.
 *   - Every layer is removable ornamentation: a flat-color fallback backdrop
 *     sits under the gradient so the scene stays operable if a texture fails.
 *
 * `pixi` is injected (not top-level imported) so this module stays importable
 * in a node test env without loading WebGL.
 */

import {
  computeParticleFrame,
  type AtmospherePlan,
  type GlowField,
  type ParticleEmitter,
} from "./atmospherePlan.js";

// --- Narrow structural seams over the Pixi API ------------------------------
//
// `any` is intentional at these adapter seams (mirrors renderIdentity.ts): the
// production renderer passes Pixi's concrete constructors; the shapes below
// document only what we touch.

interface PixiDisplayObject {
  x: number;
  y: number;
  alpha: number;
  visible: boolean;
  zIndex: number;
  blendMode: string;
  width: number;
  height: number;
  anchor?: { set(x: number, y?: number): void };
  scale?: { set(x: number, y?: number): void };
  tint?: number;
  addChild(child: unknown): void;
  removeChild(child: unknown): void;
  destroy(options?: Record<string, unknown>): void;
}

interface PixiGraphicsLike extends PixiDisplayObject {
  rect(x: number, y: number, w: number, h: number): PixiGraphicsLike;
  circle(x: number, y: number, r: number): PixiGraphicsLike;
  moveTo(x: number, y: number): PixiGraphicsLike;
  lineTo(x: number, y: number): PixiGraphicsLike;
  closePath(): PixiGraphicsLike;
  fill(style: Record<string, unknown>): PixiGraphicsLike;
}

export interface AtmospherePixiApi {
  Container: new () => PixiDisplayObject;
  Graphics: new () => PixiGraphicsLike;
  Sprite: new (texture?: unknown) => PixiDisplayObject;
  Texture: new (options: Record<string, unknown>) => {
    destroy(destroySource?: boolean): void;
  };
  BufferImageSource: new (options: Record<string, unknown>) => unknown;
}

export interface AtmosphereTicker {
  add(fn: (ticker: { deltaMS: number }) => void): void;
  remove(fn: (ticker: { deltaMS: number }) => void): void;
}

export interface AtmosphereLayer {
  /** Gradient backdrop + stars + moonbeams (drawn under scene sprites). */
  backdrop: PixiDisplayObject;
  /** Additive glows + particles (drawn over scene sprites). */
  overlay: PixiDisplayObject;
  /** Edge vignette (drawn over the lighting tint, under text). */
  vignette: PixiDisplayObject;
  /** Begin ticker-driven animation (no-op when reducedMotion). */
  start(ticker: AtmosphereTicker): void;
  /** Stop animation and detach the ticker callback. */
  stop(): void;
  /** Destroy all GPU resources owned by this layer. */
  destroy(): void;
}

// --- Pre-rendered texture generation (one-time, cached) ---------------------

/** The subset of a Pixi Texture we rely on for lifecycle management. */
interface PixiTextureLike {
  destroy(destroySource?: boolean): void;
}

/** A white radial falloff (center opaque → edge transparent), size×size. */
function makeRadialTexture(
  pixi: AtmospherePixiApi,
  size: number,
): PixiTextureLike {
  const rgba = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const maxDist = center;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
      // Smooth quadratic falloff, clamped.
      const falloff = Math.max(0, 1 - dist * dist);
      const a = Math.round(falloff * falloff * 255);
      const idx = (y * size + x) * 4;
      rgba[idx] = 255;
      rgba[idx + 1] = 255;
      rgba[idx + 2] = 255;
      rgba[idx + 3] = a;
    }
  }
  const source = new pixi.BufferImageSource({
    resource: rgba,
    width: size,
    height: size,
  });
  return new pixi.Texture({ source }) as PixiTextureLike;
}

/** A vertical gradient texture (widthPx × heightPx) from RGBA column stops. */
function makeGradientTexture(
  pixi: AtmospherePixiApi,
  widthPx: number,
  heightPx: number,
  stops: ReadonlyArray<{ offset: number; color: number; alpha: number }>,
): unknown {
  const rgba = new Uint8Array(widthPx * heightPx * 4);
  const sorted = [...stops].sort((a, b) => a.offset - b.offset);
  for (let y = 0; y < heightPx; y++) {
    const t = heightPx === 1 ? 0 : y / (heightPx - 1);
    const { color, alpha } = sampleGradient(sorted, t);
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const a = Math.round(alpha * 255);
    for (let x = 0; x < widthPx; x++) {
      const idx = (y * widthPx + x) * 4;
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a;
    }
  }
  const source = new pixi.BufferImageSource({
    resource: rgba,
    width: widthPx,
    height: heightPx,
  });
  return new pixi.Texture({ source });
}

function sampleGradient(
  stops: ReadonlyArray<{ offset: number; color: number; alpha: number }>,
  t: number,
): { color: number; alpha: number } {
  if (stops.length === 0) return { color: 0x000000, alpha: 1 };
  if (t <= stops[0].offset) return stops[0];
  const last = stops[stops.length - 1];
  if (t >= last.offset) return last;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t >= a.offset && t <= b.offset) {
      const span = b.offset - a.offset || 1;
      const f = (t - a.offset) / span;
      return {
        color: lerpColor(a.color, b.color, f),
        alpha: a.alpha + (b.alpha - a.alpha) * f,
      };
    }
  }
  return last;
}

function lerpColor(a: number, b: number, f: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * f);
  const g = Math.round(ag + (bg - ag) * f);
  const bl = Math.round(ab + (bb - ab) * f);
  return (r << 16) | (g << 8) | bl;
}

// --- Renderer ---------------------------------------------------------------

export class AtmosphereRenderer {
  private readonly pixi: AtmospherePixiApi;
  /** Shared white radial texture, tinted per glow (created once). */
  private glowTexture: unknown = null;
  /** Shared soft dot texture for particles (created once). */
  private dotTexture: unknown = null;
  private readonly ownedTextures: Array<{ destroy(source?: boolean): void }> = [];

  constructor(pixi: AtmospherePixiApi) {
    this.pixi = pixi;
  }

  private ensureGlowTexture(): unknown {
    if (this.glowTexture === null) {
      const tex = makeRadialTexture(this.pixi, 64);
      this.glowTexture = tex;
      this.ownedTextures.push(tex);
    }
    return this.glowTexture;
  }

  private ensureDotTexture(): unknown {
    if (this.dotTexture === null) {
      const tex = makeRadialTexture(this.pixi, 16);
      this.dotTexture = tex;
      this.ownedTextures.push(tex);
    }
    return this.dotTexture;
  }

  /**
   * Build the atmosphere layer for a plan. The returned layer owns its
   * containers and per-build textures; call destroy() when swapping scenes.
   */
  build(plan: AtmospherePlan, width: number, height: number): AtmosphereLayer {
    const pixi = this.pixi;
    const backdrop = new pixi.Container();
    const overlay = new pixi.Container();
    const vignette = new pixi.Container();
    const perBuildTextures: Array<{ destroy(source?: boolean): void }> = [];

    // 1. Flat-color fallback backdrop (always present; keeps scene operable).
    const fallback = new pixi.Graphics();
    fallback.rect(0, 0, width, height).fill({
      color: plan.background.stops[plan.background.stops.length - 1]?.color ?? 0x070912,
      alpha: 1,
    });
    backdrop.addChild(fallback);

    // 2. Vertical gradient backdrop (replaces the flat room fill, spec §5.2/5.3).
    try {
      const gradientTex = makeGradientTexture(
        pixi,
        4,
        64,
        plan.background.stops,
      ) as { destroy(source?: boolean): void };
      perBuildTextures.push(gradientTex);
      const gradientSprite = new pixi.Sprite(gradientTex);
      gradientSprite.x = 0;
      gradientSprite.y = 0;
      gradientSprite.width = width;
      gradientSprite.height = height;
      backdrop.addChild(gradientSprite);
    } catch {
      // Gradient failed; the flat fallback above still renders.
    }

    // 3. Moonbeam shafts + starfield (moonlight mood).
    const beamGraphics: PixiGraphicsLike[] = [];
    for (const beam of plan.moonbeams) {
      const g = new pixi.Graphics();
      drawMoonbeam(g, beam.x, beam.width, height, beam.color, beam.alpha);
      g.blendMode = "add";
      backdrop.addChild(g);
      beamGraphics.push(g);
    }

    const starSprites: PixiDisplayObject[] = [];
    const dotTex = plan.stars.length > 0 ? this.ensureDotTexture() : null;
    for (const star of plan.stars) {
      const sprite = new pixi.Sprite(dotTex ?? undefined);
      sprite.anchor?.set(0.5);
      sprite.x = star.x;
      sprite.y = star.y;
      const size = star.size * 2;
      sprite.width = size;
      sprite.height = size;
      sprite.tint = 0xdce6f8;
      sprite.alpha = star.baseAlpha;
      sprite.blendMode = "add";
      backdrop.addChild(sprite);
      starSprites.push(sprite);
    }

    // 4. Additive glow fields (over scene sprites).
    const glowTex = this.ensureGlowTexture();
    const glowSprites: Array<{ sprite: PixiDisplayObject; field: GlowField }> = [];
    for (const field of plan.glows) {
      const sprite = new pixi.Sprite(glowTex);
      sprite.anchor?.set(0.5);
      sprite.x = field.x;
      sprite.y = field.y;
      sprite.width = field.radius * 2;
      sprite.height = field.radius * 2;
      sprite.tint = field.color;
      sprite.alpha = field.alpha;
      sprite.blendMode = "add";
      overlay.addChild(sprite);
      glowSprites.push({ sprite, field });
    }

    // 5. Particles in one shared container (capped by plan.particleBudget).
    const particleContainer = new pixi.Container();
    overlay.addChild(particleContainer);
    const particleSprites: Array<{
      sprite: PixiDisplayObject;
      emitter: ParticleEmitter;
      index: number;
    }> = [];
    const pDotTex = this.ensureDotTexture();
    for (const emitter of plan.emitters) {
      for (let i = 0; i < emitter.count; i++) {
        const sprite = new pixi.Sprite(pDotTex);
        sprite.anchor?.set(0.5);
        sprite.blendMode = emitter.kind === "mist" ? "normal" : "add";
        particleContainer.addChild(sprite);
        particleSprites.push({ sprite, emitter, index: i });
      }
    }

    // 6. Vignette (radial darkening toward edges).
    try {
      const vignetteTex = makeVignetteTexture(
        pixi,
        64,
        plan.vignette.color,
        plan.vignette.alpha,
        plan.vignette.strength,
      ) as { destroy(source?: boolean): void };
      perBuildTextures.push(vignetteTex);
      const vignetteSprite = new pixi.Sprite(vignetteTex);
      vignetteSprite.x = 0;
      vignetteSprite.y = 0;
      vignetteSprite.width = width;
      vignetteSprite.height = height;
      vignette.addChild(vignetteSprite);
    } catch {
      // Vignette is pure ornament; skip silently on failure.
    }

    // --- Animation ----------------------------------------------------------

    let elapsedSeconds = 0;
    // A fixed seeded time for the static reduced-motion frame.
    const staticTime = 1.37;

    const applyFrame = (timeSeconds: number): void => {
      for (const { sprite, field } of glowSprites) {
        const flicker = plan.reducedMotion
          ? 1
          : 1 - field.flickerAmount
            + Math.sin(timeSeconds * 2.1 + field.flickerPhase * Math.PI * 2)
              * field.flickerAmount;
        sprite.alpha = field.alpha * flicker;
      }
      for (let s = 0; s < starSprites.length; s++) {
        const star = plan.stars[s];
        const sprite = starSprites[s];
        const twinkle = plan.reducedMotion
          ? 1
          : 0.6 + 0.4 * Math.sin(timeSeconds * 1.3 + star.twinklePhase * Math.PI * 2);
        sprite.alpha = star.baseAlpha * twinkle;
      }
      for (let b = 0; b < beamGraphics.length; b++) {
        const beam = plan.moonbeams[b];
        const g = beamGraphics[b];
        const sway = plan.reducedMotion
          ? 0
          : Math.sin(timeSeconds * 0.4 + beam.swayPhase * Math.PI * 2) * 12;
        g.x = sway;
      }
      for (const entry of particleSprites) {
        const frame = computeParticleFrame(entry.emitter, entry.index, timeSeconds);
        entry.sprite.x = frame.x;
        entry.sprite.y = frame.y;
        entry.sprite.alpha = frame.alpha;
        const size = frame.size * 2;
        entry.sprite.width = size;
        entry.sprite.height = size;
        entry.sprite.tint = entry.emitter.colors[frame.colorIndex] ?? 0xffffff;
      }
    };

    // Always render at least one deterministic frame.
    applyFrame(plan.reducedMotion ? staticTime : 0);

    let tickerFn: ((ticker: { deltaMS: number }) => void) | null = null;
    let activeTicker: AtmosphereTicker | null = null;

    const start = (ticker: AtmosphereTicker): void => {
      if (plan.reducedMotion) return; // static frame only
      if (tickerFn !== null) return;
      tickerFn = ({ deltaMS }) => {
        elapsedSeconds += deltaMS / 1000;
        applyFrame(elapsedSeconds);
      };
      activeTicker = ticker;
      ticker.add(tickerFn);
    };

    const stop = (): void => {
      if (tickerFn !== null && activeTicker !== null) {
        activeTicker.remove(tickerFn);
      }
      tickerFn = null;
      activeTicker = null;
    };

    const destroy = (): void => {
      stop();
      backdrop.destroy({ children: true });
      overlay.destroy({ children: true });
      vignette.destroy({ children: true });
      for (const tex of perBuildTextures) {
        try {
          tex.destroy(true);
        } catch {
          // already destroyed
        }
      }
    };

    return { backdrop, overlay, vignette, start, stop, destroy };
  }

  /** Release long-lived cached textures. Call on renderer teardown. */
  destroy(): void {
    for (const tex of this.ownedTextures) {
      try {
        tex.destroy(true);
      } catch {
        // already destroyed
      }
    }
    this.ownedTextures.length = 0;
    this.glowTexture = null;
    this.dotTexture = null;
  }
}

function drawMoonbeam(
  g: PixiGraphicsLike,
  x: number,
  width: number,
  height: number,
  color: number,
  alpha: number,
): void {
  // A soft shaft widening from the top edge down to the floor.
  const topHalf = width * 0.3;
  const bottomHalf = width;
  g.moveTo(x - topHalf, 0)
    .lineTo(x + topHalf, 0)
    .lineTo(x + bottomHalf, height)
    .lineTo(x - bottomHalf, height)
    .closePath()
    .fill({ color, alpha });
}

function makeVignetteTexture(
  pixi: AtmospherePixiApi,
  size: number,
  color: number,
  alpha: number,
  strength: number,
): unknown {
  const rgba = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const maxDist = Math.sqrt(2) * center;
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy) / maxDist; // 0 center .. ~0.7 corner
      // No darkening until past (1 - strength); ramp to full alpha at the edge.
      const threshold = 1 - strength;
      const norm = Math.max(0, (dist * 1.4 - threshold) / (1 - threshold || 1));
      const a = Math.round(Math.min(1, norm) * alpha * 255);
      const idx = (y * size + x) * 4;
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a;
    }
  }
  const source = new pixi.BufferImageSource({
    resource: rgba,
    width: size,
    height: size,
  });
  return new pixi.Texture({ source });
}

/**
 * atmospherePlan — deterministic SceneRenderPlan → AtmospherePlan projection.
 *
 * Dual-State Art Pass (design spec §5). This is the pure, browser-safe
 * atmosphere heart that sits alongside scenePlan.ts. Where scenePlan projects
 * authoritative world state into sprites, atmospherePlan projects *mood*:
 * firelight and moonlight each become a complete, distinct scene atmosphere
 * (glow fields, particle emitters, gradient backdrop, vignette, starfield,
 * moonbeam shafts).
 *
 * Why a separate pure module?
 *   - Atmosphere is presentation-only ornamentation (spec §2, Approach A). It
 *     never reads or alters the SceneManifest, SceneRenderPlan, planHash, or
 *     fallbackLines beyond what the plan already exposes (lightingState,
 *     ambientEffects, sprite positions/glyphs). Strip it and the scene stays
 *     operable and accessible (Compose PDR §8.6).
 *   - PixiJS needs WebGL + DOM and cannot run under the node test runner. By
 *     isolating all projection logic here (no PixiJS, no DOM, no node:crypto),
 *     the atmosphere contract stays fully unit-testable in a plain node env —
 *     extending the §15.4 parity guarantee to atmosphere.
 *
 * Guarantees:
 *   - buildAtmospherePlan is a pure function: same plan + options → same
 *     AtmospherePlan, always (byte-exact atmosphereHash).
 *   - All randomness is seeded (FNV-1a derived). No Math.random(), no per-frame
 *     reseeding (QUANT-0101/0102 clean). Animation advances by frame delta
 *     against seeded phases carried in the plan; the renderer never reseeds.
 *   - Particle budget is hard-capped (MAX_PARTICLES) in a single shared
 *     container; no Pixi filter pipeline (glow is faked with pre-rendered
 *     radial-gradient textures, spec §5.6).
 *   - reducedMotion yields one static seeded frame: glow and stars present,
 *     zero animation (spec §5.5).
 */

import type { SceneRenderPlan, PlanSprite } from "./scenePlan.js";

// --- Logical canvas (must match scenePlan) ---------------------------------

export const ATMOSPHERE_WIDTH = 800;
export const ATMOSPHERE_HEIGHT = 480;

/** Hard cap on live particle sprites across all emitters (spec §5.6). */
export const MAX_PARTICLES = 120;

// --- Mood -------------------------------------------------------------------

export type AtmosphereMood = "warm_firelight" | "ambient_moonlight";

/** The lighting states that resolve to the warm firelight mood. */
const WARM_LIGHTING_STATES = new Set(["warm_firelight"]);

export function moodForLightingState(lightingState: string): AtmosphereMood {
  return WARM_LIGHTING_STATES.has(lightingState)
    ? "warm_firelight"
    : "ambient_moonlight";
}

// --- Plan shapes ------------------------------------------------------------

export interface GradientStop {
  /** 0 (top) .. 1 (bottom). */
  offset: number;
  /** 24-bit RGB. */
  color: number;
  alpha: number;
}

export interface BackgroundGradient {
  direction: "vertical";
  stops: readonly GradientStop[];
}

export interface VignetteSpec {
  color: number;
  alpha: number;
  /** 0..1 — how far the vignette reaches toward center. */
  strength: number;
}

export interface GlowField {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: number;
  /** Base alpha before seeded flicker. */
  alpha: number;
  /** Additive blend fakes bloom without a filter pipeline (spec §5.6). */
  blend: "additive";
  /** Seeded flicker phase [0,1); the renderer animates against this. */
  flickerPhase: number;
  /** Flicker amplitude as a fraction of base alpha. */
  flickerAmount: number;
}

export type EmitterKind =
  | "embers"
  | "motes"
  | "moths"
  | "rain"
  | "mist";

export interface ParticleEmitter {
  id: string;
  kind: EmitterKind;
  /** Spawn rectangle (canvas coordinates). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Number of live sprites this emitter owns (already budget-clamped). */
  count: number;
  /** Per-emitter deterministic seed. */
  seed: number;
  /** Palette the renderer cycles through (24-bit RGB). */
  colors: readonly number[];
  /** Rise/fall speed in px/sec (positive = upward for embers/motes). */
  speed: number;
  /** Horizontal sinuous drift amplitude in px. */
  drift: number;
  sizeMin: number;
  sizeMax: number;
  alphaMin: number;
  alphaMax: number;
}

export interface MoonbeamSpec {
  id: string;
  /** Top-edge x anchor of the shaft. */
  x: number;
  width: number;
  color: number;
  alpha: number;
  /** Seeded sway phase [0,1). */
  swayPhase: number;
}

export interface StarSpec {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  /** Seeded twinkle phase [0,1). */
  twinklePhase: number;
}

export interface AtmospherePlan {
  sceneId: string;
  mood: AtmosphereMood;
  reducedMotion: boolean;
  background: BackgroundGradient;
  vignette: VignetteSpec;
  glows: readonly GlowField[];
  emitters: readonly ParticleEmitter[];
  moonbeams: readonly MoonbeamSpec[];
  stars: readonly StarSpec[];
  /** ambientEffects strings that mapped to an emitter. */
  mappedEffects: readonly string[];
  /**
   * ambientEffects strings with no atmosphere emitter. These are intentionally
   * left to the scene plan's effect-layer glyph (the 12px-circle fallback) so
   * the effect layer never regresses (spec §5.4).
   */
  unmappedEffects: readonly string[];
  /** Total live particle sprites across all emitters (≤ MAX_PARTICLES). */
  particleBudget: number;
  /** Deterministic hash of the atmosphere (client-side projection check). */
  atmosphereHash: string;
}

export interface BuildAtmosphereOptions {
  /** One static seeded frame; glow + stars present, zero animation. */
  reducedMotion?: boolean;
}

// --- Deterministic hashing / seeding (browser-safe, no node:crypto) ---------

/** FNV-1a 32-bit as an unsigned integer. Pure and platform-independent. */
function fnv1aNum(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** FNV-1a 32-bit rendered as 8 hex chars (matches scenePlan discipline). */
function fnv1a(input: string): string {
  return fnv1aNum(input).toString(16).padStart(8, "0");
}

/** Deterministic unit [0,1) from a seed + index + channel. No Math.random. */
function unit(seed: number, index: number, channel: number): number {
  return fnv1aNum(`${seed}:${index}:${channel}`) / 0x100000000;
}

// --- Palettes (parent §9: obsidian + desaturated brass; cyan is focus-only) -

const WARM_BACKGROUND_STOPS: readonly GradientStop[] = [
  { offset: 0, color: 0x3a2410, alpha: 1 },
  { offset: 0.55, color: 0x241609, alpha: 1 },
  { offset: 1, color: 0x0c0805, alpha: 1 },
];

const MOON_BACKGROUND_STOPS: readonly GradientStop[] = [
  { offset: 0, color: 0x1a2138, alpha: 1 },
  { offset: 0.55, color: 0x12162a, alpha: 1 },
  { offset: 1, color: 0x070912, alpha: 1 },
];

const WARM_VIGNETTE: VignetteSpec = { color: 0x1a0d04, alpha: 0.5, strength: 0.6 };
const MOON_VIGNETTE: VignetteSpec = { color: 0x0a0e22, alpha: 0.55, strength: 0.65 };

const EMBER_COLORS: readonly number[] = [0xffb066, 0xff8c2e, 0xe6c15a, 0xa7482f];
const MOTE_COLORS: readonly number[] = [0xc9b892, 0xaab4c8, 0x8fa9d6];
const MOTH_COLORS: readonly number[] = [0xd8d2c0, 0xb8b0a0, 0xe0d8c8];
const RAIN_COLORS: readonly number[] = [0x9fb4d6, 0xb8c8e0];
const MIST_COLORS: readonly number[] = [0x8a94a8, 0x6c7885];

const MOONBEAM_COLOR = 0xbcd0f0;
const STAR_COLOR = 0xdce6f8;

// --- Ambient-effect mapping (spec §5.4) -------------------------------------

interface EmitterTemplate {
  kind: EmitterKind;
  colors: readonly number[];
  count: number;
  speed: number;
  drift: number;
  sizeMin: number;
  sizeMax: number;
  alphaMin: number;
  alphaMax: number;
}

const EFFECT_TEMPLATES: Record<EmitterKind, EmitterTemplate> = {
  embers: {
    kind: "embers",
    colors: EMBER_COLORS,
    count: 26,
    speed: 26,
    drift: 14,
    sizeMin: 1,
    sizeMax: 3,
    alphaMin: 0.25,
    alphaMax: 0.9,
  },
  motes: {
    kind: "motes",
    colors: MOTE_COLORS,
    count: 22,
    speed: 6,
    drift: 18,
    sizeMin: 1,
    sizeMax: 2,
    alphaMin: 0.12,
    alphaMax: 0.4,
  },
  moths: {
    kind: "moths",
    colors: MOTH_COLORS,
    count: 10,
    speed: 12,
    drift: 30,
    sizeMin: 1,
    sizeMax: 3,
    alphaMin: 0.2,
    alphaMax: 0.6,
  },
  rain: {
    kind: "rain",
    colors: RAIN_COLORS,
    count: 30,
    speed: -120,
    drift: 4,
    sizeMin: 1,
    sizeMax: 2,
    alphaMin: 0.15,
    alphaMax: 0.4,
  },
  mist: {
    kind: "mist",
    colors: MIST_COLORS,
    count: 8,
    speed: 3,
    drift: 24,
    sizeMin: 6,
    sizeMax: 14,
    alphaMin: 0.04,
    alphaMax: 0.12,
  },
};

/**
 * Map an ambientEffects string to an emitter kind. Returns null for effects
 * that have no atmosphere emitter (e.g. "moonbeam" is a shaft, not particles;
 * unknown strings fall back to the scene-plan effect glyph). Matching is
 * substring-based and case-insensitive so authored variants ("dust_motes",
 * "motes", "ember_rise") all resolve deterministically.
 */
export function emitterKindForEffect(effect: string): EmitterKind | null {
  const key = effect.toLowerCase();
  if (key.includes("ember")) return "embers";
  if (key.includes("mote") || key.includes("dust")) return "motes";
  if (key.includes("moth")) return "moths";
  if (key.includes("rain")) return "rain";
  if (key.includes("mist") || key.includes("fog")) return "mist";
  return null;
}

// --- Sprite selection helpers -----------------------------------------------

/** Sprites that behave as flame light sources (brazier_lit, lantern). */
function isFlameSource(sprite: PlanSprite): boolean {
  if (sprite.glyph.shape === "flame") return true;
  const key = sprite.assetKey ?? "";
  return key.includes("brazier_lit") || key.includes("lantern");
}

/** Sprites that receive a cool rim glow under moonlight (solid world objects). */
function isRimTarget(sprite: PlanSprite): boolean {
  return (
    sprite.layerType === "entity"
    || sprite.layerType === "prop"
    || sprite.layerType === "player-marker"
  );
}

// --- Plan construction ------------------------------------------------------

/**
 * Project a SceneRenderPlan into a deterministic AtmospherePlan.
 *
 * Pure: identical plans + options always yield identical atmosphere hashes.
 * The input plan is never mutated.
 */
export function buildAtmospherePlan(
  plan: SceneRenderPlan,
  options: BuildAtmosphereOptions = {},
): AtmospherePlan {
  const reducedMotion = options.reducedMotion === true;
  const mood = moodForLightingState(plan.lightingState);
  const baseSeed = fnv1aNum(`${plan.sceneId}|${plan.lightingState}`);

  const background: BackgroundGradient = {
    direction: "vertical",
    stops: mood === "warm_firelight"
      ? [...WARM_BACKGROUND_STOPS]
      : [...MOON_BACKGROUND_STOPS],
  };

  const vignette = mood === "warm_firelight"
    ? { ...WARM_VIGNETTE }
    : { ...MOON_VIGNETTE };

  const glows = buildGlows(plan, mood, baseSeed);
  const { emitters, mappedEffects, unmappedEffects } = buildEmitters(
    plan,
    mood,
    baseSeed,
  );
  const moonbeams = mood === "ambient_moonlight"
    ? buildMoonbeams(baseSeed)
    : [];
  const stars = mood === "ambient_moonlight"
    ? buildStarfield(baseSeed)
    : [];

  const particleBudget = emitters.reduce((sum, e) => sum + e.count, 0);

  const partial: Omit<AtmospherePlan, "atmosphereHash"> = {
    sceneId: plan.sceneId,
    mood,
    reducedMotion,
    background,
    vignette,
    glows,
    emitters,
    moonbeams,
    stars,
    mappedEffects,
    unmappedEffects,
    particleBudget,
  };

  return { ...partial, atmosphereHash: hashAtmosphere(partial) };
}

function buildGlows(
  plan: SceneRenderPlan,
  mood: AtmosphereMood,
  baseSeed: number,
): GlowField[] {
  const glows: GlowField[] = [];
  if (mood === "warm_firelight") {
    // Warm radial glow around each flame source, with slow seeded flicker.
    const flames = plan.sprites.filter(isFlameSource);
    flames.forEach((sprite, index) => {
      const seed = fnv1aNum(`${baseSeed}|glow|${index}|${sprite.layerId}`);
      glows.push({
        id: `glow:${sprite.layerId}`,
        x: sprite.x,
        y: sprite.y,
        radius: sprite.glyph.shape === "flame" ? 150 : 96,
        color: 0xff9a3c,
        alpha: 0.42,
        blend: "additive",
        flickerPhase: unit(seed, 0, 0),
        flickerAmount: 0.22,
      });
    });
  } else {
    // Cool silver-blue rim glow on solid world objects.
    const targets = plan.sprites.filter(isRimTarget);
    targets.forEach((sprite, index) => {
      const seed = fnv1aNum(`${baseSeed}|rim|${index}|${sprite.layerId}`);
      glows.push({
        id: `rim:${sprite.layerId}`,
        x: sprite.x,
        y: sprite.y,
        radius: Math.max(sprite.glyph.width, sprite.glyph.height) * 0.9 + 24,
        color: 0x8fa9d6,
        alpha: 0.16,
        blend: "additive",
        flickerPhase: unit(seed, 0, 0),
        flickerAmount: 0.06,
      });
    });
  }
  return glows.sort((a, b) => a.id.localeCompare(b.id));
}

function buildEmitters(
  plan: SceneRenderPlan,
  mood: AtmosphereMood,
  baseSeed: number,
): {
  emitters: ParticleEmitter[];
  mappedEffects: string[];
  unmappedEffects: string[];
} {
  const templates: Array<{ id: string; template: EmitterTemplate; region: Rect }> = [];
  const mappedEffects: string[] = [];
  const unmappedEffects: string[] = [];

  // Warm firelight always raises embers from its flame sources (spec §5.2).
  if (mood === "warm_firelight") {
    plan.sprites.filter(isFlameSource).forEach((sprite, index) => {
      templates.push({
        id: `embers:${sprite.layerId}`,
        template: EFFECT_TEMPLATES.embers,
        region: {
          x: sprite.x - sprite.glyph.width / 2,
          y: sprite.y - sprite.glyph.height / 2,
          w: sprite.glyph.width,
          h: sprite.glyph.height,
        },
      });
      void index;
    });
  }

  // ambientEffects strings map to emitters; unknowns fall back to the glyph.
  for (const effect of plan.ambientEffects) {
    const kind = emitterKindForEffect(effect);
    if (kind === null) {
      unmappedEffects.push(effect);
      continue;
    }
    mappedEffects.push(effect);
    templates.push({
      id: `fx:${effect}`,
      template: EFFECT_TEMPLATES[kind],
      region: fullCanvasRegion(),
    });
  }

  // Clamp counts to the shared particle budget, deterministically. Larger
  // emitters are trimmed first so small accent emitters survive.
  const emitters = clampBudget(templates, baseSeed);

  return {
    emitters,
    mappedEffects: [...mappedEffects].sort(),
    unmappedEffects: [...unmappedEffects].sort(),
  };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function fullCanvasRegion(): Rect {
  return { x: 0, y: 0, w: ATMOSPHERE_WIDTH, h: ATMOSPHERE_HEIGHT };
}

function clampBudget(
  templates: ReadonlyArray<{ id: string; template: EmitterTemplate; region: Rect }>,
  baseSeed: number,
): ParticleEmitter[] {
  const totalRequested = templates.reduce((s, t) => s + t.template.count, 0);
  const scale = totalRequested > MAX_PARTICLES
    ? MAX_PARTICLES / totalRequested
    : 1;

  return templates.map((entry, index) => {
    const seed = fnv1aNum(`${baseSeed}|emitter|${index}|${entry.id}`);
    const count = Math.max(
      1,
      Math.min(entry.template.count, Math.round(entry.template.count * scale)),
    );
    const t = entry.template;
    return {
      id: entry.id,
      kind: t.kind,
      x: entry.region.x,
      y: entry.region.y,
      w: entry.region.w,
      h: entry.region.h,
      count,
      seed,
      colors: [...t.colors],
      speed: t.speed,
      drift: t.drift,
      sizeMin: t.sizeMin,
      sizeMax: t.sizeMax,
      alphaMin: t.alphaMin,
      alphaMax: t.alphaMax,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

function buildMoonbeams(baseSeed: number): MoonbeamSpec[] {
  const beams: MoonbeamSpec[] = [];
  const count = 3;
  for (let i = 0; i < count; i++) {
    const seed = fnv1aNum(`${baseSeed}|moonbeam|${i}`);
    beams.push({
      id: `moonbeam:${i}`,
      x: Math.round(unit(seed, 0, 0) * (ATMOSPHERE_WIDTH - 160)) + 40,
      width: 60 + Math.round(unit(seed, 1, 0) * 80),
      color: MOONBEAM_COLOR,
      alpha: 0.06 + unit(seed, 2, 0) * 0.06,
      swayPhase: unit(seed, 3, 0),
    });
  }
  return beams.sort((a, b) => a.id.localeCompare(b.id));
}

function buildStarfield(baseSeed: number): StarSpec[] {
  const stars: StarSpec[] = [];
  const count = 40;
  for (let i = 0; i < count; i++) {
    const seed = fnv1aNum(`${baseSeed}|star|${i}`);
    stars.push({
      x: Math.round(unit(seed, 0, 0) * ATMOSPHERE_WIDTH),
      // Stars occupy the upper two-thirds only.
      y: Math.round(unit(seed, 1, 0) * (ATMOSPHERE_HEIGHT * 0.66)),
      size: 1 + Math.round(unit(seed, 2, 0)),
      baseAlpha: 0.3 + unit(seed, 3, 0) * 0.6,
      twinklePhase: unit(seed, 4, 0),
    });
  }
  return stars;
}

// --- Hashing ----------------------------------------------------------------

function hashAtmosphere(p: Omit<AtmospherePlan, "atmosphereHash">): string {
  const content = JSON.stringify({
    sceneId: p.sceneId,
    mood: p.mood,
    reducedMotion: p.reducedMotion,
    background: p.background.stops.map((s) => [s.offset, s.color, s.alpha]),
    vignette: [p.vignette.color, p.vignette.alpha, p.vignette.strength],
    glows: p.glows.map((g) => [
      g.id, g.x, g.y, g.radius, g.color, g.alpha, g.flickerPhase, g.flickerAmount,
    ]),
    emitters: p.emitters.map((e) => [
      e.id, e.kind, e.x, e.y, e.w, e.h, e.count, e.seed,
      e.colors, e.speed, e.drift, e.sizeMin, e.sizeMax, e.alphaMin, e.alphaMax,
    ]),
    moonbeams: p.moonbeams.map((m) => [
      m.id, m.x, m.width, m.color, m.alpha, m.swayPhase,
    ]),
    stars: p.stars.map((s) => [
      s.x, s.y, s.size, s.baseAlpha, s.twinklePhase,
    ]),
    mappedEffects: p.mappedEffects,
    unmappedEffects: p.unmappedEffects,
    particleBudget: p.particleBudget,
  });
  return fnv1a(content);
}

// --- Particle kinematics (pure, deterministic) ------------------------------
//
// Animation is a pure function of absolute time: same (emitter, index, t) →
// same frame, always. The renderer advances `t` by ticker delta but never
// reseeds; reduced motion simply evaluates one fixed `t` and stops. This keeps
// the moving picture as deterministic as the static plan (QUANT-0101/0102).

/** Seconds for a particle to traverse its emitter region before looping. */
export const PARTICLE_CYCLE_SECONDS = 6;

export interface ParticleFrame {
  x: number;
  y: number;
  alpha: number;
  size: number;
  /** Index into emitter.colors. */
  colorIndex: number;
}

function frac(n: number): number {
  return n - Math.floor(n);
}

/** Smooth fade-in/out envelope over a [0,1) lifecycle. */
function lifecycleEnvelope(cycle: number): number {
  // Ramp up over the first 15%, hold, ramp down over the last 35%.
  if (cycle < 0.15) return cycle / 0.15;
  if (cycle > 0.65) return Math.max(0, (1 - cycle) / 0.35);
  return 1;
}

/**
 * Compute a single particle's frame at absolute time `timeSeconds`.
 *
 * Pure and deterministic. `timeSeconds` may be any finite number; the motion
 * loops with PARTICLE_CYCLE_SECONDS. No Math.random, no hidden state.
 */
export function computeParticleFrame(
  emitter: ParticleEmitter,
  index: number,
  timeSeconds: number,
): ParticleFrame {
  const seed = emitter.seed;
  const laneX = unit(seed, index, 0);
  const phaseOffset = unit(seed, index, 1);
  const sizeFrac = unit(seed, index, 2);
  const colorPick = unit(seed, index, 3);
  const driftPhase = unit(seed, index, 4);
  const speedJitter = 0.7 + unit(seed, index, 5) * 0.6;

  const cycle = frac(phaseOffset + timeSeconds / PARTICLE_CYCLE_SECONDS * speedJitter);

  const upward = emitter.speed >= 0;
  const y = upward
    ? (emitter.y + emitter.h) - cycle * emitter.h
    : emitter.y + cycle * emitter.h;

  const sway = Math.sin((driftPhase + cycle) * Math.PI * 2) * emitter.drift;
  const x = emitter.x + laneX * emitter.w + sway;

  const alpha = emitter.alphaMin
    + (emitter.alphaMax - emitter.alphaMin) * lifecycleEnvelope(cycle);
  const size = emitter.sizeMin + sizeFrac * (emitter.sizeMax - emitter.sizeMin);
  const colorIndex = emitter.colors.length === 0
    ? 0
    : Math.min(
        emitter.colors.length - 1,
        Math.floor(colorPick * emitter.colors.length),
      );

  return { x, y, alpha, size, colorIndex };
}

// Re-export for the renderer's per-particle deterministic streams.
export { unit as atmosphereUnit, fnv1aNum as atmosphereSeed };

export interface LightSource {
  x: number;
  y: number;
  z: number;
  intensity: number;
}

export function evaluateSceneLightingField(
  x: number,
  y: number,
  z: number,
  source: LightSource,
): number {
  const dx = x - source.x;
  const dy = y - source.y;
  const dz = z - source.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  const r0Sq = 120 * 120;
  const falloff = source.intensity / Math.max(1, distSq / r0Sq);
  const atmosphericHaze = Math.exp(-0.001 * z);
  return Math.min(1.0, falloff * atmosphericHaze);
}


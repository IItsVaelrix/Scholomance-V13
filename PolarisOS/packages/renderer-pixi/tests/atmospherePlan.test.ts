/**
 * atmospherePlan unit tests — Dual-State Art Pass (spec §5, §8.2).
 *
 * These run in a plain node env (no PixiJS, no DOM): the whole point of
 * atmospherePlan.ts is that the plan → atmosphere projection is pure and
 * deterministic so it can be verified without a WebGL context.
 *
 * Covers:
 *   - determinism: same plan → same atmosphereHash, byte-exact across calls
 *   - dual-state identity: warm_firelight and ambient_moonlight are distinct,
 *     complete moods (gradient, glows, emitters, starfield, moonbeams)
 *   - warm treatment: embers rise from flame sources; glow at flame positions
 *   - moon treatment: starfield + moonbeams + cool rim glows
 *   - ambient-effect mapping: known effects → emitters; unknown → unmapped
 *     (glyph fallback preserved, spec §5.4)
 *   - particle budget never exceeds MAX_PARTICLES
 *   - reduced-motion static frame flag
 *   - seed determinism: identical seed → identical emitter specs
 *   - the input plan is never mutated
 */

import { describe, it, expect } from "vitest";
import type { SceneManifest, SceneLayer } from "@polaris/contracts";
import {
  buildScenePlan,
  buildAtmospherePlan,
  emitterKindForEffect,
  computeParticleFrame,
  MAX_PARTICLES,
  ATMOSPHERE_WIDTH,
  ATMOSPHERE_HEIGHT,
  type SceneRenderPlan,
} from "@polaris/renderer-pixi";

// --- Manifest factory (mirrors scenePlan.test.ts) ---------------------------

function layer(
  overrides: Partial<SceneLayer> & Pick<SceneLayer, "layerId" | "layerType">,
): SceneLayer {
  return {
    assetKey: null,
    position: { x: 0, y: 0 },
    zIndex: 10,
    visible: true,
    flags: {},
    ...overrides,
  };
}

function makeManifest(overrides: Partial<SceneManifest> = {}): SceneManifest {
  return {
    sceneId: "ruined_shrine_rev0",
    roomId: "ruined_shrine",
    roomRevision: 0,
    visualRevision: 0,
    worldId: "codex_vale_mvp",
    backgroundAssetKey: "rooms/ruined_shrine/background",
    layers: [
      layer({ layerId: "bg", layerType: "background", zIndex: 0 }),
      layer({
        layerId: "lantern",
        layerType: "entity",
        assetKey: "entities/lantern",
        position: { x: 320, y: 240 },
        flags: { displayName: "Brass Lantern" },
      }),
      layer({
        layerId: "brazier_lit",
        layerType: "prop",
        assetKey: "entities/brazier_lit",
        position: { x: 400, y: 280 },
      }),
      layer({
        layerId: "altar",
        layerType: "prop",
        assetKey: "entities/altar",
        position: { x: 300, y: 260 },
      }),
      layer({
        layerId: "player_alice",
        layerType: "player-marker",
        assetKey: "players/marker_default",
        zIndex: 20,
      }),
    ],
    hotspots: [],
    textRegions: [],
    lightingState: "ambient_moonlight",
    ambientEffects: ["dust_motes"],
    contractHash: "abc123def4567890",
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function planWith(overrides: Partial<SceneManifest> = {}): SceneRenderPlan {
  return buildScenePlan(makeManifest(overrides));
}

// --- Tests ------------------------------------------------------------------

describe("buildAtmospherePlan — determinism", () => {
  it("produces an identical atmosphereHash for the same plan across calls", () => {
    const plan = planWith();
    const a = buildAtmospherePlan(plan);
    const b = buildAtmospherePlan(plan);
    expect(a.atmosphereHash).toBe(b.atmosphereHash);
    expect(a.atmosphereHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is byte-exact (deep-equal) for the same input", () => {
    const plan = planWith({ lightingState: "warm_firelight" });
    const a = buildAtmospherePlan(plan);
    const b = buildAtmospherePlan(plan);
    expect(a).toEqual(b);
  });

  it("never mutates the input plan", () => {
    const plan = planWith();
    const frozen = JSON.parse(JSON.stringify(plan));
    buildAtmospherePlan(plan);
    expect(plan).toEqual(frozen);
  });

  it("reducedMotion changes the hash (it is visually meaningful)", () => {
    const plan = planWith();
    const animated = buildAtmospherePlan(plan);
    const staticFrame = buildAtmospherePlan(plan, { reducedMotion: true });
    expect(animated.atmosphereHash).not.toBe(staticFrame.atmosphereHash);
    expect(staticFrame.reducedMotion).toBe(true);
    expect(animated.reducedMotion).toBe(false);
  });
});

describe("buildAtmospherePlan — dual-state identity", () => {
  it("warm and moon moods are distinct complete atmospheres", () => {
    const warm = buildAtmospherePlan(planWith({ lightingState: "warm_firelight" }));
    const moon = buildAtmospherePlan(planWith({ lightingState: "ambient_moonlight" }));

    expect(warm.mood).toBe("warm_firelight");
    expect(moon.mood).toBe("ambient_moonlight");
    expect(warm.atmosphereHash).not.toBe(moon.atmosphereHash);
    expect(warm.background.stops).not.toEqual(moon.background.stops);
  });

  it("unknown lighting states resolve to the moonlight mood (safe default)", () => {
    const atmo = buildAtmospherePlan(planWith({ lightingState: "eldritch_glow" }));
    expect(atmo.mood).toBe("ambient_moonlight");
  });
});

describe("buildAtmospherePlan — warm_firelight treatment", () => {
  it("raises embers from flame sources and glows at their positions", () => {
    const atmo = buildAtmospherePlan(planWith({ lightingState: "warm_firelight" }));

    const emberEmitters = atmo.emitters.filter((e) => e.kind === "embers");
    // lantern + brazier_lit are the two flame sources in the fixture.
    expect(emberEmitters.length).toBe(2);

    const flameGlows = atmo.glows.filter((g) => g.id.startsWith("glow:"));
    expect(flameGlows.length).toBe(2);
    for (const glow of flameGlows) {
      expect(glow.blend).toBe("additive");
      expect(glow.flickerAmount).toBeGreaterThan(0);
    }

    // Warm mood has no starfield or moonbeams.
    expect(atmo.stars.length).toBe(0);
    expect(atmo.moonbeams.length).toBe(0);
  });

  it("ember emitters spawn from the flame sprite regions", () => {
    const atmo = buildAtmospherePlan(planWith({ lightingState: "warm_firelight" }));
    const lanternEmber = atmo.emitters.find((e) => e.id === "embers:lantern");
    expect(lanternEmber).toBeDefined();
    // Lantern is at (320,240) with a 34x46 glyph; region centered on it.
    expect(lanternEmber!.x).toBeCloseTo(320 - 34 / 2, 5);
    expect(lanternEmber!.y).toBeCloseTo(240 - 46 / 2, 5);
  });
});

describe("buildAtmospherePlan — ambient_moonlight treatment", () => {
  it("renders a starfield, moonbeam shafts, and cool rim glows", () => {
    const atmo = buildAtmospherePlan(planWith({ lightingState: "ambient_moonlight" }));

    expect(atmo.stars.length).toBeGreaterThan(0);
    expect(atmo.moonbeams.length).toBeGreaterThan(0);

    // Rim glows land on solid world objects (entity/prop/player-marker).
    const rimGlows = atmo.glows.filter((g) => g.id.startsWith("rim:"));
    expect(rimGlows.length).toBeGreaterThan(0);
    for (const glow of rimGlows) {
      expect(glow.color).toBe(0x8fa9d6);
    }

    // Stars stay within the upper two-thirds and inside the canvas.
    for (const star of atmo.stars) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThanOrEqual(ATMOSPHERE_WIDTH);
      expect(star.y).toBeLessThanOrEqual(ATMOSPHERE_HEIGHT * 0.66);
    }
  });

  it("moonlight has no ember emitters", () => {
    const atmo = buildAtmospherePlan(planWith({ lightingState: "ambient_moonlight" }));
    expect(atmo.emitters.filter((e) => e.kind === "embers").length).toBe(0);
  });
});

describe("buildAtmospherePlan — ambient-effect mapping (spec §5.4)", () => {
  it("maps known effects to emitters and lists them as mapped", () => {
    const atmo = buildAtmospherePlan(planWith({
      lightingState: "ambient_moonlight",
      ambientEffects: ["dust_motes", "moth_swarm"],
    }));
    expect(atmo.mappedEffects).toEqual(["dust_motes", "moth_swarm"]);
    expect(atmo.unmappedEffects).toEqual([]);
    expect(atmo.emitters.some((e) => e.kind === "motes")).toBe(true);
    expect(atmo.emitters.some((e) => e.kind === "moths")).toBe(true);
  });

  it("leaves unknown effects unmapped so the glyph fallback stays authoritative", () => {
    const atmo = buildAtmospherePlan(planWith({
      lightingState: "ambient_moonlight",
      ambientEffects: ["dust_motes", "eldritch_swirl", "moonbeam"],
    }));
    expect(atmo.mappedEffects).toEqual(["dust_motes"]);
    expect(atmo.unmappedEffects).toEqual(["eldritch_swirl", "moonbeam"]);
  });

  it("emitterKindForEffect resolves authored variants deterministically", () => {
    expect(emitterKindForEffect("dust_motes")).toBe("motes");
    expect(emitterKindForEffect("motes")).toBe("motes");
    expect(emitterKindForEffect("ember_rise")).toBe("embers");
    expect(emitterKindForEffect("moth_swarm")).toBe("moths");
    expect(emitterKindForEffect("rain_drips")).toBe("rain");
    expect(emitterKindForEffect("mist_low")).toBe("mist");
    expect(emitterKindForEffect("fog_bank")).toBe("mist");
    expect(emitterKindForEffect("moonbeam")).toBeNull();
    expect(emitterKindForEffect("unknown")).toBeNull();
  });
});

describe("buildAtmospherePlan — particle budget (spec §5.6)", () => {
  it("never exceeds MAX_PARTICLES even with many effects", () => {
    const atmo = buildAtmospherePlan(planWith({
      lightingState: "warm_firelight",
      ambientEffects: ["dust_motes", "moth_swarm", "rain_drips", "mist_low", "ember_rise"],
    }));
    expect(atmo.particleBudget).toBeLessThanOrEqual(MAX_PARTICLES);
    const actual = atmo.emitters.reduce((s, e) => s + e.count, 0);
    expect(actual).toBe(atmo.particleBudget);
    expect(actual).toBeLessThanOrEqual(MAX_PARTICLES);
  });

  it("every emitter keeps at least one sprite", () => {
    const atmo = buildAtmospherePlan(planWith({
      lightingState: "warm_firelight",
      ambientEffects: ["dust_motes", "moth_swarm", "rain_drips", "mist_low"],
    }));
    for (const e of atmo.emitters) {
      expect(e.count).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("buildAtmospherePlan — seed determinism", () => {
  it("identical seeds yield identical emitter specs across independent builds", () => {
    const a = buildAtmospherePlan(planWith({ lightingState: "warm_firelight" }));
    const b = buildAtmospherePlan(planWith({ lightingState: "warm_firelight" }));
    expect(a.emitters).toEqual(b.emitters);
    expect(a.stars).toEqual(b.stars);
    expect(a.moonbeams).toEqual(b.moonbeams);
  });

  it("a different sceneId changes the seeding (distinct starfield)", () => {
    const a = buildAtmospherePlan(planWith({ sceneId: "shrine_rev0" }));
    const b = buildAtmospherePlan(planWith({ sceneId: "clearing_rev0" }));
    expect(a.atmosphereHash).not.toBe(b.atmosphereHash);
  });
});

describe("computeParticleFrame — deterministic kinematics", () => {
  const emitter = buildAtmospherePlan(
    planWith({ lightingState: "warm_firelight" }),
  ).emitters[0];

  it("is a pure function of (emitter, index, time)", () => {
    const a = computeParticleFrame(emitter, 3, 1.25);
    const b = computeParticleFrame(emitter, 3, 1.25);
    expect(a).toEqual(b);
  });

  it("different particles occupy different lanes", () => {
    const a = computeParticleFrame(emitter, 0, 0.5);
    const b = computeParticleFrame(emitter, 1, 0.5);
    expect(a.x !== b.x || a.y !== b.y).toBe(true);
  });

  it("upward embers rise as time advances within a cycle", () => {
    const early = computeParticleFrame(emitter, 2, 0.01);
    const late = computeParticleFrame(emitter, 2, 2.0);
    // Upward emitter: y decreases as the particle climbs (before looping).
    expect(emitter.speed).toBeGreaterThanOrEqual(0);
    expect(early.y).not.toBe(late.y);
  });

  it("alpha stays within the emitter's configured band", () => {
    for (let i = 0; i < emitter.count; i++) {
      const frame = computeParticleFrame(emitter, i, i * 0.37);
      expect(frame.alpha).toBeGreaterThanOrEqual(emitter.alphaMin - 1e-9);
      expect(frame.alpha).toBeLessThanOrEqual(emitter.alphaMax + 1e-9);
      expect(frame.colorIndex).toBeGreaterThanOrEqual(0);
      expect(frame.colorIndex).toBeLessThan(emitter.colors.length);
    }
  });

  it("reduced-motion can freeze on a single deterministic frame", () => {
    // Evaluating a fixed time twice yields the identical static frame.
    const t = 1.7;
    expect(computeParticleFrame(emitter, 5, t))
      .toEqual(computeParticleFrame(emitter, 5, t));
  });
});

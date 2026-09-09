import { describe, expect, it } from 'vitest';

import createTutorialForestScene from '../../../src/game/tutorial-forest/phaser/TutorialForestScene.js';
import { buildTutorialForestWorld } from '../../../src/game/tutorial-forest/world/tutorialForestBuilder.js';
import { FOLIAGE_WIND_FRAG_SRC } from '../../../src/game/tutorial-forest/shaders/FoliageWindShader.js';
import {
  createWindField,
  sampleWindLean,
} from '../../../src/game/tutorial-forest/world/windField.js';

// A tree sprite pivoting about its trunk base. `origin` is the Phaser display
// origin both spawn paths set (0.5, 0.95 in renderTrees, descriptor.asset.anchor
// in renderEnvironmentActors), so the planted point is origin * size.
function treeObject(x, y, width, height, originX, originY) {
  return {
    x,
    y,
    width,
    height,
    angle: 0,
    active: true,
    origin: [originX, originY],
    texture: { key: 'tree_sentinel_frostpine' },
    setOrigin(ox, oy) { this.origin = [ox, oy]; return this; },
    setDepth() { return this; },
    setInteractive() { return this; },
    on() { return this; },
    setAngle(angle) { this.angle = angle; return this; },
    setX(nextX) { this.x = nextX; return this; },
    setY(nextY) { this.y = nextY; return this; },
    destroy() { this.active = false; },
  };
}

// World position of a point at normalized sprite coords (nx, ny), given the
// sprite's live transform. Phaser places the display origin at (x, y) and
// rotates the quad about it, so the offset from the origin is rotated in place.
function pointOnSprite(sprite, nx, ny) {
  const [ox, oy] = sprite.origin;
  const localX = (nx - ox) * sprite.width;
  const localY = (ny - oy) * sprite.height;
  const radians = (sprite.angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: sprite.x + localX * cos - localY * sin,
    y: sprite.y + localX * sin + localY * cos,
  };
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function fakeRuntime(handlers) {
  return {
    Scene: class {
      constructor() {
        this.imageCalls = [];
        this.add = {
          image: (x, y, key) => {
            const object = key && key.startsWith('tree_')
              ? treeObject(x, y, 70, 96, 0.5, 0.95)
              : treeObject(x, y, 80, 40, 0.5, 0.5);
            object.texture = { key };
            this.imageCalls.push(object);
            return object;
          },
          sprite: (x, y, key) => this.add.image(x, y, key),
          circle: (x, y) => this.add.image(x, y, null),
        };
        this.events = {
          on(event, callback) { handlers[event] = callback; },
          emit() {},
        };
        this.tweens = { add() {} };
      }
    },
  };
}

function buildScene() {
  const handlers = {};
  const RuntimeScene = createTutorialForestScene(fakeRuntime(handlers));
  const scene = new RuntimeScene();
  scene.init({ seed: 4242, particlesEnabled: false, glowEnabled: false });
  scene.world = buildTutorialForestWorld(4242);
  scene.tileW = 80;
  scene.tileH = 40;
  // renderTrees() reads world.trees and toIso only; setupWindSway optional-chains
  // every manifest field, so no texture upload is needed to exercise the sway.
  return { scene, handlers };
}

describe('Foliage wind sway keeps trunks planted and moves the crown', () => {
  it('rotates about the trunk base instead of translating the whole sprite', () => {
    const { scene, handlers } = buildScene();
    scene.renderTrees();
    scene.windEnabled = true;
    scene.setupWindSway();

    expect(scene.treeSprites.length).toBeGreaterThan(0);
    expect(handlers.update).toBeTypeOf('function');

    const trees = scene.treeSprites.map((item) => item.sprite);
    const plantedX = trees.map((sprite) => sprite.x);
    const plantedY = trees.map((sprite) => sprite.y);
    // Rest pose reference points: the planted pivot, the trunk base just below
    // it, and the crown at the top of the sprite.
    const pivots = trees.map((sprite) => pointOnSprite(sprite, ...sprite.origin));
    const trunkBases = trees.map((sprite) => pointOnSprite(sprite, 0.5, 1));
    const crowns = trees.map((sprite) => pointOnSprite(sprite, 0.5, 0));

    const anglesSeen = new Set();
    let maxTrunkDrift = 0;
    let maxCrownSweep = 0;
    for (let time = 0; time <= 6000; time += 120) {
      handlers.update(time);
      trees.forEach((sprite, index) => {
        // The sprite position is never touched: sway is a pure rotation.
        expect(sprite.x).toBe(plantedX[index]);
        expect(sprite.y).toBe(plantedY[index]);
        expect(Number.isNaN(sprite.angle)).toBe(false);

        // The pivot the trunk is planted on does not move at all.
        const pivot = pointOnSprite(sprite, ...sprite.origin);
        expect(pivot.x).toBeCloseTo(pivots[index].x, 9);
        expect(pivot.y).toBeCloseTo(pivots[index].y, 9);

        maxTrunkDrift = Math.max(maxTrunkDrift, distance(pointOnSprite(sprite, 0.5, 1), trunkBases[index]));
        maxCrownSweep = Math.max(maxCrownSweep, distance(pointOnSprite(sprite, 0.5, 0), crowns[index]));
        anglesSeen.add(sprite.angle);
      });
    }

    // The crown drifts through several distinct quantized states. Subtle wind
    // means few states, but more than one: a frozen canopy would be dead air.
    expect(anglesSeen.size).toBeGreaterThanOrEqual(2);
    // Trunks stay sturdy: the base sits 5% of sprite height from the pivot and
    // the crown 95%, so their sweep ratio is 19:1 — the crown drifts about a
    // pixel while the roots do not visibly move at all.
    expect(maxTrunkDrift).toBeLessThan(0.1);
    expect(maxCrownSweep).toBeGreaterThan(0.5);
    expect(maxCrownSweep).toBeLessThan(2);
    expect(maxCrownSweep).toBeGreaterThan(maxTrunkDrift * 15);
  });

  it('bounds the sweep and snaps to pixel-art angle steps', () => {
    const { scene, handlers } = buildScene();
    scene.renderTrees();
    scene.windEnabled = true;
    scene.setupWindSway();

    const trees = scene.treeSprites.map((item) => item.sprite);
    for (let time = 0; time <= 12000; time += 37) {
      handlers.update(time);
      for (const sprite of trees) {
        expect(Math.abs(sprite.angle)).toBeLessThanOrEqual(1.0);
        // Quantized to 0.25 degree steps so sub-pixel rotation never smears.
        expect(Math.abs(sprite.angle % 0.25)).toBeCloseTo(0, 6);
      }
    }
  });

  it('never produces NaN for trees registered without a baseX', () => {
    const { scene, handlers } = buildScene();
    scene.renderTrees();
    scene.windEnabled = true;
    scene.setupWindSway();

    // renderTrees() registers { sprite, originAngle, phase } with no baseX. The
    // old translation path computed undefined + sway and pushed NaN into setX.
    for (const item of scene.treeSprites) {
      expect(item.baseX).toBeUndefined();
    }

    handlers.update(1234);
    for (const item of scene.treeSprites) {
      expect(Number.isNaN(item.sprite.x)).toBe(false);
      expect(Number.isNaN(item.sprite.angle)).toBe(false);
    }
  });

  it('restores the planted angle when wind is disabled without moving the trunk', () => {
    const { scene, handlers } = buildScene();
    scene.renderTrees();
    scene.windEnabled = true;
    scene.setupWindSway();

    const trees = scene.treeSprites.map((item) => item.sprite);
    const plantedX = trees.map((sprite) => sprite.x);

    handlers.update(900);
    scene.setWindEnabled(false);

    trees.forEach((sprite, index) => {
      expect(sprite.angle).toBe(0);
      expect(sprite.x).toBe(plantedX[index]);
    });
  });

  it('leaves GPU-driven canopies to the shader', () => {
    const { scene, handlers } = buildScene();
    scene.renderTrees();
    scene.windEnabled = true;
    scene.setupWindSway();

    const driven = scene.treeSprites[0];
    driven.shaderDriven = true;
    driven.sprite.setAngle(0);

    handlers.update(2000);
    expect(driven.sprite.angle).toBe(0);
  });

  it('leans every tree the same direction at the same instant', () => {
    const { scene, handlers } = buildScene();
    scene.renderTrees();
    scene.windEnabled = true;
    scene.setupWindSway();

    // The whole forest must read as one wind. Sampling many instants across the
    // gust cycle, every tree's lean must share a single sign — a private per-tree
    // oscillator phase would put neighbours on opposite sides constantly.
    const trees = scene.treeSprites.map((item) => item.sprite);
    expect(trees.length).toBeGreaterThan(1);

    for (let time = 0; time <= 20000; time += 97) {
      handlers.update(time);
      const signs = new Set(trees.map((sprite) => Math.sign(sprite.angle)));
      expect(signs.size).toBe(1);
    }
  });

  it('carries no per-tree oscillator phase', () => {
    const { scene } = buildScene();
    scene.renderTrees();

    // Trees carry tile coords for the SHARED traveling gust wave, never a phase
    // of their own. This is the regression guard for `tx * 0.4 + ty * 0.7`.
    for (const item of scene.treeSprites) {
      expect(item.phase).toBeUndefined();
      expect(Number.isFinite(item.tx)).toBe(true);
      expect(Number.isFinite(item.ty)).toBe(true);
    }
  });

  it('turns every tree together when the wind direction changes', () => {
    const { scene, handlers } = buildScene();
    scene.renderTrees();
    scene.windEnabled = true;
    scene.setupWindSway();

    const trees = scene.treeSprites.map((item) => item.sprite);

    scene.setWindDirection('WEST');
    handlers.update(1000);
    const westAngles = trees.map((sprite) => sprite.angle);
    expect(westAngles.every((angle) => angle < 0)).toBe(true);

    scene.setWindDirection('EAST');
    handlers.update(1000);
    const eastAngles = trees.map((sprite) => sprite.angle);
    expect(eastAngles.every((angle) => angle > 0)).toBe(true);

    // Same instant, opposite wind: the forest mirrored as a single system.
    expect(scene.windField.direction).toBe('east');
  });

  it('never lets a gust swing the canopy past vertical', () => {
    const field = createWindField({ direction: 'WEST' });

    // Invariant: gustAmplitude is clamped below meanLean, so the lean sign is
    // constant for every tile and every instant. Trees breathe; they do not
    // rock back and forth through upright.
    expect(field.gustAmplitudeDeg).toBeLessThan(field.meanLeanDeg);
    for (let time = 0; time <= 60000; time += 53) {
      for (let tx = 0; tx < 24; tx += 3) {
        for (let ty = 0; ty < 24; ty += 3) {
          expect(Math.sign(sampleWindLean(field, time, tx, ty))).toBe(-1);
        }
      }
    }
  });

  it('keeps neighbouring trees nearly in phase across the gust wave', () => {
    const field = createWindField({ direction: 'WEST' });

    // Analytic bound: one tile of separation shifts the wave phase by
    // TAU / wavelengthTiles, so the largest possible lean difference between
    // neighbours is gustAmplitude * TAU / wavelengthTiles. Tying the assertion to
    // the model keeps it honest if the wavelength or amplitude is retuned.
    const neighbourBound = field.gustAmplitudeDeg * (Math.PI * 2) / field.wavelengthTiles;
    const gustRange = 2 * field.gustAmplitudeDeg;
    // Adjacent trees stay within a small fraction of the full gust swing, so the
    // forest reads as one coherent body of moving air.
    expect(neighbourBound).toBeLessThan(gustRange * 0.25);

    let maxNeighbourDelta = 0;
    let maxHalfWaveDelta = 0;
    for (let time = 0; time <= 20000; time += 211) {
      const a = sampleWindLean(field, time, 8, 8);
      const b = sampleWindLean(field, time, 9, 8);
      maxNeighbourDelta = Math.max(maxNeighbourDelta, Math.abs(a - b));
      // Half a wavelength away the wave is in antiphase: the gust really travels.
      const far = sampleWindLean(field, time, 8 + field.wavelengthTiles / 2, 8);
      maxHalfWaveDelta = Math.max(maxHalfWaveDelta, Math.abs(a - far));
    }

    expect(maxNeighbourDelta).toBeLessThanOrEqual(neighbourBound + 1e-9);
    expect(maxHalfWaveDelta).toBeGreaterThan(maxNeighbourDelta * 3);
  });

  it('attenuates shader displacement to zero at the trunk base', () => {
    // Phaser uploads textures with UNPACK_FLIP_Y_WEBGL = true, so uv.y = 1 is the
    // top of the sprite (crown) and uv.y = 0 is the bottom (trunk base). The
    // height factor must therefore vanish at uv.y = 0 and peak at uv.y = 1.
    expect(FOLIAGE_WIND_FRAG_SRC).toContain('pow(h, 1.8)');
    const heightFactor = (uvY) => Math.pow(Math.min(Math.max(uvY, 0), 1), 1.8);
    expect(heightFactor(0)).toBe(0);
    expect(heightFactor(1)).toBe(1);
    expect(heightFactor(0.5)).toBeLessThan(0.4);

    // Out-of-bounds samples clamp rather than discard, so the crown silhouette is
    // not chewed away at peak gust.
    expect(FOLIAGE_WIND_FRAG_SRC).toContain('clamp(displacedUV');
    expect(FOLIAGE_WIND_FRAG_SRC).not.toContain('gl_FragColor = vec4(0.0)');
  });

  it('drives the shader from the shared field with no per-tree phase uniform', () => {
    // The GPU path must lean with the rest of the forest. uWindLean is sampled
    // from the one shared field; the old per-tree uPhase uniform is gone, because
    // it gave every canopy a private clock and desynchronised neighbours.
    expect(FOLIAGE_WIND_FRAG_SRC).toContain('uniform float uWindLean;');
    expect(FOLIAGE_WIND_FRAG_SRC).not.toContain('uPhase');
    expect(FOLIAGE_WIND_FRAG_SRC).toContain('uWindLean * heightFactor');

    // Leaf shimmer stays sub-pixel and well below the coherent lean term.
    expect(FOLIAGE_WIND_FRAG_SRC).toContain('0.004 * heightFactor');
  });
});

import { describe, expect, it } from 'vitest';

import {
  buildTutorialForestAssets,
  releaseTutorialForestAssets,
} from '../../../src/game/tutorial-forest/generators/TutorialForestAssetBridge.js';
import createTutorialForestScene from '../../../src/game/tutorial-forest/phaser/TutorialForestScene.js';
import { buildTutorialForestWorld } from '../../../src/game/tutorial-forest/world/tutorialForestBuilder.js';

function displayObject(x, y, textureKey = null) {
  return {
    x,
    y,
    active: true,
    alpha: 1,
    texture: textureKey ? { key: textureKey } : null,
    setOrigin(originX, originY) { this.origin = [originX, originY]; return this; },
    setDepth(depth) { this.depth = depth; return this; },
    setInteractive() { return this; },
    on() { return this; },
    play() { return this; },
    setAngle(angle) { this.angle = angle; return this; },
    setX(nextX) { this.x = nextX; return this; },
    setVisible(visible) { this.visible = visible; return this; },
    setTexture(key) { this.texture = { key }; return this; },
    destroy() { this.active = false; },
  };
}

class FakeTextureManager {
  constructor() {
    this.textures = new Map();
    this.created = [];
    this.removed = [];
  }

  exists(key) { return this.textures.has(key); }
  get(key) { return this.textures.get(key); }

  createCanvas(key, width, height) {
    const context = {
      imageSmoothingEnabled: true,
      createImageData: (imageWidth, imageHeight) => ({
        data: new Uint8ClampedArray(imageWidth * imageHeight * 4),
      }),
      putImageData: (imageData) => { context.lastImageData = imageData; },
    };
    const texture = { key, width, height, context, getContext: () => context, refresh() {} };
    this.textures.set(key, texture);
    this.created.push(texture);
    return texture;
  }

  remove(key) {
    this.removed.push(key);
    this.textures.delete(key);
  }
}

function fakeBridgeScene() {
  return {
    textures: new FakeTextureManager(),
    anims: {
      entries: new Set(),
      exists(key) { return this.entries.has(key); },
      create({ key }) { this.entries.add(key); },
    },
  };
}

function fakeRuntime() {
  return {
    Scene: class {
      constructor() {
        this.imageCalls = [];
        this.circleCalls = [];
        this.add = {
          image: (x, y, key) => {
            const object = displayObject(x, y, key);
            this.imageCalls.push(object);
            return object;
          },
          sprite: (x, y, key) => {
            const object = displayObject(x, y, key);
            this.imageCalls.push(object);
            return object;
          },
          circle: (x, y) => {
            const object = displayObject(x, y);
            this.circleCalls.push(object);
            return object;
          },
        };
        this.events = { on() {}, emit() {} };
        this.tweens = { add() {} };
      }
    },
  };
}

describe('Tutorial Forest continuous-region Phaser integration', () => {
  it('catches per-tile asset registration and smoothed RGBA upload', () => {
    const scene = fakeBridgeScene();
    const world = buildTutorialForestWorld(4242);
    const manifest = buildTutorialForestAssets(scene, world, { seed: 4242 });
    const groundTexture = scene.textures.get(manifest.ground.textureKey);

    expect(manifest.contract).toBe('PB-TUTORIAL-FOREST-ASSET-MANIFEST-v1');
    expect(manifest.actors).toHaveLength(manifest.environment.actors.length);
    expect(groundTexture.context.imageSmoothingEnabled).toBe(false);
    expect(scene.textures.created).toHaveLength(1 + manifest.actors.length + 6);
    expect(scene.textures.created.some(({ key }) => key.startsWith('grass_'))).toBe(false);
    expect(scene.textures.created.some(({ key }) => key.startsWith('water_'))).toBe(false);
  });

  it('catches generated texture leaks during deterministic reseeding', () => {
    const scene = fakeBridgeScene();
    const world = buildTutorialForestWorld(4242);
    const first = buildTutorialForestAssets(scene, world, { seed: 4242 });
    const firstBytes = new Uint8ClampedArray(
      scene.textures.get(first.ground.textureKey).context.lastImageData.data,
    );

    releaseTutorialForestAssets(scene, first);
    expect(scene.textures.exists(first.ground.textureKey)).toBe(false);
    expect(scene.textures.exists('player_idle_0')).toBe(true);

    const repeat = buildTutorialForestAssets(scene, world, { seed: 4242 });
    expect(repeat.ground.textureKey).toBe(first.ground.textureKey);
    expect(Buffer.from(scene.textures.get(repeat.ground.textureKey).context.lastImageData.data)
      .equals(Buffer.from(firstBytes))).toBe(true);

    releaseTutorialForestAssets(scene, repeat);
    const alternate = buildTutorialForestAssets(scene, buildTutorialForestWorld(4243), { seed: 4243 });
    expect(alternate.ground.textureKey).not.toBe(first.ground.textureKey);
    expect(scene.textures.removed).toContain(first.ground.textureKey);
  });

  it('catches multiple ground sprites or actors bypassing the Forge manifest', () => {
    const RuntimeScene = createTutorialForestScene(fakeRuntime());
    const scene = new RuntimeScene();
    scene.init({ seed: 4242, particlesEnabled: false, glowEnabled: false });
    scene.world = buildTutorialForestWorld(4242);
    scene.tileW = 80;
    scene.tileH = 40;
    scene.assetManifest = buildTutorialForestAssets(fakeBridgeScene(), scene.world, { seed: 4242 });

    scene.renderGroundRegion();
    scene.renderEnvironmentActors();

    const groundImages = scene.imageCalls.filter(({ texture }) => (
      texture?.key === scene.assetManifest.ground.textureKey
    ));
    expect(groundImages).toHaveLength(1);
    expect(groundImages[0].origin).toEqual([0, 0]);
    expect(scene.environmentSprites).toHaveLength(scene.assetManifest.actors.length);
  });

  it('catches ambient particles depending on Math.random', () => {
    const RuntimeScene = createTutorialForestScene(fakeRuntime());
    const makeParticles = () => {
      const scene = new RuntimeScene();
      scene.init({ seed: 2024, particlesEnabled: true });
      scene.world = buildTutorialForestWorld(2024);
      scene.tileW = 80;
      scene.tileH = 40;
      scene.setupAtmosphericParticles();
      return scene.particles.map(({ baseX, baseY, phase, speedX, speedY }) => (
        [baseX, baseY, phase, speedX, speedY]
      ));
    };

    expect(makeParticles()).toEqual(makeParticles());
  });
});

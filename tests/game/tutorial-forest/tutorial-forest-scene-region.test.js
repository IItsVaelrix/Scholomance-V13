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
    // ground + actors + 6 player frames + the water-silhouette mask texture
    expect(scene.textures.created)
      .toHaveLength(1 + manifest.actors.length + manifest.player.textureKeys.length + (manifest.ground.waterMaskKey ? 1 : 0));
    expect(scene.textures.get(manifest.ground.waterMaskKey)).toBeTruthy();
    expect(scene.textures.created.some(({ key }) => key.startsWith('grass_'))).toBe(false);
    expect(scene.textures.created.some(({ key }) => key.startsWith('water_'))).toBe(false);
  }, 30000);

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

  it('catches reflection plates missing any pond edge', () => {
    const RuntimeScene = createTutorialForestScene(fakeRuntime());
    const scene = new RuntimeScene();
    scene.init({ seed: 4242 });
    scene.world = buildTutorialForestWorld(4242);
    scene.tileW = 80;
    scene.tileH = 40;
    scene.computeReflectionPlates();

    // The pond (tx 11..16, ty 5..10) must be ringed on every side: north, west,
    // east and south shores all carry activation plates.
    expect(scene.reflectionPlates.has('12,4')).toBe(true); // north shore
    expect(scene.reflectionPlates.has('10,7')).toBe(true); // west shore
    expect(scene.reflectionPlates.has('17,7')).toBe(true); // east shore
    expect(scene.reflectionPlates.has('13,11')).toBe(true); // south shore
    expect(scene.reflectionPlates.has('13,7')).toBe(false); // open water: no plate
  });

  it('catches mirror parity ignoring gaze or water side', () => {
    const RuntimeScene = createTutorialForestScene(fakeRuntime());
    const scene = new RuntimeScene();
    scene.init({ seed: 4242 });
    scene.world = buildTutorialForestWorld(4242);
    scene.tileW = 80;
    scene.tileH = 40;
    scene.assetManifest = buildTutorialForestAssets(fakeBridgeScene(), scene.world, { seed: 4242 });
    scene.computeReflectionPlates();

    // North shore, gaze toward the pond => front view, water screen-below.
    scene.playerPos = { tx: 12, ty: 4 };
    scene.playerFacing = { dx: 0, dy: 1 };
    scene.player = { width: 32, height: 48, x: 0, y: 0, texture: { key: 'player_idle_0' } };
    scene.waterShader = { setTextures: () => {} };
    scene.updateWaterReflection();
    expect(scene.waterReflection.enabled).toBe(true);
    expect(scene.waterReflection.back).toBe(false);
    expect(scene.waterReflection.flip).toBe(true);

    // Same plate, gaze turned away => the pond reflects the Wanderer's back.
    scene.playerFacing = { dx: 0, dy: -1 };
    scene.updateWaterReflection();
    expect(scene.waterReflection.enabled).toBe(true);
    expect(scene.waterReflection.back).toBe(true);

    // South shore: pond lies screen-above, parity carried upright.
    scene.playerPos = { tx: 13, ty: 11 };
    scene.playerFacing = { dx: 0, dy: -1 };
    scene.updateWaterReflection();
    expect(scene.waterReflection.enabled).toBe(true);
    expect(scene.waterReflection.flip).toBe(false);

    // Far from the pond: no plate, no mirror.
    scene.playerPos = { tx: 6, ty: 17 };
    scene.updateWaterReflection();
    expect(scene.waterReflection.enabled).toBe(false);
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

  it('catches keyboard navigation mapping W/A/S/D to canonical facing and isometric deltas', () => {
    const RuntimeScene = createTutorialForestScene(fakeRuntime());
    const scene = new RuntimeScene();
    scene.init({ seed: 4242 });
    scene.world = buildTutorialForestWorld(4242);
    scene.tileW = 80;
    scene.tileH = 40;

    scene.wasdKeys = {
      W: { isDown: false },
      A: { isDown: false },
      S: { isDown: false },
      D: { isDown: false },
    };
    scene.cursors = {
      up: { isDown: false },
      down: { isDown: false },
      left: { isDown: false },
      right: { isDown: false },
    };

    // W -> North, (-1, -1)
    scene.wasdKeys.W.isDown = true;
    let req = scene.getKeyboardMovementRequest();
    expect(req).toEqual({ dtx: -1, dty: -1, dir: 'north', inputX: 0, inputY: -1 });
    scene.wasdKeys.W.isDown = false;

    // S -> South, (+1, +1)
    scene.wasdKeys.S.isDown = true;
    req = scene.getKeyboardMovementRequest();
    expect(req).toEqual({ dtx: 1, dty: 1, dir: 'south', inputX: 0, inputY: 1 });
    scene.wasdKeys.S.isDown = false;

    // D -> East, (+1, -1)
    scene.wasdKeys.D.isDown = true;
    req = scene.getKeyboardMovementRequest();
    expect(req).toEqual({ dtx: 1, dty: -1, dir: 'east', inputX: 1, inputY: 0 });
    scene.wasdKeys.D.isDown = false;

    // A -> West, (-1, +1)
    scene.wasdKeys.A.isDown = true;
    req = scene.getKeyboardMovementRequest();
    expect(req).toEqual({ dtx: -1, dty: 1, dir: 'west', inputX: -1, inputY: 0 });
    scene.wasdKeys.A.isDown = false;

    // S+D -> East (down-right), (+1, 0)
    scene.wasdKeys.S.isDown = true;
    scene.wasdKeys.D.isDown = true;
    req = scene.getKeyboardMovementRequest();
    expect(req).toEqual({ dtx: 1, dty: 0, dir: 'east', inputX: 1, inputY: 1 });
  });

  it('catches continuous WASD walking parity with click-to-walk paths without idle flickering', () => {
    const RuntimeScene = createTutorialForestScene(fakeRuntime());
    const scene = new RuntimeScene();
    scene.init({ seed: 4242 });
    scene.world = buildTutorialForestWorld(4242);
    scene.tileW = 80;
    scene.tileH = 40;
    scene.playerPos = { tx: 6, ty: 6 };

    // WASD path resolution uses findGridPath, guaranteeing same tile progression as clicking
    const req = { dtx: -1, dty: -1, dir: 'north', inputX: 0, inputY: -1 };
    const resolvedPath = scene.resolveKeyboardPath(req);
    expect(resolvedPath).not.toBeNull();
    expect(resolvedPath.length).toBeGreaterThan(0);

    // Every step in the resolved path must be an adjacent grid step (delta of 1 tile)
    let current = { ...scene.playerPos };
    for (const step of resolvedPath) {
      const dist = Math.abs(step.tx - current.tx) + Math.abs(step.ty - current.ty);
      expect(dist).toBe(1);
      current = { tx: step.tx, ty: step.ty };
    }
    expect(current).toEqual({ tx: 5, ty: 5 });
  });

  it('catches free-roam velocity movement walking straight up and down without grid zig-zagging', () => {
    const RuntimeScene = createTutorialForestScene(fakeRuntime());
    const scene = new RuntimeScene();
    scene.init({ seed: 4242 });
    scene.world = buildTutorialForestWorld(4242);
    scene.tileW = 80;
    scene.tileH = 40;
    scene.player = { x: 0, y: 400, setDepth() {}, play() {}, anims: null };
    scene.wasdKeys = {
      W: { isDown: false },
      A: { isDown: false },
      S: { isDown: false },
      D: { isDown: false },
    };
    scene.cursors = {
      up: { isDown: false },
      down: { isDown: false },
      left: { isDown: false },
      right: { isDown: false },
    };

    // 1. Walk straight UP (W key): player.y decreases, player.x remains exactly 0 (no zig-zag!)
    scene.wasdKeys.W.isDown = true;
    scene.updateLocomotion(100); // 100ms
    expect(scene.player.x).toBe(0);
    expect(scene.player.y).toBeLessThan(400);
    expect(scene.playerDirection).toBe('north');
    expect(scene.isWalking).toBe(true);
    scene.wasdKeys.W.isDown = false;

    // 2. Walk straight DOWN (S key): player.y increases, player.x remains exactly 0 (no zig-zag!)
    const currentY = scene.player.y;
    scene.wasdKeys.S.isDown = true;
    scene.updateLocomotion(100);
    expect(scene.player.x).toBe(0);
    expect(scene.player.y).toBeGreaterThan(currentY);
    expect(scene.playerDirection).toBe('south');
    expect(scene.isWalking).toBe(true);
    scene.wasdKeys.S.isDown = false;

    // 3. Releasing keys settles into idle pose
    scene.updateLocomotion(16);
    expect(scene.isWalking).toBe(false);
  });
});

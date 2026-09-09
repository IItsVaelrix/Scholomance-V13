/**
 * Tutorial Forest — Phaser texture bridge for Tile Forge region output.
 *
 * The environment enters Phaser as one continuous ground fabric plus separate
 * depth-sortable actors. The SCDL player remains an independent character asset.
 */

import { compileCharacterModel } from '../scdl/scdlCharacterCompiler.js';
import { forgeTutorialForestEnvironment } from './TutorialForestForgeAdapter.js';

export const TUTORIAL_FOREST_ASSET_MANIFEST_CONTRACT = 'PB-TUTORIAL-FOREST-ASSET-MANIFEST-v1';

function hexToRgb(hex) {
  const clean = String(hex).replace('#', '').padEnd(6, '0');
  return {
    r: Number.parseInt(clean.slice(0, 2), 16) || 0,
    g: Number.parseInt(clean.slice(2, 4), 16) || 0,
    b: Number.parseInt(clean.slice(4, 6), 16) || 0,
  };
}

function uploadCellsToPhaserTexture(scene, key, width, height, cells) {
  if (scene.textures.exists(key)) return scene.textures.get(key);
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return null;
  const context = texture.getContext();
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  const imageData = context.createImageData(width, height);
  imageData.data.fill(0);

  for (const cell of cells) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) continue;
    const offset = (cell.y * width + cell.x) * 4;
    const { r, g, b } = hexToRgb(cell.color);
    imageData.data[offset] = r;
    imageData.data[offset + 1] = g;
    imageData.data[offset + 2] = b;
    imageData.data[offset + 3] = cell.alpha ?? 255;
  }

  context.putImageData(imageData, 0, 0);
  texture.refresh();
  return texture;
}

/**
 * Upload a deterministic RGBA buffer without interpolation.
 */
export function uploadRgbaToPhaserTexture(scene, key, asset) {
  if (scene.textures.exists(key)) return scene.textures.get(key);
  const texture = scene.textures.createCanvas(key, asset.width, asset.height);
  if (!texture) return null;
  const context = texture.getContext();
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  const imageData = context.createImageData(asset.width, asset.height);
  imageData.data.set(asset.data);
  context.putImageData(imageData, 0, 0);
  texture.refresh();
  return texture;
}

function registerPlayer(scene) {
  const character = compileCharacterModel();
  const { width, height } = character.canvas;
  const textureKeys = [];

  for (const [frameKey, cells] of Object.entries(character.frames)) {
    const textureKey = `player_${frameKey}`;
    uploadCellsToPhaserTexture(scene, textureKey, width, height, cells);
    textureKeys.push(textureKey);
  }

  if (scene.anims) {
    const defineAnim = (key, frameKeys, frameRate = 6, repeat = -1) => {
      if (!scene.anims.exists(key)) {
        scene.anims.create({
          key,
          frames: frameKeys.map((k) => ({ key: k })),
          frameRate,
          repeat,
        });
      }
    };

    // Idle animations
    defineAnim('player_idle', ['player_idle_0', 'player_idle_1'], 2);
    defineAnim('player_idle_south', ['player_idle_0', 'player_idle_1'], 2);
    defineAnim('player_idle_north', ['player_back_0'], 2);
    defineAnim('player_idle_east', ['player_east_0'], 2);
    defineAnim('player_idle_west', ['player_west_0'], 2);

    // Walk animations (8-frame smooth locomotion at 8 FPS)
    const southWalkFrames = Array.from({ length: 8 }, (_, i) => `player_walk_${i}`);
    const northWalkFrames = Array.from({ length: 8 }, (_, i) => `player_walk_north_${i}`);
    const eastWalkFrames = Array.from({ length: 8 }, (_, i) => `player_walk_east_${i}`);
    const westWalkFrames = Array.from({ length: 8 }, (_, i) => `player_walk_west_${i}`);

    defineAnim('player_walk', southWalkFrames, 8);
    defineAnim('player_walk_south', southWalkFrames, 8);
    defineAnim('player_walk_north', northWalkFrames, 8);
    defineAnim('player_walk_east', eastWalkFrames, 8);
    defineAnim('player_walk_west', westWalkFrames, 8);
  }

  return Object.freeze({ width, height, textureKeys: Object.freeze(textureKeys) });
}

/**
 * Rasterize the region's water_pond material mask into a white/black RGBA asset
 * so runtime shaders can mesh effects to the exact water silhouette instead of
 * approximating it with per-tile boxes.
 */
function buildWaterMaskAsset(ground) {
  const mask = ground.form?.materialMasks?.water_pond;
  if (!mask) return null;
  let any = false;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] === 1) {
      any = true;
      break;
    }
  }
  if (!any) return null;
  const data = new Uint8ClampedArray(ground.width * ground.height * 4);
  for (let i = 0; i < mask.length; i += 1) {
    const on = mask[i] === 1 ? 255 : 0;
    data[i * 4] = on;
    data[i * 4 + 1] = on;
    data[i * 4 + 2] = on;
    data[i * 4 + 3] = 255;
  }
  return { width: ground.width, height: ground.height, data };
}

/**
 * Forge and register the complete runtime environment.
 */
export function buildTutorialForestAssets(scene, world, { seed = world?.seed ?? 4242 } = {}) {
  if (!world) throw new TypeError('PB-TUTORIAL-ASSET-001 world is required before asset synthesis');
  const environment = forgeTutorialForestEnvironment(world, { seed });
  const ownedTextureKeys = [];

  uploadRgbaToPhaserTexture(scene, environment.ground.textureKey, environment.ground);
  ownedTextureKeys.push(environment.ground.textureKey);

  const waterMask = buildWaterMaskAsset(environment.ground);
  let waterMaskKey = null;
  if (waterMask) {
    waterMaskKey = `tileforge-water-mask-${environment.ground.realizationHash}`;
    uploadRgbaToPhaserTexture(scene, waterMaskKey, waterMask);
    ownedTextureKeys.push(waterMaskKey);
  }

  const actors = environment.actors.map((descriptor) => {
    const textureKey = `tileforge-actor-${descriptor.semanticType}-${descriptor.asset.realizationHash}`;
    uploadRgbaToPhaserTexture(scene, textureKey, descriptor.asset);
    ownedTextureKeys.push(textureKey);
    return Object.freeze({ ...descriptor, textureKey });
  });
  const player = registerPlayer(scene);

  return Object.freeze({
    contract: TUTORIAL_FOREST_ASSET_MANIFEST_CONTRACT,
    seed: seed >>> 0,
    ground: Object.freeze({
      textureKey: environment.ground.textureKey,
      width: environment.ground.width,
      height: environment.ground.height,
      originX: environment.ground.originX,
      originY: environment.ground.originY,
      realizationHash: environment.ground.realizationHash,
      waterMaskKey,
    }),
    actors: Object.freeze(actors),
    player,
    quality: environment.quality,
    environment,
    ownedTextureKeys: Object.freeze([...new Set(ownedTextureKeys)]),
  });
}

/**
 * Release only textures created for one environment seed. Player animation
 * frames are stable and remain shared in the Phaser texture manager.
 */
export function releaseTutorialForestAssets(scene, manifest) {
  for (const textureKey of manifest?.ownedTextureKeys ?? []) {
    if (scene.textures.exists(textureKey)) scene.textures.remove(textureKey);
  }
}

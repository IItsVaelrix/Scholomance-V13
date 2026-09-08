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

  if (scene.anims && !scene.anims.exists('player_idle')) {
    scene.anims.create({
      key: 'player_idle',
      frames: [{ key: 'player_idle_0' }, { key: 'player_idle_1' }],
      frameRate: 2,
      repeat: -1,
    });
  }
  if (scene.anims && !scene.anims.exists('player_walk')) {
    scene.anims.create({
      key: 'player_walk',
      frames: [
        { key: 'player_walk_0' },
        { key: 'player_walk_1' },
        { key: 'player_walk_2' },
        { key: 'player_walk_3' },
      ],
      frameRate: 6,
      repeat: -1,
    });
  }

  return Object.freeze({ width, height, textureKeys: Object.freeze(textureKeys) });
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

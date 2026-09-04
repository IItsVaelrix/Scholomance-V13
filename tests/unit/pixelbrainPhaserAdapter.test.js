import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { compileSCDL } from '../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { exportSCDL } from '../../codex/core/pixelbrain/scdl/scdl.exporters.js';
import {
  createPixelBrainAnimation,
  createPixelBrainTexture,
} from '../../src/lib/phaser/phaser-runtime.adapter.js';

const FIXTURE = resolve(
  'codex/core/pixelbrain/scdl/fixtures/void_chestplate.scdl',
);

function exportFixture() {
  const result = compileSCDL(readFileSync(FIXTURE, 'utf8'));
  return JSON.parse(exportSCDL(result.packet, ['phaser'], result.ast).phaser.output);
}

function createTextureDouble(key, width, height) {
  const context = {
    imageData: null,
    createImageData(imageWidth, imageHeight) {
      return {
        width: imageWidth,
        height: imageHeight,
        data: new Uint8ClampedArray(imageWidth * imageHeight * 4),
      };
    },
    putImageData(imageData) {
      this.imageData = imageData;
    },
  };

  return {
    key,
    width,
    height,
    context,
    refreshCalls: 0,
    getContext() {
      return context;
    },
    refresh() {
      this.refreshCalls += 1;
      return this;
    },
  };
}

function createSceneDouble() {
  const created = [];
  const animations = [];
  return {
    created,
    animations,
    textures: {
      createCanvas(key, width, height) {
        const texture = createTextureDouble(key, width, height);
        created.push(texture);
        return texture;
      },
    },
    anims: {
      create(config) {
        animations.push(config);
        return config;
      },
    },
  };
}

describe('PixelBrain Phaser 4 adapter', () => {
  it('turns an exported SCDL payload into a refreshed RGBA canvas texture', () => {
    const scene = createSceneDouble();
    const payload = exportFixture();

    const texture = createPixelBrainTexture(scene, payload);

    expect(texture.key).toBe('void_chestplate');
    expect(texture.width).toBe(64);
    expect(texture.height).toBe(64);
    expect(texture.refreshCalls).toBe(1);

    const gemOffset = (18 * 64 + 31) * 4;
    expect(Array.from(texture.context.imageData.data.slice(gemOffset, gemOffset + 4)))
      .toEqual([0, 229, 255, 255]);
  });

  it('rejects malformed or out-of-bounds PixelBrain cells before creating a texture', () => {
    const scene = createSceneDouble();
    const payload = {
      ...exportFixture(),
      pixels: [{ x: 64, y: 0, color: 0xffffff }],
    };

    expect(() => createPixelBrainTexture(scene, payload)).toThrow(/out of bounds/);
    expect(scene.created).toHaveLength(0);
  });

  it('creates one texture per frame and registers a Phaser animation over those keys', () => {
    const scene = createSceneDouble();
    const payload = exportFixture();

    const animation = createPixelBrainAnimation(scene, [payload, payload], {
      keyPrefix: 'chestplate',
      animationKey: 'chestplate-idle',
      frameRate: 8,
      repeat: 2,
    });

    expect(animation).toEqual({
      animationKey: 'chestplate-idle',
      textureKeys: ['chestplate-f0', 'chestplate-f1'],
      startKey: 'chestplate-f0',
    });
    expect(scene.created.map(texture => texture.key))
      .toEqual(['chestplate-f0', 'chestplate-f1']);
    expect(scene.animations).toEqual([{
      key: 'chestplate-idle',
      frames: [{ key: 'chestplate-f0' }, { key: 'chestplate-f1' }],
      frameRate: 8,
      repeat: 2,
    }]);
  });
});

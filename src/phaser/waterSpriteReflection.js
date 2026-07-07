/**
 * Pixel-art water reflection: mirrored sprite duplicate, tint/alpha, sine wave wobble.
 */

export const DEFAULT_WATER_REFLECTION = Object.freeze({
  alpha: 0.5,
  tint: 0x4466aa,
  speed: 2.4,
  frequency: 0.22,
  amplitude: 2,
  depthOffset: -3,
});

/**
 * Pixel-snapped horizontal wave offset for a scanline.
 *
 * @param {number} time Seconds
 * @param {number} y Row index
 * @param {number} speed
 * @param {number} frequency
 * @param {number} amplitude
 */
export function computeWaveOffset(time, y, speed, frequency, amplitude) {
  return Math.round(Math.sin((time * speed) + (y * frequency)) * amplitude);
}

/**
 * Row-based sine distortion that preserves the pixel grid.
 *
 * @param {Uint8ClampedArray} src
 * @param {Uint8ClampedArray} dest
 * @param {number} width
 * @param {number} height
 * @param {number} time
 * @param {number} speed
 * @param {number} frequency
 * @param {number} amplitude
 */
export function applyPixelWaveDistortion(src, dest, width, height, time, speed, frequency, amplitude) {
  for (let y = 0; y < height; y += 1) {
    const offset = computeWaveOffset(time, y, speed, frequency, amplitude);
    for (let x = 0; x < width; x += 1) {
      const srcX = x - offset;
      const di = (y * width + x) * 4;
      if (srcX < 0 || srcX >= width) {
        dest[di] = 0;
        dest[di + 1] = 0;
        dest[di + 2] = 0;
        dest[di + 3] = 0;
        continue;
      }
      const si = (y * width + srcX) * 4;
      dest[di] = src[si];
      dest[di + 1] = src[si + 1];
      dest[di + 2] = src[si + 2];
      dest[di + 3] = src[si + 3];
    }
  }
}

/**
 * @param {import('phaser').GameObjects.GameObject} child
 */
function isReflectableSprite(child) {
  return child?.type === 'Sprite' && child.visible !== false && child.alpha > 0;
}

/**
 * @param {import('phaser').Scene} scene
 * @param {import('phaser').GameObjects.Sprite} sourceSprite
 * @param {{ alpha: number, tint: number }} config
 */
function createMirrorSprite(scene, sourceSprite, config) {
  const mirror = scene.add.sprite(sourceSprite.x, sourceSprite.y, sourceSprite.texture.key, sourceSprite.frame.name);
  mirror.setOrigin(sourceSprite.originX, sourceSprite.originY);
  mirror.setScale(sourceSprite.scaleX, sourceSprite.scaleY);
  mirror.setFlipX(sourceSprite.flipX);
  mirror.setFlipY(true);
  mirror.setAlpha(config.alpha);
  mirror.setTint(config.tint);
  return mirror;
}

/**
 * @param {{ mirrorSprites: import('phaser').GameObjects.Sprite[], sourceContainer: import('phaser').GameObjects.Container, reflectionContainer: import('phaser').GameObjects.Container, scene: import('phaser').Scene, config: typeof DEFAULT_WATER_REFLECTION }} state
 */
function rebuildMirrorSprites(state) {
  const sources = state.sourceContainer.list.filter(isReflectableSprite);
  if (sources.length === state.mirrorSprites.length) {
    return;
  }

  state.mirrorSprites.forEach((sprite) => sprite.destroy());
  state.mirrorSprites.length = 0;
  state.reflectionContainer.removeAll(true);

  for (const sourceSprite of sources) {
    const mirror = createMirrorSprite(state.scene, sourceSprite, state.config);
    state.mirrorSprites.push(mirror);
    state.reflectionContainer.add(mirror);
  }
}

/**
 * @param {{ mirrorSprites: import('phaser').GameObjects.Sprite[], sourceContainer: import('phaser').GameObjects.Container, config: typeof DEFAULT_WATER_REFLECTION }} state
 */
function syncMirrorSprites(state) {
  const sources = state.sourceContainer.list.filter(isReflectableSprite);
  rebuildMirrorSprites(state);

  for (let i = 0; i < sources.length; i += 1) {
    const sourceSprite = sources[i];
    const mirror = state.mirrorSprites[i];
    if (!mirror) continue;

    mirror.setTexture(sourceSprite.texture.key, sourceSprite.frame.name);
    mirror.setPosition(sourceSprite.x, sourceSprite.y);
    mirror.setOrigin(sourceSprite.originX, sourceSprite.originY);
    mirror.setScale(sourceSprite.scaleX, sourceSprite.scaleY);
    mirror.setFlipX(sourceSprite.flipX);
    mirror.setFlipY(true);
    mirror.setAlpha(state.config.alpha);
    mirror.setTint(state.config.tint);
    mirror.setVisible(sourceSprite.visible);

    const wave = computeWaveOffset(
      state.time,
      Math.round(mirror.y),
      state.config.speed,
      state.config.frequency,
      state.config.amplitude,
    );
    mirror.x = sourceSprite.x + wave;
  }
}

/**
 * @param {import('phaser').Scene} scene
 * @param {import('phaser').GameObjects.Container} sourceContainer
 * @param {Partial<typeof DEFAULT_WATER_REFLECTION>} [options]
 */
export function attachWaterSpriteReflection(scene, sourceContainer, options = {}) {
  const config = { ...DEFAULT_WATER_REFLECTION, ...options };
  const reflectionContainer = scene.add.container(sourceContainer.x, sourceContainer.y);
  reflectionContainer.setVisible(false);

  const state = {
    scene,
    sourceContainer,
    reflectionContainer,
    mirrorSprites: [],
    config,
    time: 0,
    active: false,
  };

  rebuildMirrorSprites(state);
  return state;
}

/**
 * @param {ReturnType<typeof attachWaterSpriteReflection>} state
 * @param {boolean} active
 */
export function setWaterReflectionActive(state, active) {
  if (!state) return;
  state.active = active;
  state.reflectionContainer?.setVisible(active);
}

/**
 * @param {ReturnType<typeof attachWaterSpriteReflection>} state
 * @param {number} deltaMs
 */
export function updateWaterSpriteReflection(state, deltaMs) {
  if (!state?.active || !state.sourceContainer?.active) return;

  const { sourceContainer, reflectionContainer, config } = state;
  state.time += deltaMs / 1000;

  reflectionContainer.setPosition(sourceContainer.x, sourceContainer.y);
  reflectionContainer.setDepth((sourceContainer.depth ?? 25) + config.depthOffset);

  syncMirrorSprites(state);
}

/**
 * @param {ReturnType<typeof attachWaterSpriteReflection>} state
 */
export function destroyWaterSpriteReflection(state) {
  if (!state) return;
  state.mirrorSprites.forEach((sprite) => sprite.destroy());
  state.reflectionContainer?.destroy();
}

/**
 * @param {{ isoTileLandscape?: { cells: Array<{ tx: number, ty: number, terrain: string }> } }} scene
 * @param {number} tx
 * @param {number} ty
 */
export function isWaterLandscapeTile(scene, tx, ty) {
  const cell = scene?.isoTileLandscape?.cells?.find((entry) => entry.tx === tx && entry.ty === ty);
  return cell?.terrain === 'water';
}
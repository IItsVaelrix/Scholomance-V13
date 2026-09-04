/**
 * PixelBrain -> Phaser 4 texture bridge.
 *
 * PixelBrain owns the canonical lattice and emits `scdl-phaser-v1` as a
 * renderer-facing projection. Phaser owns the texture and animation lifecycle;
 * this adapter is the only place that translates the packed RGB cells into a
 * WebGL-uploaded CanvasTexture.
 */

const PIXELBRAIN_PHASER_CONTRACT = 'scdl-phaser-v1';

/**
 * Create a Phaser 4 CanvasTexture from an SCDL Phaser export.
 *
 * @param {object} scene A Phaser 4 Scene.
 * @param {object} asset A `scdl-phaser-v1` payload.
 * @param {string} [key] Optional texture key; defaults to the payload key.
 * @returns {object} Phaser.Textures.CanvasTexture
 */
export function createPixelBrainTexture(scene, asset, key = undefined) {
  const normalized = validatePixelBrainPhaserAsset(asset);
  const textureKey = resolveTextureKey(normalized, key);
  const textureManager = scene?.textures;

  if (!textureManager || typeof textureManager.createCanvas !== 'function') {
    throw new TypeError('PixelBrain Phaser adapter: scene.textures.createCanvas is required');
  }

  const texture = textureManager.createCanvas(
    textureKey,
    normalized.canvas.width,
    normalized.canvas.height,
  );

  if (!texture) {
    throw new Error(`PixelBrain Phaser adapter: texture key '${textureKey}' is already in use`);
  }

  const context = texture.getContext?.();
  if (!context || typeof context.createImageData !== 'function' || typeof context.putImageData !== 'function') {
    throw new TypeError('PixelBrain Phaser adapter: CanvasTexture 2D context is unavailable');
  }

  const imageData = context.createImageData(
    normalized.canvas.width,
    normalized.canvas.height,
  );

  for (const pixel of normalized.pixels) {
    const offset = (pixel.y * normalized.canvas.width + pixel.x) * 4;
    imageData.data[offset] = (pixel.color >>> 16) & 0xff;
    imageData.data[offset + 1] = (pixel.color >>> 8) & 0xff;
    imageData.data[offset + 2] = pixel.color & 0xff;
    imageData.data[offset + 3] = pixel.alpha;
  }

  context.putImageData(imageData, 0, 0);

  // Phaser 4 requires an explicit refresh when a CanvasTexture changes under
  // WebGL; without this the canvas is correct but the GPU keeps old contents.
  if (typeof texture.refresh !== 'function') {
    throw new TypeError('PixelBrain Phaser adapter: CanvasTexture.refresh is required');
  }
  texture.refresh();
  return texture;
}

/**
 * Create frame textures and register a Phaser animation using those textures.
 *
 * Each frame is kept as its own texture because `scdl-phaser-v1` assets are
 * canonical per-frame projections, while Phaser animation frames can refer to
 * separate texture keys without requiring a lossy spritesheet repack.
 *
 * @param {object} scene A Phaser 4 Scene.
 * @param {object[]} assets Ordered `scdl-phaser-v1` frame payloads.
 * @param {object} [options]
 * @param {string} [options.keyPrefix='pixelbrain'] Texture key prefix.
 * @param {string} [options.animationKey] Phaser animation key.
 * @param {number} [options.frameRate=12] Frames per second.
 * @param {number} [options.repeat=-1] Phaser repeat count.
 * @returns {{animationKey: string, textureKeys: string[], startKey: string}}
 */
export function createPixelBrainAnimation(scene, assets, options = {}) {
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new TypeError('PixelBrain Phaser adapter: at least one frame is required');
  }

  const keyPrefix = requireNonEmptyString(options.keyPrefix ?? 'pixelbrain', 'keyPrefix');
  const animationKey = requireNonEmptyString(
    options.animationKey ?? `${keyPrefix}-animation`,
    'animationKey',
  );
  const frameRate = options.frameRate ?? 12;
  const repeat = options.repeat ?? -1;

  if (!Number.isFinite(frameRate) || frameRate <= 0) {
    throw new RangeError('PixelBrain Phaser adapter: frameRate must be greater than zero');
  }
  if (!Number.isInteger(repeat) || repeat < -1) {
    throw new RangeError('PixelBrain Phaser adapter: repeat must be an integer >= -1');
  }

  const textureKeys = assets.map((asset, index) => `${keyPrefix}-f${index}`);
  assets.forEach((asset, index) => {
    createPixelBrainTexture(scene, asset, textureKeys[index]);
  });

  if (!scene?.anims || typeof scene.anims.create !== 'function') {
    throw new TypeError('PixelBrain Phaser adapter: scene.anims.create is required');
  }

  scene.anims.create({
    key: animationKey,
    frames: textureKeys.map(textureKey => ({ key: textureKey })),
    frameRate,
    repeat,
  });

  return Object.freeze({
    animationKey,
    textureKeys: Object.freeze(textureKeys),
    startKey: textureKeys[0],
  });
}

/** Validate the renderer-facing PixelBrain Phaser projection. */
export function validatePixelBrainPhaserAsset(asset) {
  if (!asset || asset.type !== PIXELBRAIN_PHASER_CONTRACT) {
    throw new TypeError(
      `PixelBrain Phaser adapter: expected ${PIXELBRAIN_PHASER_CONTRACT} payload`,
    );
  }

  const width = asset.canvas?.width;
  const height = asset.canvas?.height;
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError('PixelBrain Phaser adapter: canvas dimensions must be positive integers');
  }
  if (!Array.isArray(asset.pixels)) {
    throw new TypeError('PixelBrain Phaser adapter: pixels must be an array');
  }

  const pixels = asset.pixels.map((pixel, index) => {
    if (!Number.isInteger(pixel?.x) || !Number.isInteger(pixel?.y)) {
      throw new TypeError(`PixelBrain Phaser adapter: pixel ${index} coordinates must be integers`);
    }
    if (pixel.x < 0 || pixel.x >= width || pixel.y < 0 || pixel.y >= height) {
      throw new RangeError(`PixelBrain Phaser adapter: pixel ${index} is out of bounds`);
    }
    if (!Number.isInteger(pixel.color) || pixel.color < 0 || pixel.color > 0xffffff) {
      throw new RangeError(`PixelBrain Phaser adapter: pixel ${index} color must be packed RGB`);
    }
    const alpha = pixel.alpha ?? 255;
    if (!Number.isInteger(alpha) || alpha < 0 || alpha > 255) {
      throw new RangeError(`PixelBrain Phaser adapter: pixel ${index} alpha must be between 0 and 255`);
    }
    return { x: pixel.x, y: pixel.y, color: pixel.color, alpha };
  });

  return { ...asset, canvas: { width, height }, pixels };
}

function resolveTextureKey(asset, key) {
  return requireNonEmptyString(key ?? asset.key ?? asset.assetId, 'texture key');
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`PixelBrain Phaser adapter: ${label} must be a non-empty string`);
  }
  return value;
}

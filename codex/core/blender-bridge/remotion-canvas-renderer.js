/**
 * remotion-canvas-renderer — pure JS canvas renderer for cross-engine comparison.
 *
 * Remotion is retained and promoted, not deprecated. It becomes the second
 * consumer whose receipt makes Blender's receipt falsifiable — the Pixi/Defold
 * relationship.
 *
 * This module renders a wire packet to a raw RGBA pixel buffer using pure JS.
 * No browser, no WebGL, no Cycles. Just pixel placement from the wire's
 * coordinate colors. This is the "Remotion" consumer: a second, independent
 * renderer that consumes the same wire packet and produces its own honest output.
 *
 * The cross-engine comparison expects CAUSES_AGREE + PIXELS_DIVERGE as the
 * healthy state: both engines consumed the same truth and produced their own
 * honest render.
 *
 * Law 1: The consumer never computes a hash and never mints a receipt.
 * This module produces raw pixels. The bridge hashes them.
 */

import { createHash } from 'node:crypto';

export class CanvasRenderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CanvasRenderError';
  }
}

/**
 * Convert a hex int (e.g. 0xDCB430) to [r, g, b] bytes.
 */
export function hexIntToRgb(hexInt) {
  if (!Number.isInteger(hexInt) || hexInt < 0 || hexInt > 0xFFFFFF) {
    return [0, 0, 0];
  }
  return [
    (hexInt >> 16) & 0xFF,
    (hexInt >> 8) & 0xFF,
    hexInt & 0xFF,
  ];
}

/**
 * Render a wire packet to a raw RGBA pixel buffer.
 *
 * For each coordinate, sets the pixel at (x, y) to the coordinate's color.
 * Canvas size is wire.canvas.width × wire.canvas.height.
 * Background is transparent black (0, 0, 0, 0).
 *
 * This is a RASTER render: no lighting, no shading, no sampling.
 * Remotion is "free to be wrong" — it doesn't need to match Cycles.
 *
 * @param {object} wire - the Python wire packet (from toPythonWire)
 * @param {object} [options]
 * @param {number} [options.backgroundAlpha=0] - background alpha (0=transparent, 255=opaque black)
 * @returns {Readonly<{buffer: Buffer, width: number, height: number, pixelsDrawn: number}>}
 */
export function renderWireToPixels(wire, options = {}) {
  const { backgroundAlpha = 0 } = options;

  if (!wire || typeof wire !== 'object') {
    throw new CanvasRenderError('wire must be a non-null object');
  }
  if (!wire.canvas || typeof wire.canvas.width !== 'number' || typeof wire.canvas.height !== 'number') {
    throw new CanvasRenderError('wire.canvas must have numeric width and height');
  }
  if (!Array.isArray(wire.positions?.x) || !Array.isArray(wire.positions?.y)) {
    throw new CanvasRenderError('wire.positions must have x and y arrays');
  }
  if (!Array.isArray(wire.colors?.color)) {
    throw new CanvasRenderError('wire.colors must have a color array');
  }

  const width = wire.canvas.width;
  const height = wire.canvas.height;
  const gridSize = wire.canvas.gridSize ?? 1;

  if (width <= 0 || height <= 0 || width > 16384 || height > 16384) {
    throw new CanvasRenderError(`canvas dimensions out of range: ${width}x${height}`);
  }

  // Allocate RGBA buffer
  const buffer = Buffer.alloc(width * height * 4);

  // Fill background
  if (backgroundAlpha > 0) {
    for (let i = 3; i < buffer.length; i += 4) {
      buffer[i] = backgroundAlpha;
    }
  }

  let pixelsDrawn = 0;
  const count = wire.coordinateCount ?? wire.positions.x.length;

  for (let i = 0; i < count; i++) {
    // Positions are quantized at PIXEL scale (scale=1), so they're already ints
    const px = wire.positions.x[i];
    const py = wire.positions.y[i];

    if (!Number.isInteger(px) || !Number.isInteger(py)) continue;
    if (px < 0 || px >= width || py < 0 || py >= height) continue;

    const [r, g, b] = hexIntToRgb(wire.colors.color[i]);

    // Draw gridSize × gridSize block
    for (let dy = 0; dy < gridSize; dy++) {
      for (let dx = 0; dx < gridSize; dx++) {
        const x = px + dx;
        const y = py + dy;
        if (x >= width || y >= height) continue;

        const offset = (y * width + x) * 4;
        buffer[offset] = r;
        buffer[offset + 1] = g;
        buffer[offset + 2] = b;
        buffer[offset + 3] = 255;
        pixelsDrawn++;
      }
    }
  }

  return Object.freeze({
    buffer,
    width,
    height,
    pixelsDrawn,
  });
}

/**
 * Hash a rendered pixel buffer to produce a PIXEL_RECEIPT slot value.
 * This is the JS-side hashing — the consumer never hashes.
 *
 * @param {Buffer} buffer - raw RGBA pixel buffer
 * @returns {string} uppercase hex sha256
 */
export function hashCanvasPixels(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new CanvasRenderError('buffer must be a Buffer');
  }
  return createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

/**
 * Build a Remotion-style claim from a wire packet and render result.
 *
 * The claim carries the same packet identity as the Blender claim
 * (same packetId, sourceChecksum, colorPolicy) but with Remotion-specific
 * render settings. This is what makes the cross-engine comparison meaningful:
 * same input, different engine, different pixels.
 *
 * @param {object} wire - the Python wire packet
 * @param {object} renderResult - from renderWireToPixels
 * @param {object} [overrides] - Remotion-specific render settings
 * @returns {Readonly<object>} claim shaped like the Blender addon's emit_claim output
 */
export function buildCanvasClaim(wire, renderResult, overrides = {}) {
  return Object.freeze({
    engine: 'remotion-canvas',
    packetId: wire.packetId,
    sourceChecksum: wire.sourceChecksum,
    colorPolicy: wire.colorPolicy,
    synthClass: 'RASTER',
    observed: Object.freeze({
      blenderVersion: 'remotion-canvas-1.0',
      buildHash: 'pure-js',
      engine: 'CANVAS_2D',
      device: 'CPU',
      seed: 0,
      samples: 1,
      adaptive: false,
      adaptiveThreshold: 0,
      bounces: 0,
      clamping: 0,
      shutterOpen: 0,
      shutterClose: 0,
      timeSamples: 0,
      denoiser: 'NONE',
      denoiseInputPasses: '',
      denoiseEnabled: false,
      viewTransform: wire.colorPolicy === 'EXACT' ? 'Standard' : 'AgX',
      look: 'None',
      displayDevice: 'sRGB',
      format: 'RAW_RGBA',
      colorDepth: '8',
      resolutionX: renderResult.width,
      resolutionY: renderResult.height,
      pixelAspect: 1,
      frameIndex: 0,
      cameraMatrix: '',
      nodeTreeHashes: '',
      declaredSeeds: '',
      threads: 1,
      ...overrides,
    }),
  });
}

/**
 * Full cross-engine render: render wire to pixels, hash, build claim.
 * Convenience wrapper for the E2E pipeline.
 *
 * @param {object} wire
 * @param {object} [options]
 * @returns {Readonly<{claim: object, pixelHash: string, renderResult: object}>}
 */
export function crossEngineRender(wire, options = {}) {
  const renderResult = renderWireToPixels(wire, options);
  const pixelHash = hashCanvasPixels(renderResult.buffer);
  const claim = buildCanvasClaim(wire, renderResult, options.claimOverrides);

  return Object.freeze({
    claim,
    pixelHash,
    renderResult: Object.freeze({
      width: renderResult.width,
      height: renderResult.height,
      pixelsDrawn: renderResult.pixelsDrawn,
    }),
  });
}

/**
 * png-preview — turn the receipt's own pixel dump into something a human can
 * look at.
 *
 * Every check in this bridge compares numbers to numbers. That caught a receipt
 * describing the factory cube and a palette that reached nothing, but it cannot
 * catch an asset rendered upside down, mirrored, or framed off-centre: all of
 * those hash consistently and reproduce perfectly. A person looking at the
 * image is the only check that covers them.
 *
 * The preview is encoded from the SAME float32 dump the receipt hashes, so the
 * picture and the receipt cannot disagree about what was rendered.
 *
 * Upscaling is nearest-neighbour at integer factors only. A resampled preview
 * would show colours no coordinate authored, which is precisely the confusion
 * the byte-exact colour law exists to prevent — the image must be zoomable
 * without becoming a different claim.
 */

import { deflateSync } from 'node:zlib';
import { linearToSrgb } from './color-law.js';

export class PngError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PngError';
  }
}

/**
 * Convert Blender's linear float32 RGBA buffer to top-down sRGB RGBA8.
 *
 * Blender's pixel buffer runs bottom-up; PNG runs top-down. Skipping the flip
 * yields a vertically mirrored asset that still hashes correctly — wrong in the
 * one way a receipt cannot see.
 */
export function linearF32ToRgba8(f32, width, height) {
  if (f32.length !== width * height * 4) {
    throw new PngError(
      `buffer length ${f32.length} does not match ${width}x${height}x4 = ${width * height * 4}`,
    );
  }
  const out = new Uint8Array(width * height * 4);
  const q = (c) => Math.min(255, Math.max(0, Math.round(linearToSrgb(c) * 255)));

  for (let y = 0; y < height; y += 1) {
    const src = (height - 1 - y) * width * 4;
    const dst = y * width * 4;
    for (let x = 0; x < width * 4; x += 4) {
      out[dst + x + 0] = q(f32[src + x + 0]);
      out[dst + x + 1] = q(f32[src + x + 1]);
      out[dst + x + 2] = q(f32[src + x + 2]);
      // Alpha is already linear coverage, not a colour — no transfer function.
      out[dst + x + 3] = Math.min(255, Math.max(0, Math.round(f32[src + x + 3] * 255)));
    }
  }
  return out;
}

/** Repeat each pixel `factor` times on both axes. Invents no colour. */
export function nearestNeighbourUpscale(rgba, width, height, factor) {
  if (!Number.isInteger(factor) || factor < 1) {
    throw new PngError(`upscale factor must be a positive integer, got ${factor}`);
  }
  if (factor === 1) return rgba;

  const w2 = width * factor;
  const out = new Uint8Array(w2 * height * factor * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const s = (y * width + x) * 4;
      for (let dy = 0; dy < factor; dy += 1) {
        for (let dx = 0; dx < factor; dx += 1) {
          const d = ((y * factor + dy) * w2 + (x * factor + dx)) * 4;
          out[d] = rgba[s];
          out[d + 1] = rgba[s + 1];
          out[d + 2] = rgba[s + 2];
          out[d + 3] = rgba[s + 3];
        }
      }
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Encode top-down RGBA8 as a PNG. Deterministic: same pixels, same bytes. */
export function encodePng(rgba, width, height) {
  if (rgba.length !== width * height * 4) {
    throw new PngError(
      `buffer length ${rgba.length} does not match ${width}x${height}x4 = ${width * height * 4}`,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Filter byte 0 (None) per scanline. Filtering would compress better and
  // change nothing a viewer sees; None keeps the encoder small and auditable.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride)
      .copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

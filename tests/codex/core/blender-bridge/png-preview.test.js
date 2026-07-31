/**
 * The preview PNG exists so a human can LOOK at what the receipt describes.
 *
 * It is encoded from the same float32 dump the receipt hashes, so the image and
 * the receipt cannot disagree about what was rendered. Upscaling is
 * nearest-neighbour at integer factors only: a resampled preview would show
 * colours no coordinate authored, which is exactly the confusion the byte-exact
 * colour law exists to prevent.
 */
import { describe, it, expect } from 'vitest';
import {
  linearF32ToRgba8,
  nearestNeighbourUpscale,
  encodePng,
  PngError,
} from '../../../../codex/core/blender-bridge/png-preview.js';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('linearF32ToRgba8', () => {
  it('converts linear float to sRGB bytes, flipping to top-down row order', () => {
    // Blender's pixel buffer is bottom-up; PNG is top-down. A preview that
    // skipped the flip would be a vertically mirrored asset that still hashed
    // correctly — wrong in the one way the receipt cannot see.
    const f32 = new Float32Array([
      // row 0 (bottom): white, black
      1, 1, 1, 1, 0, 0, 0, 1,
      // row 1 (top): mid grey twice
      0.21586, 0.21586, 0.21586, 1, 0.21586, 0.21586, 0.21586, 1,
    ]);
    const rgba = linearF32ToRgba8(f32, 2, 2);
    expect(rgba.length).toBe(2 * 2 * 4);
    // First pixel of the PNG is the TOP-left = row 1 of the Blender buffer.
    expect(rgba[0]).toBe(128);
    // Last row of the PNG is the bottom of the Blender buffer: white then black.
    expect(rgba[8]).toBe(255);
    expect(rgba[12]).toBe(0);
  });

  it('preserves alpha', () => {
    const f32 = new Float32Array([0, 0, 0, 0]);
    expect(linearF32ToRgba8(f32, 1, 1)[3]).toBe(0);
  });

  it('refuses a buffer whose length disagrees with the dimensions', () => {
    expect(() => linearF32ToRgba8(new Float32Array(3), 2, 2)).toThrow(PngError);
  });
});

describe('nearestNeighbourUpscale', () => {
  it('repeats each pixel exactly, inventing no colour', () => {
    const src = Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 255]); // red, blue
    const up = nearestNeighbourUpscale(src, 2, 1, 2);
    expect(up.length).toBe(4 * 2 * 4);
    const px = (x, y) => Array.from(up.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4));
    expect(px(0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(1, 0)).toEqual([255, 0, 0, 255]);
    expect(px(2, 0)).toEqual([0, 0, 255, 255]);
    expect(px(0, 1)).toEqual([255, 0, 0, 255]);
  });

  it('introduces no colour that was not in the source', () => {
    const src = Uint8Array.from([10, 20, 30, 255, 40, 50, 60, 255]);
    const up = nearestNeighbourUpscale(src, 2, 1, 5);
    const seen = new Set();
    for (let i = 0; i < up.length; i += 4) seen.add(up.slice(i, i + 3).join(','));
    expect([...seen].sort()).toEqual(['10,20,30', '40,50,60']);
  });

  it('refuses a non-integer or non-positive factor', () => {
    const src = Uint8Array.from([0, 0, 0, 255]);
    expect(() => nearestNeighbourUpscale(src, 1, 1, 1.5)).toThrow(PngError);
    expect(() => nearestNeighbourUpscale(src, 1, 1, 0)).toThrow(PngError);
  });
});

describe('encodePng', () => {
  it('writes a valid PNG signature and IHDR dimensions', () => {
    const png = encodePng(Uint8Array.from([1, 2, 3, 255]), 1, 1);
    expect(png.subarray(0, 8).equals(SIG)).toBe(true);
    expect(png.readUInt32BE(16)).toBe(1); // IHDR width
    expect(png.readUInt32BE(20)).toBe(1); // IHDR height
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(6); // colour type RGBA
  });

  it('ends with IEND', () => {
    const png = encodePng(Uint8Array.from([1, 2, 3, 255]), 1, 1);
    expect(png.subarray(png.length - 8, png.length - 4).toString('latin1')).toBe('IEND');
  });

  it('is deterministic — the same pixels encode to the same bytes', () => {
    const px = Uint8Array.from([9, 8, 7, 255, 6, 5, 4, 255]);
    expect(encodePng(px, 2, 1).equals(encodePng(px, 2, 1))).toBe(true);
  });

  it('refuses a buffer whose length disagrees with the dimensions', () => {
    expect(() => encodePng(Uint8Array.from([1, 2, 3, 255]), 2, 2)).toThrow(PngError);
  });
});

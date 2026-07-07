import { describe, expect, it } from 'vitest';
import {
  applyPixelWaveDistortion,
  computeWaveOffset,
} from '../../../src/phaser/waterSpriteReflection.js';

describe('waterSpriteReflection', () => {
  it('computeWaveOffset snaps to integer pixels', () => {
    const offset = computeWaveOffset(1.25, 8, 2.4, 0.22, 2);
    expect(Number.isInteger(offset)).toBe(true);
    expect(Math.abs(offset)).toBeLessThanOrEqual(2);
  });

  it('applyPixelWaveDistortion shifts rows horizontally', () => {
    const width = 4;
    const height = 3;
    const src = new Uint8ClampedArray(width * height * 4);
    const dest = new Uint8ClampedArray(width * height * 4);

    src[(1 * width + 1) * 4] = 255;
    src[(1 * width + 1) * 4 + 3] = 255;

    applyPixelWaveDistortion(src, dest, width, height, 0, 2.4, 0.22, 1);

    let painted = 0;
    for (let i = 0; i < dest.length; i += 4) {
      if (dest[i + 3] > 0) painted += 1;
    }
    expect(painted).toBeGreaterThan(0);
  });
});
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import {
  PATTERN_SPEED,
  bakeGalaxyPlate,
  drawGalaxyPlate,
  drawGalaxySparkles,
  drawGalaxy,
} from '../../../src/pages/Landing/storm/galaxySim.js';
import { createPhotonicStorm } from '../../../src/pages/Landing/storm/photonicStorm.js';

function makeMockCtx() {
  const ctx = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fillText: vi.fn(),
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
  };
  Object.defineProperty(ctx, 'globalCompositeOperation', { writable: true, value: 'source-over' });
  Object.defineProperty(ctx, 'globalAlpha', { writable: true, value: 1 });
  Object.defineProperty(ctx, 'shadowBlur', { writable: true, value: 0 });
  Object.defineProperty(ctx, 'shadowColor', { writable: true, value: '' });
  Object.defineProperty(ctx, 'lineCap', { writable: true, value: 'round' });
  Object.defineProperty(ctx, 'lineJoin', { writable: true, value: 'round' });
  Object.defineProperty(ctx, 'strokeStyle', { writable: true, value: '' });
  Object.defineProperty(ctx, 'fillStyle', { writable: true, value: '' });
  Object.defineProperty(ctx, 'lineWidth', { writable: true, value: 1 });
  Object.defineProperty(ctx, 'font', { writable: true, value: '' });
  return ctx;
}

describe('galaxy plate bake + skip path', () => {
  it('exports PATTERN_SPEED and bakes a cached plate', () => {
    expect(PATTERN_SPEED).toBe(0.05);
    const plate = bakeGalaxyPlate(320, 180);
    expect(plate.canvas.width).toBe(320);
    expect(plate.canvas.height).toBe(180);
    expect(plate.centerX).toBe(160);
    expect(plate.centerY).toBeCloseTo(180 * 0.44);
    expect(plate.patternSpeed).toBe(PATTERN_SPEED);
    expect(plate.state.cachedCanvas).toBeTruthy();
  });

  it('drawGalaxy remains plate + sparkles (backward compatible)', () => {
    const plate = bakeGalaxyPlate(64, 64);
    const ctx = makeMockCtx();
    drawGalaxy(ctx, plate.state);
    expect(ctx.rotate).toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it('drawGalaxyPlate rotates; drawGalaxySparkles does not', () => {
    const plate = bakeGalaxyPlate(64, 64);
    plate.state.clock = 1;
    const plateCtx = makeMockCtx();
    drawGalaxyPlate(plateCtx, plate.state);
    expect(plateCtx.rotate).toHaveBeenCalled();

    const sparkleCtx = makeMockCtx();
    drawGalaxySparkles(sparkleCtx, plate.state);
    expect(sparkleCtx.rotate).not.toHaveBeenCalled();
  });

  it('skipGalaxyPlate omits plate blit (no rotate)', () => {
    const storm = createPhotonicStorm({ intensity: 1, variant: 'scene', skipGalaxyPlate: true });
    storm.resize(320, 180);
    storm.update(0.016);

    const ctx = makeMockCtx();
    storm.render(ctx);

    // When skipGalaxyPlate: no rotate of cached plate (plate blit omitted)
    expect(ctx.rotate).not.toHaveBeenCalled();

    storm.dispose();
  });

  it('default path still blits rotating plate', () => {
    const storm = createPhotonicStorm({ intensity: 1, variant: 'scene' });
    storm.resize(320, 180);
    storm.update(0.016);

    const ctx = makeMockCtx();
    storm.render(ctx);
    expect(ctx.rotate).toHaveBeenCalled();

    storm.dispose();
  });
});

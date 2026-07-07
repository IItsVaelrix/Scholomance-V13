import { describe, expect, it, vi } from 'vitest';
import {
  drawTuningForkTreeGraphics,
  generateTuningForkLSystem,
} from '../../../src/phaser/polarisTuningForkTrees.js';

describe('polarisTuningForkTrees', () => {
  it('generateTuningForkLSystem produces branch segments and leaf terminals', () => {
    const spec = generateTuningForkLSystem(42, { leanX: 0.1, leanY: -0.2 });
    expect(spec.segments.length).toBeGreaterThan(0);
    expect(spec.leafClusters.length).toBeGreaterThanOrEqual(3);
  });

  it('drawTuningForkTreeGraphics issues fork and leaf draw calls', () => {
    const calls = [];
    const graphics = {
      clear: vi.fn(),
      lineStyle: vi.fn(),
      fillStyle: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fillPath: vi.fn(),
      strokePath: vi.fn(),
      fillEllipse: vi.fn(),
      fillCircle: vi.fn(),
      strokeEllipse: vi.fn(),
    };

    graphics.fillCircle.mockImplementation(() => calls.push('leaf'));
    graphics.strokePath.mockImplementation(() => calls.push('branch'));

    drawTuningForkTreeGraphics(graphics, 1);

    expect(graphics.clear).toHaveBeenCalled();
    expect(calls.filter((c) => c === 'leaf').length).toBeGreaterThanOrEqual(4);
    expect(calls.filter((c) => c === 'branch').length).toBeGreaterThanOrEqual(1);
  });
});
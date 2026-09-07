import { describe, expect, it } from 'vitest';
import {
  createLayer,
  sortLayers,
  compositeLayerStack,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.layers.js';
import { createRect } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.geometry.js';
import { toMask } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.masks.js';
import { makeRational } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js';

describe('SCDL v2 multi-layer pipeline and layer stack compositing', () => {
  const r0 = makeRational(0);
  const r4 = makeRational(4);

  const rect = createRect({ origin: { x: r0, y: r0 }, size: { x: r4, y: r4 } });

  it('sorts layers by order ascending, breaking ties with sourceIndex', () => {
    const l1 = createLayer({ id: 'top', order: 30, sourceIndex: 0 });
    const l2 = createLayer({ id: 'bg', order: 10, sourceIndex: 1 });
    const l3 = createLayer({ id: 'mid1', order: 20, sourceIndex: 2 });
    const l4 = createLayer({ id: 'mid2', order: 20, sourceIndex: 3 });

    const sorted = sortLayers([l1, l2, l3, l4]);
    expect(sorted.map((l) => l.id)).toEqual(['bg', 'mid1', 'mid2', 'top']);
  });

  it('composites layers in painter order with cell metadata', () => {
    const bg = createLayer({
      id: 'bg',
      order: 10,
      paints: [
        { shape: rect, fill: '#000000', raster: 'CENTER' },
      ],
    });

    const fg = createLayer({
      id: 'fg',
      order: 20,
      paints: [
        {
          shape: createRect({ origin: { x: makeRational(1), y: makeRational(1) }, size: { x: makeRational(2), y: makeRational(2) } }),
          fill: '#FFFFFF',
          raster: 'CENTER',
          material: 'void_crystal',
        },
      ],
    });

    const result = compositeLayerStack({ width: 4, height: 4 }, [bg, fg]);
    expect(result.ok).toBe(true);
    expect(result.coordinates.length).toBe(16);

    // Cell at (0, 0) should be black from bg
    const c00 = result.coordinates.find((c) => c.x === 0 && c.y === 0);
    expect(c00.color).toBe('#000000');
    expect(c00.partId).toBe('bg');

    // Cell at (1, 1) should be white from fg with material void_crystal
    const c11 = result.coordinates.find((c) => c.x === 1 && c.y === 1);
    expect(c11.color).toBe('#ffffff');
    expect(c11.partId).toBe('fg');
    expect(c11.material).toBe('void_crystal');
  });

  it('supports clipping masks on paint statements within a layer', () => {
    const maskRect = createRect({ origin: { x: r0, y: r0 }, size: { x: makeRational(2), y: makeRational(2) } });
    const mask = toMask(maskRect);

    const layer = createLayer({
      id: 'clipped_layer',
      order: 10,
      paints: [
        { shape: rect, fill: '#FF0000', raster: 'CENTER', clipTo: mask },
      ],
    });

    const result = compositeLayerStack({ width: 4, height: 4 }, [layer]);
    expect(result.ok).toBe(true);
    // Only 4 cells inside the 2x2 mask should be rendered instead of 16
    expect(result.coordinates.length).toBe(4);
  });
});

import { describe, it, expect } from 'vitest';
import { quantize6, contentHash } from '../../../src/lib/photonic-retina/perceptual/schema.js';
import { toLabLattice } from '../../../src/lib/photonic-retina/perceptual/preprocessing.js';

describe('perceptual schema helpers', () => {
  it('quantize6 rounds to 6 decimal places', () => {
    expect(quantize6(0.123456789)).toBe(0.123457);
    expect(quantize6(-0.1)).toBe(-0.1);
  });

  it('contentHash is deterministic', () => {
    const a = contentHash({ z: 1, a: [2, 3] });
    const b = contentHash({ a: [2, 3], z: 1 });
    expect(a).toBe(b);
  });
});

describe('toLabLattice', () => {
  it('excludes cells with alpha < 0.5 from occupied', () => {
    const lattice = toLabLattice({
      width: 4,
      height: 4,
      cells: [
        { x: 1, y: 1, color: '#ff0000', occupied: true, alpha: 0.4 },
        { x: 2, y: 2, color: '#00ff00', occupied: true, alpha: 1 },
      ],
    });
    expect(lattice.occupiedCount).toBe(1);
    expect(lattice.occupied.some((c) => c.x === 1 && c.y === 1)).toBe(false);
    expect(lattice.occupied.some((c) => c.x === 2 && c.y === 2)).toBe(true);
  });

  it('accepts VixelField-shaped input as mode vixel', () => {
    const lattice = toLabLattice({
      id: 'v',
      width: 8,
      height: 8,
      vixels: [
        {
          x: 1,
          y: 1,
          pixel: { color: '#112233', material: 'stone', partId: 'body', emphasis: 1, z: 0 },
          vector: { pathRef: 'rim', parametricT: 0.5, curvature: 0, normalX: 0, normalY: 1, pressure: 1 },
          feel: { role: 'boundary', salience: 0.8, isBoundary: true },
        },
      ],
      provenance: { pixelSource: 'scdl', vectorSource: 'wand', matchRatio: 1, totalCells: 1 },
      vixelHash: 'abc',
    });
    expect(lattice.mode).toBe('vixel');
    expect(lattice.occupiedCount).toBe(1);
    expect(lattice.occupied[0].partId).toBe('body');
    expect(lattice.occupied[0].pathRef).toBe('rim');
  });

  it('is deterministic for identical inputs', () => {
    const input = {
      width: 4,
      height: 4,
      cells: [{ x: 0, y: 0, color: '#abcdef', occupied: true }],
    };
    const a = toLabLattice(input);
    const b = toLabLattice(input);
    expect(a.bbox).toEqual(b.bbox);
    expect(a.occupied[0].L).toBe(b.occupied[0].L);
  });
});

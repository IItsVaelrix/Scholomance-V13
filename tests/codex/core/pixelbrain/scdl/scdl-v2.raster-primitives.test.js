import { describe, expect, it } from 'vitest';
import {
  rasterizeLineBresenham,
  rasterizeLineSupercover,
  rasterizeRectCenter,
  rasterizeRingMidpoint,
  rasterizeEllipseCenter,
  rasterizePolygonScanline,
  rasterizeShapeCells,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.raster.js';
import { createLine } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.geometry.js';
import { makeRational } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js';

describe('SCDL v2 primitive rasterizers', () => {
  it('rasterizes horizontal, vertical, and diagonal lines with Bresenham', () => {
    // Horizontal line
    const hLine = rasterizeLineBresenham(2, 5, 6, 5);
    expect(hLine.map((c) => `${c.x},${c.y}`)).toEqual(['2,5', '3,5', '4,5', '5,5', '6,5']);

    // Vertical line
    const vLine = rasterizeLineBresenham(3, 1, 3, 4);
    expect(vLine.map((c) => `${c.x},${c.y}`)).toEqual(['3,1', '3,2', '3,3', '3,4']);

    // Diagonal line
    const dLine = rasterizeLineBresenham(0, 0, 3, 3);
    expect(dLine.map((c) => `${c.x},${c.y}`)).toEqual(['0,0', '1,1', '2,2', '3,3']);
  });

  it('rasterizes line widths greater than one without dropping the stroke', () => {
    const line = createLine({
      from: { x: makeRational(1), y: makeRational(2) },
      to: { x: makeRational(3), y: makeRational(2) },
      width: makeRational(3),
    });
    const cells = rasterizeShapeCells(line, 'BRESENHAM');
    const occupied = new Set(cells.map(({ x, y }) => `${x},${y}`));
    expect(occupied.has('2,1')).toBe(true);
    expect(occupied.has('2,2')).toBe(true);
    expect(occupied.has('2,3')).toBe(true);
  });

  it('rasterizes supercover lines including all touched cells', () => {
    // Supercover on diagonal line touches adjacent cells
    const scLine = rasterizeLineSupercover(0, 0, 2, 2);
    const coords = new Set(scLine.map((c) => `${c.x},${c.y}`));
    expect(coords.has('0,0')).toBe(true);
    expect(coords.has('1,1')).toBe(true);
    expect(coords.has('2,2')).toBe(true);
    // Must contain touched adjacent cells
    expect(scLine.length).toBeGreaterThanOrEqual(3);
  });

  it('rasterizes rect with exact half-open center bounds', () => {
    // Rect at (2, 2) with size (3, 2) covers x in [2, 4], y in [2, 3] = 6 cells
    const rectCells = rasterizeRectCenter(2, 2, 3, 2);
    expect(rectCells.length).toBe(6);
    const coords = rectCells.map((c) => `${c.x},${c.y}`);
    expect(coords).toContain('2,2');
    expect(coords).toContain('4,2');
    expect(coords).toContain('2,3');
    expect(coords).toContain('4,3');
    expect(coords).not.toContain('5,2');
    expect(coords).not.toContain('2,4');
  });

  it('rasterizes ring with midpoint/annulus symmetry', () => {
    // Ring centered at (8, 8), inner radius 2, outer radius 4
    const ringCells = rasterizeRingMidpoint(8, 8, 2, 4);
    expect(ringCells.length).toBeGreaterThan(0);
    // Center cell (8, 8) must NOT be inside the hollow ring!
    const hasCenter = ringCells.some((c) => c.x === 8 && c.y === 8);
    expect(hasCenter).toBe(false);
    // Outer cells must be present
    const hasOuter = ringCells.some((c) => c.x === 12 && c.y === 8);
    expect(hasOuter).toBe(true);
  });

  it('rasterizes ellipse with 4-way quadrant symmetry', () => {
    const ellipseCells = rasterizeEllipseCenter(10, 10, 5, 3);
    expect(ellipseCells.length).toBeGreaterThan(0);
    // Verify 4-way symmetry around (10, 10)
    for (const cell of ellipseCells) {
      const dx = cell.x - 10;
      const dy = cell.y - 10;
      const sym1 = ellipseCells.some((c) => c.x === 10 - dx && c.y === 10 + dy);
      const sym2 = ellipseCells.some((c) => c.x === 10 + dx && c.y === 10 - dy);
      const sym3 = ellipseCells.some((c) => c.x === 10 - dx && c.y === 10 - dy);
      expect(sym1).toBe(true);
      expect(sym2).toBe(true);
      expect(sym3).toBe(true);
    }
  });

  it('rasterizes arbitrary convex and non-convex polygons via scanline', () => {
    // Simple 4x4 square polygon
    const squareVerts = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    const polyCells = rasterizePolygonScanline(squareVerts, 'NON_ZERO');
    expect(polyCells.length).toBe(16);

    // Triangle
    const triVerts = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 4 },
    ];
    const triCells = rasterizePolygonScanline(triVerts, 'NON_ZERO');
    expect(triCells.length).toBeGreaterThan(0);
    expect(triCells.length).toBeLessThan(16);
  });
});

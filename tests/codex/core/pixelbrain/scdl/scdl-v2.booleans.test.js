import { describe, expect, it } from 'vitest';
import {
  shapeUnion,
  shapeSubtract,
  shapeIntersect,
  shapeXor,
  shapeOutline,
  evaluateCSGToCells,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.booleans.js';
import { createRect, createCircle } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.geometry.js';
import { makeRational } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js';

describe('SCDL v2 first-class shape CSG booleans', () => {
  const r0 = makeRational(0);
  const r2 = makeRational(2);
  const r4 = makeRational(4);

  // Rect A: [0, 0] size [4, 4] -> covers x: 0..3, y: 0..3 (16 cells)
  const rectA = createRect({
    origin: { x: r0, y: r0 },
    size: { x: r4, y: r4 },
  });

  // Rect B: [2, 0] size [4, 4] -> covers x: 2..5, y: 0..3 (16 cells)
  // Overlap is x: 2..3, y: 0..3 (8 cells)
  const rectB = createRect({
    origin: { x: r2, y: r0 },
    size: { x: r4, y: r4 },
  });

  it('evaluates UNION as the combined cell set', () => {
    const unionShape = shapeUnion(rectA, rectB);
    expect(unionShape.kind).toBe('CSG_UNION');
    const cells = evaluateCSGToCells(unionShape);
    // 16 + 16 - 8 = 24 cells
    expect(cells.length).toBe(24);
  });

  it('evaluates SUBTRACT removing operand B from operand A', () => {
    const subShape = shapeSubtract(rectA, rectB);
    expect(subShape.kind).toBe('CSG_SUBTRACT');
    const cells = evaluateCSGToCells(subShape);
    // 16 - 8 = 8 cells (x: 0..1, y: 0..3)
    expect(cells.length).toBe(8);
    for (const cell of cells) {
      expect(cell.x).toBeLessThan(2);
    }
  });

  it('evaluates INTERSECT keeping only overlapping cells', () => {
    const interShape = shapeIntersect(rectA, rectB);
    expect(interShape.kind).toBe('CSG_INTERSECT');
    const cells = evaluateCSGToCells(interShape);
    // Overlap: 8 cells (x: 2..3, y: 0..3)
    expect(cells.length).toBe(8);
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(2);
      expect(cell.x).toBeLessThan(4);
    }
  });

  it('evaluates XOR as symmetric difference', () => {
    const xorShape = shapeXor(rectA, rectB);
    expect(xorShape.kind).toBe('CSG_XOR');
    const cells = evaluateCSGToCells(xorShape);
    // Total 24 - 8 overlap = 16 cells
    expect(cells.length).toBe(16);
    // No cells in the overlap region x: 2..3
    for (const cell of cells) {
      const inOverlap = cell.x >= 2 && cell.x < 4;
      expect(inOverlap).toBe(false);
    }
  });

  it('evaluates OUTLINE extracting boundary cells of the shape', () => {
    const outlineShape = shapeOutline(rectA, makeRational(1), 'INNER');
    expect(outlineShape.kind).toBe('OUTLINE');
    const cells = evaluateCSGToCells(outlineShape);
    // 4x4 rect perimeter: 4 + 4 + 2 + 2 = 12 cells
    expect(cells.length).toBe(12);
    // Interior cells (1,1), (1,2), (2,1), (2,2) should not be present
    const hasInterior = cells.some((c) => (c.x === 1 || c.x === 2) && (c.y === 1 || c.y === 2));
    expect(hasInterior).toBe(false);
  });

  it('maintains scoped silhouette maps so independent entities do not erase each other (Pattern #3)', () => {
    // Subtracting a circle from a rect
    const circ = createCircle({ center: { x: r2, y: r2 }, radius: makeRational(1) });
    const cutout = shapeSubtract(rectA, circ);
    const cells = evaluateCSGToCells(cutout);
    // Center cell (2, 2) must be subtracted
    const hasCenter = cells.some((c) => c.x === 2 && c.y === 2);
    expect(hasCenter).toBe(false);
    // Original rectA must remain untouched
    expect(rectA.kind).toBe('RECT');
  });
});

import { describe, it, expect } from 'vitest';
import { extractContours } from '../../../../../codex/core/pixelbrain/vixel/stroke-extractor.js';

const cell = (x, y, material, partId = 'a') => ({ x, y, material, partId, sourceOpId: `op:${partId}:0:test` });

// A filled 3x3 single-material square: the center cell has all 8 neighbors
// present and same-material, so it must NOT appear in any stroke. Every edge
// and corner cell is missing at least one neighbor, so all 8 of them must.
function filledSquare(material = 'stone') {
  const cells = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) cells.push(cell(x, y, material));
  return cells;
}

// A 4x3 block, left two columns red, right two columns blue. Cell (1,1) is
// fully interior (all 8 neighbors present, in-bounds) but touches blue
// neighbors at x=2 — a clean material-boundary case with zero silhouette
// ambiguity. Cell (0,0) is a corner touching only red neighbors and empty
// space — a clean silhouette case with zero material-boundary ambiguity.
// (A cell touching BOTH empty space and a different material at once is a
// real edge case the design doc leaves unspecified — deliberately not tested
// here; see stroke-extractor.js's role-assignment order for current behavior.)
function twoMaterialBlock() {
  const cells = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 4; x++) {
      cells.push(cell(x, y, x < 2 ? 'red' : 'blue'));
    }
  }
  return cells;
}

describe('extractContours', () => {
  it('a single-material filled square produces only silhouette strokes, on exactly the 8 edge/corner cells', () => {
    const strokes = extractContours(filledSquare());
    expect(strokes.every((s) => s.role === 'silhouette')).toBe(true);
    const cellCount = strokes.reduce((n, s) => n + s.path.cells.length, 0);
    expect(cellCount).toBe(8);
    // the center cell (1,1) has all 8 neighbors present and same-material
    const touchesCenter = strokes.some((s) => s.path.cells.some((c) => c.x === 1 && c.y === 1));
    expect(touchesCenter).toBe(false);
  });

  it('an interior material seam produces material-boundary; an exterior same-material corner produces silhouette', () => {
    const strokes = extractContours(twoMaterialBlock());
    const roleOf = (x, y) => strokes.find((s) => s.path.cells.some((c) => c.x === x && c.y === y))?.role;
    expect(roleOf(1, 1)).toBe('material-boundary'); // interior, touches only the material seam
    expect(roleOf(0, 0)).toBe('silhouette');         // corner, touches only empty space + same material
  });

  it('every emitted stroke carries schemaVersion PB-STROKE-v1 and per-cell provenance', () => {
    const strokes = extractContours(filledSquare());
    expect(strokes.length).toBeGreaterThan(0);
    for (const s of strokes) {
      expect(s.schemaVersion).toBe('PB-STROKE-v1');
      expect(typeof s.baseWeight).toBe('number');
      for (const c of s.path.cells) {
        expect(c.partId).toBe('a');
        expect(c.sourceOpId).toBe('op:a:0:test');
      }
    }
  });

  it('is deterministic: 100 repeated runs on the same input produce byte-identical output', () => {
    const input = filledSquare();
    const first = JSON.stringify(extractContours(input));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(extractContours(input))).toBe(first);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { stylizeStrokes } from '../../../../../codex/core/pixelbrain/vixel/stroke-stylizer.js';

describe('stylizeStrokes', () => {
  it('maps role to a fixed color and pixelWeight, passing cells through unmodified', () => {
    const cells = [{ x: 1, y: 2, partId: 'p', sourceOpId: 'op:p:0:x' }];
    const strokeIR = [
      { path: { cells }, role: 'silhouette', baseWeight: 1, schemaVersion: 'PB-STROKE-v1' },
      { path: { cells }, role: 'material-boundary', baseWeight: 1, schemaVersion: 'PB-STROKE-v1' },
    ];
    const paint = stylizeStrokes(strokeIR);
    expect(paint).toHaveLength(2);
    for (const p of paint) {
      expect(p.cells).toBe(cells); // same reference: passed through, not rebuilt
      expect(typeof p.color).toBe('string');
      expect(typeof p.pixelWeight).toBe('number');
    }
  });

  it('is a pure function of role alone: two strokes with the same role get identical treatment', () => {
    const cellsA = [{ x: 0, y: 0, partId: null, sourceOpId: null }];
    const cellsB = [{ x: 99, y: 99, partId: null, sourceOpId: null }];
    const [a, b] = stylizeStrokes([
      { path: { cells: cellsA }, role: 'silhouette', baseWeight: 1, schemaVersion: 'PB-STROKE-v1' },
      { path: { cells: cellsB }, role: 'silhouette', baseWeight: 5, schemaVersion: 'PB-STROKE-v1' },
    ]);
    expect(a.color).toBe(b.color);
    expect(a.pixelWeight).toBe(b.pixelWeight);
  });
});

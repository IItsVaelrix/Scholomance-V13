import { describe, expect, it } from 'vitest';
import { cellIndex, cellCount } from '../../src/lib/photonic-retina/retina-cell-index.js';

describe('retina-cell-index', () => {
  it('maps row/col to row-major order', () => {
    expect(cellIndex(0, 0, 4)).toBe(0);
    expect(cellIndex(0, 3, 4)).toBe(3);
    expect(cellIndex(1, 0, 4)).toBe(4);
    expect(cellIndex(2, 1, 4)).toBe(9);
  });

  it('computes cell count', () => {
    expect(cellCount(3, 4)).toBe(12);
  });
});

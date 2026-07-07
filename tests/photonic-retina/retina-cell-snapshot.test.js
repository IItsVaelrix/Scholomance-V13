import { describe, expect, it } from 'vitest';
import {
  cellSignature,
  buildCellSignatures,
  diffCellSignatures,
} from '../../src/lib/photonic-retina/retina-cell-index.js';

describe('cell signatures', () => {
  it('returns 0 for empty or unoccupied cells', () => {
    expect(cellSignature(null)).toBe(0);
    expect(cellSignature({ occupied: false, color: '#ffffff' })).toBe(0);
  });

  it('is deterministic and distinguishes color and emphasis', () => {
    const a = cellSignature({ color: '#112233', emphasis: 1, occupied: true });
    const b = cellSignature({ color: '#112233', emphasis: 1, occupied: true });
    const c = cellSignature({ color: '#112233', emphasis: 0.5, occupied: true });
    const d = cellSignature({ color: '#445566', emphasis: 1, occupied: true });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });

  it('builds a dense signature array', () => {
    const sigs = buildCellSignatures([{ color: '#112233', emphasis: 1, occupied: true }, null]);
    expect(sigs).toBeInstanceOf(Float64Array);
    expect(sigs.length).toBe(2);
    expect(sigs[1]).toBe(0);
  });
});

describe('diffCellSignatures', () => {
  it('flags only cells whose signature changed', () => {
    const prev = buildCellSignatures([
      { color: '#112233', emphasis: 1, occupied: true },
      { color: '#445566', emphasis: 1, occupied: true },
    ]);
    const curr = buildCellSignatures([
      { color: '#112233', emphasis: 1, occupied: true },
      { color: '#778899', emphasis: 1, occupied: true },
    ]);
    expect(Array.from(diffCellSignatures(prev, curr))).toEqual([0, 1]);
  });

  it('treats a null prev as a full-change first tick', () => {
    const curr = buildCellSignatures([null, { color: '#112233', emphasis: 1, occupied: true }]);
    expect(Array.from(diffCellSignatures(null, curr))).toEqual([1, 1]);
  });
});

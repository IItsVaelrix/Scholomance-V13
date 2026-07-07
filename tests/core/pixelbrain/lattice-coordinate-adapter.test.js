import { describe, it, expect } from 'vitest';
import {
  coordsToLattice,
  latticeToCoords,
} from '../../../codex/core/pixelbrain/lattice-coordinate-adapter.js';
import { applySymmetryToLattice } from '../../../codex/core/pixelbrain/symmetry-amp.js';

const CANVAS = { width: 8, height: 8, gridSize: 1 };

function makeCoords() {
  return [
    { x: 1, y: 3, color: '#ff0000', partId: 'core', emphasis: 0.9 },
    { x: 5, y: 2, color: '#00ff00', partId: 'trim', emphasis: 0.5 },
    { x: 0, y: 0, color: '#0000ff', partId: 'edge', emphasis: 0.2 },
  ];
}

describe('lattice-coordinate adapter', () => {
  it('round-trips integer-grid coordinates losslessly (modulo sort order)', () => {
    const coords = makeCoords();
    const back = latticeToCoords(coordsToLattice(coords, CANVAS));

    const project = (c) => ({ x: c.x, y: c.y, color: c.color, partId: c.partId, emphasis: c.emphasis });
    const expected = coords.map(project).sort((a, b) => (a.y - b.y) || (a.x - b.x));
    expect(back.map(project)).toEqual(expected);
  });

  it('is insertion-order independent (sorted-Map determinism guard)', () => {
    const coords = makeCoords();
    const shuffled = [coords[2], coords[0], coords[1]];

    const a = latticeToCoords(
      applySymmetryToLattice(coordsToLattice(coords, CANVAS), { type: 'diagonal', significant: true }),
    );
    const b = latticeToCoords(
      applySymmetryToLattice(coordsToLattice(shuffled, CANVAS), { type: 'diagonal', significant: true }),
    );
    expect(a).toEqual(b);
  });

  it('repeated diagonal application is byte-identical (Axiom 5)', () => {
    const coords = makeCoords();
    const run = () => latticeToCoords(
      applySymmetryToLattice(coordsToLattice(coords, CANVAS), { type: 'diagonal', significant: true }),
    );
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

describe('diagonal mirror (applySymmetryToLattice)', () => {
  it('transposes (col,row) → (row,col) and is no longer a no-op', () => {
    const lattice = coordsToLattice(makeCoords(), CANVAS);
    const before = lattice.cells.size;
    const mirrored = applySymmetryToLattice(lattice, { type: 'diagonal', significant: true });

    // (1,3) must gain its transpose (3,1); (5,2) → (2,5); (0,0) is on the axis.
    expect(mirrored.cells.has('3,1')).toBe(true);
    expect(mirrored.cells.has('2,5')).toBe(true);
    expect(mirrored.cells.size).toBeGreaterThan(before);
  });

  it('bounds-guards transposes that fall outside a non-square lattice', () => {
    // 8 wide, 2 tall: a cell at (col=1,row=3) does not exist; use (col=5,row=1) → transpose (1,5) is out of rows.
    const coords = [{ x: 5, y: 1, color: '#fff', partId: 'p', emphasis: 1 }];
    const lattice = coordsToLattice(coords, { width: 8, height: 2, gridSize: 1 });
    const mirrored = applySymmetryToLattice(lattice, { type: 'diagonal', significant: true });
    // transpose target (col=1,row=5) is out of bounds (rows=2) → skipped, original preserved.
    expect(mirrored.cells.has('1,5')).toBe(false);
    expect(mirrored.cells.has('5,1')).toBe(true);
  });
});

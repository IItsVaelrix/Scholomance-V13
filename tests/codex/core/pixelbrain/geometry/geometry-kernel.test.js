/**
 * geometry-kernel.test.js
 *
 * Tests for codex/core/pixelbrain/geometry/ — the PixelBrain Geometry Kernel v1.
 * Covers the full QA checklist from the design doc.
 */
import { describe, it, expect } from 'vitest';

import { cellKey, parseCellKey } from '../../../../../codex/core/pixelbrain/geometry/cell-key.js';
import {
  createCellSet,
  cellSetToArray,
  hasCell,
  addCell,
  removeCell,
} from '../../../../../codex/core/pixelbrain/geometry/cell-set.js';
import {
  getCellBounds,
  containsPoint,
  intersectsBounds,
  expandBounds,
  clampBoundsToCanvas,
} from '../../../../../codex/core/pixelbrain/geometry/bounds.js';
import {
  unionCellSets,
  subtractCellSets,
  intersectCellSets,
  differenceCellSets,
} from '../../../../../codex/core/pixelbrain/geometry/lattice-booleans.js';
import { fillFromSDF, floodFillFromSDF } from '../../../../../codex/core/pixelbrain/geometry/fill.js';
import {
  fillPolygon,
  fillEllipse,
  fillCircle,
  fillThickLine,
  fillRect,
} from '../../../../../codex/core/pixelbrain/geometry/raster-fill.js';
import {
  buildSpatialHash,
  querySpatialHash,
  nearestCell,
} from '../../../../../codex/core/pixelbrain/geometry/spatial-hash.js';
import {
  getBorderCells,
  getInteriorCells,
  getConnectedComponents,
  dilateCellSet,
  erodeCellSet,
} from '../../../../../codex/core/pixelbrain/geometry/lattice-queries.js';

// ---------------------------------------------------------------------------
// cell-key
// ---------------------------------------------------------------------------
describe('cellKey / parseCellKey', () => {
  it('encodes positive coordinates', () => {
    expect(cellKey(3, 7)).toBe('3,7');
  });

  it('encodes zero', () => {
    expect(cellKey(0, 0)).toBe('0,0');
  });

  it('encodes negative coordinates', () => {
    expect(cellKey(-5, -12)).toBe('-5,-12');
  });

  it('round-trips through parseCellKey', () => {
    const cases = [[0, 0], [1, 2], [-3, 10], [100, 200]];
    for (const [x, y] of cases) {
      expect(parseCellKey(cellKey(x, y))).toEqual({ x, y });
    }
  });

  it('uses indexOf not split — double-digit coords parse correctly', () => {
    expect(parseCellKey('10,20')).toEqual({ x: 10, y: 20 });
    expect(parseCellKey('-10,-20')).toEqual({ x: -10, y: -20 });
  });
});

// ---------------------------------------------------------------------------
// cell-set
// ---------------------------------------------------------------------------
describe('createCellSet / cellSetToArray', () => {
  it('creates an empty set from no args', () => {
    expect(createCellSet().size).toBe(0);
  });

  it('deduplicates cells', () => {
    const s = createCellSet([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 2 }]);
    expect(s.size).toBe(2);
  });

  it('cellSetToArray returns sorted (y asc, x asc)', () => {
    const s = createCellSet([{ x: 3, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 1 }]);
    expect(cellSetToArray(s)).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 1, y: 2 },
    ]);
  });

  it('output order is stable across repeated calls', () => {
    const s = createCellSet([{ x: 5, y: 0 }, { x: 0, y: 5 }, { x: 3, y: 3 }]);
    expect(cellSetToArray(s)).toEqual(cellSetToArray(s));
  });

  it('hasCell returns true for present cell', () => {
    const s = createCellSet([{ x: 4, y: 4 }]);
    expect(hasCell(s, 4, 4)).toBe(true);
    expect(hasCell(s, 4, 5)).toBe(false);
  });

  it('addCell mutates and returns the set', () => {
    const s = createCellSet();
    const returned = addCell(s, 7, 8);
    expect(returned).toBe(s);
    expect(hasCell(s, 7, 8)).toBe(true);
  });

  it('removeCell removes the cell', () => {
    const s = createCellSet([{ x: 1, y: 1 }]);
    removeCell(s, 1, 1);
    expect(hasCell(s, 1, 1)).toBe(false);
  });

  it('empty input returns empty output', () => {
    expect(cellSetToArray(createCellSet([]))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// bounds
// ---------------------------------------------------------------------------
describe('getCellBounds', () => {
  it('returns null for empty array', () => {
    expect(getCellBounds([])).toBeNull();
  });

  it('returns null for empty set', () => {
    expect(getCellBounds(new Set())).toBeNull();
  });

  it('single cell has width=1, height=1', () => {
    const b = getCellBounds([{ x: 3, y: 5 }]);
    expect(b).toMatchObject({ minX: 3, minY: 5, maxX: 3, maxY: 5, width: 1, height: 1 });
  });

  it('computes correct bounds for a 3×2 block', () => {
    const cells = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
      { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
    ];
    const b = getCellBounds(cells);
    expect(b).toMatchObject({ minX: 0, minY: 0, maxX: 2, maxY: 1, width: 3, height: 2 });
  });

  it('accepts a Set<string>', () => {
    const s = createCellSet([{ x: 1, y: 2 }, { x: 4, y: 6 }]);
    const b = getCellBounds(s);
    expect(b).toMatchObject({ minX: 1, minY: 2, maxX: 4, maxY: 6, width: 4, height: 5 });
  });

  it('centerX and centerY are correct for even-size shape', () => {
    const b = getCellBounds([{ x: 0, y: 0 }, { x: 3, y: 3 }]);
    expect(b.centerX).toBe(1.5);
    expect(b.centerY).toBe(1.5);
  });
});

describe('containsPoint', () => {
  const b = { minX: 2, minY: 2, maxX: 5, maxY: 5, width: 4, height: 4, centerX: 3.5, centerY: 3.5 };

  it('returns true for interior point', () => {
    expect(containsPoint(b, 3, 3)).toBe(true);
  });

  it('returns true on boundary', () => {
    expect(containsPoint(b, 2, 2)).toBe(true);
    expect(containsPoint(b, 5, 5)).toBe(true);
  });

  it('returns false outside', () => {
    expect(containsPoint(b, 1, 3)).toBe(false);
    expect(containsPoint(b, 6, 3)).toBe(false);
  });

  it('returns false for null bounds', () => {
    expect(containsPoint(null, 3, 3)).toBe(false);
  });
});

describe('intersectsBounds', () => {
  const a = { minX: 0, minY: 0, maxX: 4, maxY: 4 };
  const b = { minX: 3, minY: 3, maxX: 7, maxY: 7 };
  const c = { minX: 5, minY: 5, maxX: 9, maxY: 9 };

  it('overlapping bounds returns true', () => {
    expect(intersectsBounds(a, b)).toBe(true);
  });

  it('touching corner counts as overlap', () => {
    expect(intersectsBounds(a, { minX: 4, minY: 4, maxX: 6, maxY: 6 })).toBe(true);
  });

  it('non-overlapping returns false', () => {
    expect(intersectsBounds(a, c)).toBe(false);
  });

  it('null returns false', () => {
    expect(intersectsBounds(null, b)).toBe(false);
  });
});

describe('expandBounds / clampBoundsToCanvas', () => {
  it('expandBounds grows all sides by margin', () => {
    const b = { minX: 2, minY: 2, maxX: 4, maxY: 4, width: 3, height: 3, centerX: 3, centerY: 3 };
    const e = expandBounds(b, 2);
    expect(e).toMatchObject({ minX: 0, minY: 0, maxX: 6, maxY: 6, width: 7, height: 7 });
  });

  it('clampBoundsToCanvas clips to canvas', () => {
    const b = { minX: -2, minY: -2, maxX: 20, maxY: 20 };
    const c = clampBoundsToCanvas(b, { width: 16, height: 16 });
    expect(c).toMatchObject({ minX: 0, minY: 0, maxX: 15, maxY: 15 });
  });

  it('clampBoundsToCanvas returns null when entirely outside', () => {
    const b = { minX: 20, minY: 20, maxX: 30, maxY: 30 };
    expect(clampBoundsToCanvas(b, { width: 16, height: 16 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// lattice-booleans
// ---------------------------------------------------------------------------
describe('lattice-booleans', () => {
  const makeSet = (...coords) => createCellSet(coords.map(([x, y]) => ({ x, y })));

  it('unionCellSets merges all cells', () => {
    const a = makeSet([0, 0], [1, 0]);
    const b = makeSet([1, 0], [2, 0]);
    const u = unionCellSets(a, b);
    expect(u.size).toBe(3);
    expect(u.has('0,0')).toBe(true);
    expect(u.has('2,0')).toBe(true);
  });

  it('unionCellSets with no args returns empty set', () => {
    expect(unionCellSets().size).toBe(0);
  });

  it('subtractCellSets removes cells from base', () => {
    const base = makeSet([0, 0], [1, 0], [2, 0]);
    const sub  = makeSet([1, 0]);
    const result = subtractCellSets(base, sub);
    expect(result.size).toBe(2);
    expect(result.has('1,0')).toBe(false);
  });

  it('subtractCellSets does not mutate inputs', () => {
    const base = makeSet([0, 0], [1, 0]);
    const sub  = makeSet([1, 0]);
    subtractCellSets(base, sub);
    expect(base.size).toBe(2);
  });

  it('intersectCellSets returns common cells', () => {
    const a = makeSet([0, 0], [1, 0], [2, 0]);
    const b = makeSet([1, 0], [2, 0], [3, 0]);
    const i = intersectCellSets(a, b);
    expect([...i].sort()).toEqual(['1,0', '2,0']);
  });

  it('intersectCellSets of disjoint sets is empty', () => {
    const a = makeSet([0, 0]);
    const b = makeSet([5, 5]);
    expect(intersectCellSets(a, b).size).toBe(0);
  });

  it('differenceCellSets returns symmetric difference', () => {
    const a = makeSet([0, 0], [1, 0]);
    const b = makeSet([1, 0], [2, 0]);
    const d = differenceCellSets(a, b);
    expect([...d].sort()).toEqual(['0,0', '2,0']);
  });

  it('boolean ops do not use Math.random or time-based ordering', () => {
    // Same input twice → identical output
    const a = makeSet([0, 0], [1, 1], [2, 2]);
    const b = makeSet([1, 1], [3, 3]);
    expect([...unionCellSets(a, b)].sort()).toEqual([...unionCellSets(a, b)].sort());
  });
});

// ---------------------------------------------------------------------------
// fill (SDF-to-lattice)
// ---------------------------------------------------------------------------
describe('fillFromSDF', () => {
  const circle = (r) => ({ x, y }) => Math.hypot(x, y) - r;

  it('fills a circle of radius 3 centered at origin', () => {
    const cells = fillFromSDF({
      bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
      evaluator: circle(3),
    });
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => Number.isInteger(c.x) && Number.isInteger(c.y))).toBe(true);
    // All returned cells must be inside or on the circle
    expect(cells.every((c) => Math.hypot(c.x, c.y) <= 3 + 1e-9)).toBe(true);
  });

  it('output is sorted (y asc, x asc)', () => {
    const cells = fillFromSDF({
      bounds: { minX: -3, minY: -3, maxX: 3, maxY: 3 },
      evaluator: circle(2),
    });
    for (let i = 1; i < cells.length; i++) {
      const prev = cells[i - 1];
      const curr = cells[i];
      expect(curr.y > prev.y || (curr.y === prev.y && curr.x >= prev.x)).toBe(true);
    }
  });

  it('no duplicates in output', () => {
    const cells = fillFromSDF({
      bounds: { minX: -4, minY: -4, maxX: 4, maxY: 4 },
      evaluator: circle(3),
    });
    const keys = cells.map((c) => `${c.x},${c.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('empty bounds returns empty array', () => {
    const cells = fillFromSDF({
      bounds: { minX: 5, minY: 5, maxX: 4, maxY: 4 },
      evaluator: circle(1),
    });
    expect(cells).toEqual([]);
  });

  it('threshold expands the filled region', () => {
    const small = fillFromSDF({ bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 }, evaluator: circle(2) });
    const large = fillFromSDF({ bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 }, evaluator: circle(2), threshold: 1 });
    expect(large.length).toBeGreaterThan(small.length);
  });

  it('is deterministic', () => {
    const opts = { bounds: { minX: -4, minY: -4, maxX: 4, maxY: 4 }, evaluator: circle(3) };
    expect(fillFromSDF(opts)).toEqual(fillFromSDF(opts));
  });
});

describe('floodFillFromSDF', () => {
  const box = (w, h) => ({ x, y }) => Math.max(Math.abs(x) - w / 2, Math.abs(y) - h / 2);

  it('fills from a seed inside the shape', () => {
    const cells = floodFillFromSDF({
      seed: { x: 0, y: 0 },
      bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
      evaluator: box(4, 4),
    });
    expect(cells.length).toBeGreaterThan(0);
  });

  it('returns empty array when seed is outside', () => {
    const cells = floodFillFromSDF({
      seed: { x: 20, y: 20 },
      bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 },
      evaluator: box(2, 2),
    });
    expect(cells).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// raster-fill
// ---------------------------------------------------------------------------
describe('fillPolygon', () => {
  it('empty or degenerate input returns empty array', () => {
    expect(fillPolygon([])).toEqual([]);
    expect(fillPolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([]);
  });

  it('fills a 4×4 square correctly', () => {
    const square = [
      { x: 0, y: 0 }, { x: 3, y: 0 },
      { x: 3, y: 3 }, { x: 0, y: 3 },
    ];
    const cells = fillPolygon(square);
    expect(cells.length).toBe(16); // 4×4
    expect(cells.every((c) => c.x >= 0 && c.x <= 3 && c.y >= 0 && c.y <= 3)).toBe(true);
  });

  it('fills a right triangle', () => {
    const tri = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }];
    const cells = fillPolygon(tri);
    expect(cells.length).toBeGreaterThan(0);
    // All cells should be in the lower-left half
    expect(cells.every((c) => c.x + c.y <= 4)).toBe(true);
  });

  it('output order is stable (y asc, x asc)', () => {
    const square = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }];
    const cells = fillPolygon(square);
    for (let i = 1; i < cells.length; i++) {
      const prev = cells[i - 1];
      const curr = cells[i];
      expect(curr.y > prev.y || (curr.y === prev.y && curr.x >= prev.x)).toBe(true);
    }
  });

  it('no duplicate cells', () => {
    const square = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }];
    const cells = fillPolygon(square);
    const keys = cells.map((c) => `${c.x},${c.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is deterministic', () => {
    const poly = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 3, y: 6 }];
    expect(fillPolygon(poly)).toEqual(fillPolygon(poly));
  });
});

describe('fillEllipse', () => {
  it('fills a circle-shaped ellipse (rx === ry)', () => {
    const cells = fillEllipse({ cx: 0, cy: 0, rx: 4, ry: 4 });
    expect(cells.length).toBeGreaterThan(0);
    // Should be symmetric: for every (x,y) there is (-x,y), (x,-y), (-x,-y)
    const keys = new Set(cells.map((c) => `${c.x},${c.y}`));
    for (const { x, y } of cells) {
      expect(keys.has(`${-x},${y}`)).toBe(true);
      expect(keys.has(`${x},${-y}`)).toBe(true);
    }
  });

  it('degenerate rx=0 or ry=0 returns empty', () => {
    expect(fillEllipse({ cx: 0, cy: 0, rx: 0, ry: 4 })).toEqual([]);
    expect(fillEllipse({ cx: 0, cy: 0, rx: 4, ry: 0 })).toEqual([]);
  });

  it('output is sorted (y asc, x asc)', () => {
    const cells = fillEllipse({ cx: 5, cy: 5, rx: 3, ry: 2 });
    for (let i = 1; i < cells.length; i++) {
      const prev = cells[i - 1];
      const curr = cells[i];
      expect(curr.y > prev.y || (curr.y === prev.y && curr.x >= prev.x)).toBe(true);
    }
  });
});

describe('fillCircle', () => {
  it('cell at center is always included', () => {
    const cells = fillCircle({ cx: 3, cy: 3, radius: 2 });
    expect(cells.some((c) => c.x === 3 && c.y === 3)).toBe(true);
  });

  it('no cell is outside the radius', () => {
    const cells = fillCircle({ cx: 0, cy: 0, radius: 5 });
    expect(cells.every((c) => Math.hypot(c.x, c.y) <= 5 + 1e-9)).toBe(true);
  });
});

describe('fillThickLine', () => {
  it('includes both endpoint cells', () => {
    const cells = fillThickLine({ x1: 0, y1: 0, x2: 4, y2: 0, radius: 1 });
    const keys = new Set(cells.map((c) => `${c.x},${c.y}`));
    expect(keys.has('0,0')).toBe(true);
    expect(keys.has('4,0')).toBe(true);
  });

  it('is wider than a single-pixel line', () => {
    const thick = fillThickLine({ x1: 0, y1: 5, x2: 10, y2: 5, radius: 2 });
    const yValues = new Set(thick.map((c) => c.y));
    expect(yValues.size).toBeGreaterThan(1);
  });

  it('zero radius returns empty', () => {
    expect(fillThickLine({ x1: 0, y1: 0, x2: 5, y2: 0, radius: 0 })).toEqual([]);
  });

  it('is deterministic', () => {
    const opts = { x1: 0, y1: 0, x2: 8, y2: 3, radius: 2 };
    expect(fillThickLine(opts)).toEqual(fillThickLine(opts));
  });
});

describe('fillRect', () => {
  it('fills the correct number of cells', () => {
    const cells = fillRect({ minX: 0, minY: 0, maxX: 3, maxY: 2 });
    expect(cells.length).toBe(12); // 4×3
  });

  it('single-cell rect', () => {
    const cells = fillRect({ minX: 2, minY: 2, maxX: 2, maxY: 2 });
    expect(cells).toEqual([{ x: 2, y: 2 }]);
  });
});

// ---------------------------------------------------------------------------
// spatial-hash
// ---------------------------------------------------------------------------
describe('buildSpatialHash / querySpatialHash / nearestCell', () => {
  const cells = [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 },
    { x: 10, y: 10 }, { x: 11, y: 10 },
  ];

  it('querySpatialHash returns cells in the region', () => {
    const hash = buildSpatialHash(cells);
    const result = querySpatialHash(hash, { minX: 0, minY: 0, maxX: 2, maxY: 2 });
    expect(result.length).toBe(3);
    expect(result.every((c) => c.x <= 2 && c.y <= 2)).toBe(true);
  });

  it('querySpatialHash returns empty for non-overlapping region', () => {
    const hash = buildSpatialHash(cells);
    const result = querySpatialHash(hash, { minX: 20, minY: 20, maxX: 30, maxY: 30 });
    expect(result).toEqual([]);
  });

  it('querySpatialHash output is sorted (y asc, x asc)', () => {
    const hash = buildSpatialHash(cells);
    const result = querySpatialHash(hash, { minX: 0, minY: 0, maxX: 15, maxY: 15 });
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1];
      const curr = result[i];
      expect(curr.y > prev.y || (curr.y === prev.y && curr.x >= prev.x)).toBe(true);
    }
  });

  it('nearestCell finds the closest cell', () => {
    const hash = buildSpatialHash(cells);
    const nearest = nearestCell(hash, 9, 9);
    expect(nearest).not.toBeNull();
    expect(nearest.x).toBe(10);
    expect(nearest.y).toBe(10);
  });

  it('nearestCell returns null when maxRadius excludes all cells', () => {
    const hash = buildSpatialHash(cells);
    const result = nearestCell(hash, 5, 5, { maxRadius: 1 });
    expect(result).toBeNull();
  });

  it('accepts a Set<string> as input', () => {
    const s = createCellSet([{ x: 3, y: 3 }, { x: 4, y: 4 }]);
    const hash = buildSpatialHash(s);
    const result = querySpatialHash(hash, { minX: 0, minY: 0, maxX: 5, maxY: 5 });
    expect(result.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// lattice-queries
// ---------------------------------------------------------------------------
describe('getBorderCells', () => {
  it('all cells of a single cell are border cells', () => {
    const s = createCellSet([{ x: 0, y: 0 }]);
    expect(getBorderCells(s).length).toBe(1);
  });

  it('interior cell of a 3×3 block is not a border cell (4-way)', () => {
    const cells = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) cells.push({ x, y });
    const s = createCellSet(cells);
    const border = getBorderCells(s);
    // The center cell (1,1) should not be in the border
    expect(border.some((c) => c.x === 1 && c.y === 1)).toBe(false);
    expect(border.length).toBe(8);
  });
});

describe('getInteriorCells', () => {
  it('returns only the fully-surrounded cell in a 3×3 block', () => {
    const cells = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) cells.push({ x, y });
    const s = createCellSet(cells);
    const interior = getInteriorCells(s);
    expect(interior).toEqual([{ x: 1, y: 1 }]);
  });

  it('returns empty for a single cell', () => {
    const s = createCellSet([{ x: 0, y: 0 }]);
    expect(getInteriorCells(s)).toEqual([]);
  });
});

describe('getConnectedComponents', () => {
  it('two disjoint cells produce two components', () => {
    const s = createCellSet([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    const comps = getConnectedComponents(s);
    expect(comps.length).toBe(2);
  });

  it('connected block produces one component', () => {
    const cells = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    const s = createCellSet(cells);
    const comps = getConnectedComponents(s);
    expect(comps.length).toBe(1);
    expect(comps[0].size).toBe(3);
  });

  it('components are sorted largest first', () => {
    const cells = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, // 3 cells
      { x: 10, y: 10 },                                  // 1 cell
    ];
    const s = createCellSet(cells);
    const comps = getConnectedComponents(s);
    expect(comps[0].size).toBeGreaterThanOrEqual(comps[1].size);
  });
});

describe('dilateCellSet / erodeCellSet', () => {
  it('dilation expands outward by one cell', () => {
    const s = createCellSet([{ x: 5, y: 5 }]);
    const dilated = dilateCellSet(s);
    // Center + 4 neighbors = 5 cells
    expect(dilated.size).toBe(5);
  });

  it('erosion removes cells that lack neighbors', () => {
    // A single isolated cell should be fully eroded
    const s = createCellSet([{ x: 0, y: 0 }]);
    expect(erodeCellSet(s).size).toBe(0);
  });

  it('erosion of a 3×3 block leaves only the center', () => {
    const cells = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) cells.push({ x, y });
    const s = createCellSet(cells);
    const eroded = erodeCellSet(s);
    expect(eroded.size).toBe(1);
    expect(eroded.has('1,1')).toBe(true);
  });

  it('dilate then erode round-trips for a compact shape', () => {
    const cells = [];
    for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) cells.push({ x, y });
    const s = createCellSet(cells);
    const roundTripped = erodeCellSet(dilateCellSet(s));
    // The original interior cells should survive
    for (const key of s) {
      expect(roundTripped.has(key)).toBe(true);
    }
  });
});

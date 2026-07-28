/**
 * VIXEL LATTICE — Test Suite
 *
 * Validates the fusion engine, schema, feel adapter, and diff functions.
 * All tests are deterministic. No randomness, no Date.now().
 */

import { describe, it, expect } from 'vitest';
import {
  VIXEL_SCHEMA_VERSION,
  validatePixelState,
  validateVectorState,
  validateVixelField,
} from '../../src/lib/vixel-lattice/vixel-schema.js';
import {
  fuseToVixelField,
  diffVixelFields,
} from '../../src/lib/vixel-lattice/vixel-fusion.js';
import {
  vixelFieldToSpatialField,
  evaluateVixelFeel,
  diffVixelFeel,
} from '../../src/lib/vixel-lattice/vixel-feel-adapter.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makePixelGrid(w, h, coords) {
  return {
    id: 'test-grid',
    canvas: { width: w, height: h },
    coordinates: coords,
  };
}

function makeVectorPaths(paths) {
  return paths.map(p => ({
    role: p.role,
    points: p.points,
  }));
}

const SIMPLE_GRID = makePixelGrid(8, 8, [
  { x: 2, y: 2, color: '#ff0000', partId: 'body', material: 'obsidian', emphasis: 1 },
  { x: 3, y: 2, color: '#ff0000', partId: 'body', material: 'obsidian', emphasis: 1 },
  { x: 4, y: 2, color: '#ff0000', partId: 'body', material: 'obsidian', emphasis: 1 },
  { x: 2, y: 3, color: '#00ff00', partId: 'rim', material: 'darksteel', emphasis: 0.8 },
  { x: 3, y: 3, color: '#00ff00', partId: 'rim', material: 'darksteel', emphasis: 0.8 },
  { x: 4, y: 3, color: '#00ff00', partId: 'rim', material: 'darksteel', emphasis: 0.8 },
  { x: 3, y: 4, color: '#0000ff', partId: 'stem', material: 'holy_fire', emphasis: 0.6 },
]);

const SIMPLE_VECTORS = makeVectorPaths([
  {
    role: 'body.curve',
    points: [
      { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 },
    ],
  },
  {
    role: 'rim.arc',
    points: [
      { x: 2, y: 3 }, { x: 3, y: 3.5 }, { x: 4, y: 3 },
    ],
  },
  {
    role: 'stem.line',
    points: [
      { x: 3, y: 3 }, { x: 3, y: 4 }, { x: 3, y: 5 },
    ],
  },
]);

// ─── Schema validation ──────────────────────────────────────────────────────

describe('Vixel Schema', () => {
  it('validates a correct pixel state', () => {
    const errors = validatePixelState({
      color: '#ff0000',
      material: 'obsidian',
      partId: 'body',
      emphasis: 0.8,
      depthBand: 0,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid pixel state', () => {
    const errors = validatePixelState({ color: 'red', material: 123, emphasis: 2 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates a correct vector state', () => {
    const errors = validateVectorState({
      pathRef: 'body.curve',
      parametricT: 0.5,
      normalX: 0.7,
      normalY: -0.7,
      curvature: 0.1,
      pressure: 0.9,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid vector state', () => {
    const errors = validateVectorState({ pathRef: 123, parametricT: 1.5 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates a complete VixelField', () => {
    const field = fuseToVixelField(SIMPLE_GRID, SIMPLE_VECTORS);
    const errors = validateVixelField(field);
    expect(errors).toHaveLength(0);
  });

  it('exports the correct schema version', () => {
    expect(VIXEL_SCHEMA_VERSION).toBe('VIXEL-SCHEMA-v1');
  });
});

// ─── Fusion engine ──────────────────────────────────────────────────────────

describe('Vixel Fusion', () => {
  it('produces a frozen VixelField with correct dimensions', () => {
    const field = fuseToVixelField(SIMPLE_GRID, SIMPLE_VECTORS);
    expect(field.schemaVersion).toBe(VIXEL_SCHEMA_VERSION);
    expect(field.width).toBe(8);
    expect(field.height).toBe(8);
    expect(field.vixels.length).toBe(7);
    expect(Object.isFrozen(field)).toBe(true);
    expect(Object.isFrozen(field.vixels)).toBe(true);
  });

  it('assigns vector provenance to every matched cell', () => {
    const field = fuseToVixelField(SIMPLE_GRID, SIMPLE_VECTORS);
    for (const v of field.vixels) {
      expect(v.vector.pathRef).not.toBe('unmatched');
      expect(typeof v.vector.parametricT).toBe('number');
      expect(typeof v.vector.normalX).toBe('number');
      expect(typeof v.vector.normalY).toBe('number');
    }
  });

  it('computes normals perpendicular to the curve tangent', () => {
    // Use a dedicated fixture where the rim arc is the only path,
    // so cells unambiguously match to it.
    const rimGrid = makePixelGrid(8, 8, [
      { x: 2, y: 3, color: '#00ff00', partId: 'rim', material: 'darksteel', emphasis: 0.8 },
      { x: 3, y: 3, color: '#00ff00', partId: 'rim', material: 'darksteel', emphasis: 0.8 },
      { x: 4, y: 3, color: '#00ff00', partId: 'rim', material: 'darksteel', emphasis: 0.8 },
    ]);
    const rimVectors = makeVectorPaths([
      { role: 'rim.arc', points: [{ x: 2, y: 3 }, { x: 3, y: 3.5 }, { x: 4, y: 3 }] },
    ]);
    const field = fuseToVixelField(rimGrid, rimVectors);
    // Midpoint of the arc: tangent is roughly horizontal → normal is roughly vertical
    const rimMid = field.vixels.find(v => v.x === 3 && v.y === 3);
    expect(rimMid).toBeDefined();
    expect(rimMid.vector.pathRef).toBe('rim.arc');
    expect(Math.abs(rimMid.vector.normalY)).toBeGreaterThan(0.5);
    // Normal should be a unit vector (magnitude ≈ 1)
    const mag = Math.sqrt(rimMid.vector.normalX ** 2 + rimMid.vector.normalY ** 2);
    expect(mag).toBeCloseTo(1, 1);
  });

  it('detects boundary cells correctly', () => {
    const field = fuseToVixelField(SIMPLE_GRID, SIMPLE_VECTORS);
    // (2,2) has no neighbor at (1,2) or (2,1) → boundary
    const corner = field.vixels.find(v => v.x === 2 && v.y === 2);
    expect(corner.feel.isBoundary).toBe(true);
    // (3,3) has neighbors at (2,3), (4,3), (3,2), (3,4) → interior
    const interior = field.vixels.find(v => v.x === 3 && v.y === 3);
    expect(interior.feel.isBoundary).toBe(false);
  });

  it('computes salience with vector enrichment', () => {
    const field = fuseToVixelField(SIMPLE_GRID, SIMPLE_VECTORS);
    // Boundary cells should have higher salience than interior
    const boundary = field.vixels.filter(v => v.feel.isBoundary);
    const interior = field.vixels.filter(v => !v.feel.isBoundary);
    const avgBoundary = boundary.reduce((s, v) => s + v.feel.salience, 0) / boundary.length;
    const avgInterior = interior.reduce((s, v) => s + v.feel.salience, 0) / interior.length;
    expect(avgBoundary).toBeGreaterThan(avgInterior);
  });

  it('produces a deterministic vixelHash', () => {
    const field1 = fuseToVixelField(SIMPLE_GRID, SIMPLE_VECTORS);
    const field2 = fuseToVixelField(SIMPLE_GRID, SIMPLE_VECTORS);
    expect(field1.vixelHash).toBe(field2.vixelHash);
    expect(field1.vixelHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces different hashes for different inputs', () => {
    const field1 = fuseToVixelField(SIMPLE_GRID, SIMPLE_VECTORS);
    const altGrid = makePixelGrid(8, 8, [
      { x: 5, y: 5, color: '#ffffff', partId: 'x', material: 'source', emphasis: 1 },
    ]);
    const field2 = fuseToVixelField(altGrid, SIMPLE_VECTORS);
    expect(field1.vixelHash).not.toBe(field2.vixelHash);
  });

  it('handles empty vector paths gracefully', () => {
    const field = fuseToVixelField(SIMPLE_GRID, []);
    expect(field.vixels.length).toBe(7);
    for (const v of field.vixels) {
      expect(v.vector.pathRef).toBe('unmatched');
    }
    expect(field.provenance.matchRatio).toBe(0);
  });

  it('throws on invalid pixelGrid', () => {
    expect(() => fuseToVixelField(null, SIMPLE_VECTORS)).toThrow();
    expect(() => fuseToVixelField({ canvas: null }, SIMPLE_VECTORS)).toThrow();
  });

  it('throws on invalid vectorPaths', () => {
    expect(() => fuseToVixelField(SIMPLE_GRID, 'not-an-array')).toThrow();
  });

  it('sorts vixels in row-major order', () => {
    const field = fuseToVixelField(SIMPLE_GRID, SIMPLE_VECTORS);
    for (let i = 1; i < field.vixels.length; i++) {
      const prev = field.vixels[i - 1];
      const curr = field.vixels[i];
      const prevKey = prev.y * 1000 + prev.x;
      const currKey = curr.y * 1000 + curr.x;
      expect(currKey).toBeGreaterThanOrEqual(prevKey);
    }
  });
});

// ─── Vixel diff ─────────────────────────────────────────────────────────────

describe('diffVixelFields', () => {
  it('reports identical fields', () => {
    const field1 = fuseToVixelField(SIMPLE_GRID, SIMPLE_VECTORS);
    const field2 = fuseToVixelField(SIMPLE_GRID, SIMPLE_VECTORS);
    const diff = diffVixelFields(field1, field2);
    expect(diff.identical).toBe(true);
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
  });

  it('detects added and removed cells', () => {
    const field1 = fuseToVixelField(SIMPLE_GRID, SIMPLE_VECTORS);
    const biggerGrid = makePixelGrid(8, 8, [
      ...SIMPLE_GRID.coordinates,
      { x: 6, y: 6, color: '#ffffff', partId: 'new', material: 'source', emphasis: 1 },
    ]);
    const field2 = fuseToVixelField(biggerGrid, SIMPLE_VECTORS);
    const diff = diffVixelFields(field1, field2);
    expect(diff.identical).toBe(false);
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(0);
  });

  it('detects color changes', () => {
    const field1 = fuseToVixelField(SIMPLE_GRID, SIMPLE_VECTORS);
    const altCoords = SIMPLE_GRID.coordinates.map((c, i) =>
      i === 0 ? { ...c, color: '#000000' } : c
    );
    const field2 = fuseToVixelField(makePixelGrid(8, 8, altCoords), SIMPLE_VECTORS);
    const diff = diffVixelFields(field1, field2);
    expect(diff.colorChanged).toBe(1);
  });
});

// ─── Feel adapter ───────────────────────────────────────────────────────────

describe('Vixel Feel Adapter', () => {
  it('converts VixelField to SpatialField', () => {
    const field = fuseToVixelField(SIMPLE_GRID, SIMPLE_VECTORS);
    const spatial = vixelFieldToSpatialField(field);
    expect(spatial.cells.length).toBe(7);
    expect(spatial.width).toBe(8);
    expect(spatial.height).toBe(8);
    // Emphasis should be vixel salience, not raw emphasis
    for (const cell of spatial.cells) {
      expect(typeof cell.emphasis).toBe('number');
      expect(cell.emphasis).toBeGreaterThan(0);
      expect(cell._vixel).toBeDefined();
      expect(cell._vixel.pathRef).toBeDefined();
    }
  });

  it('evaluates VixelFeel with all AMP channels', () => {
    const field = fuseToVixelField(SIMPLE_GRID, SIMPLE_VECTORS);
    const report = evaluateVixelFeel(field);
    expect(report.contract).toBe('VIXEL-FEEL-v1');
    expect(typeof report.spatialAwareness).toBe('number');
    expect(report.spatialAwareness).toBeGreaterThanOrEqual(0);
    expect(report.spatialAwareness).toBeLessThanOrEqual(1);
    expect(report.geometry).toBeDefined();
    expect(report.construction).toBeDefined();
    expect(report.silhouette).toBeDefined();
    expect(report.vixelDiagnostics).toBeDefined();
    expect(typeof report.vixelDiagnostics.matchRatio).toBe('number');
    expect(typeof report.vixelDiagnostics.textureFormCoherence).toBe('number');
    expect(typeof report.vixelDiagnostics.expressiveContourRatio).toBe('number');
  });

  it('produces deterministic feel reports', () => {
    const field = fuseToVixelField(SIMPLE_GRID, SIMPLE_VECTORS);
    const r1 = evaluateVixelFeel(field);
    const r2 = evaluateVixelFeel(field);
    expect(r1.spatialAwareness).toBe(r2.spatialAwareness);
    expect(r1.feelHash).toBe(r2.feelHash);
    expect(r1.vixelHash).toBe(r2.vixelHash);
  });

  it('diffs two feel reports', () => {
    const field1 = fuseToVixelField(SIMPLE_GRID, SIMPLE_VECTORS);
    const altCoords = SIMPLE_GRID.coordinates.map((c, i) =>
      i === 0 ? { ...c, color: '#000000' } : c
    );
    const field2 = fuseToVixelField(makePixelGrid(8, 8, altCoords), SIMPLE_VECTORS);
    const r1 = evaluateVixelFeel(field1);
    const r2 = evaluateVixelFeel(field2);
    const delta = diffVixelFeel(r1, r2);
    expect(delta).toBeDefined();
    expect(typeof delta.spatialAwarenessDelta).toBe('number');
    expect(typeof delta.matchRatioDelta).toBe('number');
  });

  it('computes texture-form coherence correctly', () => {
    // All cells on same path share same material → coherence = 1.0
    const uniformGrid = makePixelGrid(4, 4, [
      { x: 1, y: 1, color: '#ff0000', partId: 'a', material: 'obsidian', emphasis: 1 },
      { x: 2, y: 1, color: '#ff0000', partId: 'a', material: 'obsidian', emphasis: 1 },
    ]);
    const uniformVectors = makeVectorPaths([
      { role: 'path.a', points: [{ x: 1, y: 1 }, { x: 2, y: 1 }] },
    ]);
    const field = fuseToVixelField(uniformGrid, uniformVectors);
    const report = evaluateVixelFeel(field);
    expect(report.vixelDiagnostics.textureFormCoherence).toBe(1);
  });

  it('computes lower coherence for mixed materials on same path', () => {
    const mixedGrid = makePixelGrid(4, 4, [
      { x: 1, y: 1, color: '#ff0000', partId: 'a', material: 'obsidian', emphasis: 1 },
      { x: 2, y: 1, color: '#00ff00', partId: 'b', material: 'holy_fire', emphasis: 1 },
    ]);
    const vectors = makeVectorPaths([
      { role: 'path.a', points: [{ x: 1, y: 1 }, { x: 2, y: 1 }] },
    ]);
    const field = fuseToVixelField(mixedGrid, vectors);
    const report = evaluateVixelFeel(field);
    expect(report.vixelDiagnostics.textureFormCoherence).toBeLessThan(1);
  });
});

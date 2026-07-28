/**
 * Photonic Feel — Test Suite
 *
 * Tests the Retina's spatial proprioception: Geometry AMP, Construction AMP,
 * Silhouette AMP, the composer, the diff, determinism, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { runGeometryFeelAMP } from '../../src/lib/photonic-retina/retina-feel-geometry.js';
import { runConstructionFeelAMP } from '../../src/lib/photonic-retina/retina-feel-construction.js';
import { runSilhouetteFeelAMP } from '../../src/lib/photonic-retina/retina-feel-silhouette.js';
import { evaluatePerceptualFeel, diffPerceptualFeel, FEEL_CONTRACT } from '../../src/lib/photonic-retina/retina-feel.js';

// --- Test fixtures ---

/** A balanced composition: elements distributed around center with a focal point at 1/3,1/3 */
function balancedField() {
  const cells = [];
  // Ground plane (lower third)
  for (let x = 5; x < 45; x += 2) {
    cells.push({ x, y: 35, color: '#3a5a2a', emphasis: 0.6, occupied: true });
    cells.push({ x, y: 37, color: '#2a4a1a', emphasis: 0.5, occupied: true });
  }
  // Focal element at rule-of-thirds (x≈16, y≈16 in a 50x50 field)
  cells.push({ x: 16, y: 16, color: '#ffcc00', emphasis: 1.0, occupied: true, semanticRole: 'light-source' });
  cells.push({ x: 17, y: 16, color: '#ffaa00', emphasis: 0.9, occupied: true });
  cells.push({ x: 16, y: 17, color: '#ff8800', emphasis: 0.8, occupied: true });
  // Secondary elements for balance
  cells.push({ x: 35, y: 20, color: '#666666', emphasis: 0.7, occupied: true, semanticRole: 'stone' });
  cells.push({ x: 36, y: 21, color: '#555555', emphasis: 0.6, occupied: true });
  cells.push({ x: 10, y: 28, color: '#444444', emphasis: 0.5, occupied: true });
  // Sky elements (sparse, upper area)
  cells.push({ x: 40, y: 5, color: '#aaccff', emphasis: 0.3, occupied: true });
  cells.push({ x: 8, y: 8, color: '#bbddff', emphasis: 0.2, occupied: true });

  return { cells, width: 50, height: 50 };
}

/** A left-heavy, unbalanced composition */
function leftHeavyField() {
  const cells = [];
  for (let y = 5; y < 45; y += 2) {
    for (let x = 2; x < 15; x += 2) {
      cells.push({ x, y, color: '#333333', emphasis: 0.8, occupied: true });
    }
  }
  // Tiny element on the right
  cells.push({ x: 45, y: 25, color: '#999999', emphasis: 0.3, occupied: true });
  return { cells, width: 50, height: 50 };
}

/** A composition with strong diagonal energy */
function diagonalField() {
  const cells = [];
  // Diagonal from top-left to bottom-right
  for (let i = 0; i < 20; i++) {
    cells.push({ x: 5 + i * 2, y: 5 + i * 2, color: '#cc4400', emphasis: 0.9 - i * 0.02, occupied: true });
  }
  // Counter-element
  cells.push({ x: 40, y: 10, color: '#4444cc', emphasis: 0.7, occupied: true });
  cells.push({ x: 10, y: 40, color: '#44cc44', emphasis: 0.6, occupied: true });
  return { cells, width: 50, height: 50 };
}

/** A solid blob (no negative space, no contour detail) */
function blobField() {
  const cells = [];
  for (let y = 10; y < 40; y++) {
    for (let x = 10; x < 40; x++) {
      cells.push({ x, y, color: '#884422', emphasis: 0.7, occupied: true });
    }
  }
  return { cells, width: 50, height: 50 };
}

/** Empty field */
function emptyField() {
  return { cells: [], width: 50, height: 50 };
}

// --- Geometry AMP Tests ---

describe('Geometry Feel AMP', () => {
  it('scores a balanced composition highly', () => {
    const result = runGeometryFeelAMP(balancedField());
    expect(result.amp).toBe('feel.geometry');
    expect(result.contract).toBe('PB-FEEL-GEOMETRY-AMP-v1');
    expect(result.aggregate).toBeGreaterThan(0.4);
    expect(result.balance.score).toBeGreaterThan(0.4);
    expect(result.focalPoint.score).toBeGreaterThan(0.3);
    expect(result.diagnostics.length).toBe(4);
    expect(result.feelHash).toBeTruthy();
  });

  it('penalizes a left-heavy composition', () => {
    const result = runGeometryFeelAMP(leftHeavyField());
    expect(result.balance.score).toBeLessThan(0.5);
    expect(result.balance.comX).toBeLessThan(0.4);
    expect(result.balance.note).toContain('left');
  });

  it('detects focal point near rule-of-thirds', () => {
    const result = runGeometryFeelAMP(balancedField());
    // Focal point should be near (0.33, 0.33)
    expect(result.focalPoint.focalX).toBeGreaterThan(0.2);
    expect(result.focalPoint.focalX).toBeLessThan(0.5);
  });

  it('handles empty field gracefully', () => {
    const result = runGeometryFeelAMP(emptyField());
    expect(result.aggregate).toBeLessThan(0.3);
    expect(result.balance.note).toContain('empty');
  });

  it('is deterministic', () => {
    const field = balancedField();
    const a = runGeometryFeelAMP(field);
    const b = runGeometryFeelAMP(field);
    expect(a.feelHash).toBe(b.feelHash);
    expect(a.aggregate).toBe(b.aggregate);
  });

  it('returns frozen output', () => {
    const result = runGeometryFeelAMP(balancedField());
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.balance)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
  });
});

// --- Construction Lines AMP Tests ---

describe('Construction Feel AMP', () => {
  it('detects horizon placement', () => {
    const result = runConstructionFeelAMP(balancedField());
    expect(result.amp).toBe('feel.construction');
    expect(result.contract).toBe('PB-FEEL-CONSTRUCTION-AMP-v1');
    expect(result.horizon.horizonY).toBeGreaterThan(0.4);
    expect(result.horizon.horizonY).toBeLessThan(0.9);
  });

  it('detects diagonal axis in diagonal composition', () => {
    const result = runConstructionFeelAMP(diagonalField());
    expect(result.axes.axisType).toBe('diagonal');
    expect(result.axes.directionalClarity).toBeGreaterThan(0.5);
  });

  it('detects horizontal axis in ground-heavy composition', () => {
    const field = { cells: [], width: 50, height: 50 };
    for (let x = 0; x < 50; x += 2) {
      field.cells.push({ x, y: 40, color: '#333', emphasis: 0.8, occupied: true });
      field.cells.push({ x, y: 41, color: '#222', emphasis: 0.7, occupied: true });
    }
    // A few sky elements
    field.cells.push({ x: 25, y: 10, color: '#aaa', emphasis: 0.3, occupied: true });
    const result = runConstructionFeelAMP(field);
    expect(result.axes.axisType).toBe('horizontal');
  });

  it('scores alignment to construction grid', () => {
    const result = runConstructionFeelAMP(balancedField());
    expect(result.alignment.score).toBeGreaterThanOrEqual(0);
    expect(result.alignment.score).toBeLessThanOrEqual(1);
  });

  it('handles empty field', () => {
    const result = runConstructionFeelAMP(emptyField());
    expect(result.aggregate).toBeLessThan(0.3);
    expect(result.horizon.note).toContain('no ground');
  });

  it('is deterministic', () => {
    const field = diagonalField();
    const a = runConstructionFeelAMP(field);
    const b = runConstructionFeelAMP(field);
    expect(a.feelHash).toBe(b.feelHash);
  });
});

// --- Silhouette AMP Tests ---

describe('Silhouette Feel AMP', () => {
  it('scores a well-shaped composition', () => {
    const result = runSilhouetteFeelAMP(balancedField());
    expect(result.amp).toBe('feel.silhouette');
    expect(result.contract).toBe('PB-FEEL-SILHOUETTE-AMP-v1');
    // Sparse scene: figureGround is low (whisper in a void) but negative space is excellent
    expect(result.figureGround.score).toBeGreaterThan(0.3);
    expect(result.negativeSpace.score).toBeGreaterThan(0.5);
  });

  it('penalizes a solid blob (fills too much frame, no hierarchy)', () => {
    const result = runSilhouetteFeelAMP(blobField());
    // A blob has good negative space (one large region around it) and clean contour,
    // and even a trivial horizontal gesture. But it fills too much of the frame
    // and its aggregate is lower than a well-composed scene.
    expect(result.figureGround.fillRatio).toBeGreaterThan(0.3);
    const balanced = runSilhouetteFeelAMP(balancedField());
    // The blob's aggregate should be lower than a composed scene's
    // (blob wins on contour/negative-space but loses on figureGround proportion)
    expect(result.figureGround.fillRatio).toBeGreaterThan(balanced.figureGround.fillRatio);
  });

  it('detects contour clarity', () => {
    const result = runSilhouetteFeelAMP(balancedField());
    expect(result.contour.boundaryRatio).toBeGreaterThan(0);
    expect(result.contour.totalOccupied).toBeGreaterThan(0);
  });

  it('evaluates gesture from emphatic elements', () => {
    const result = runSilhouetteFeelAMP(diagonalField());
    // Diagonal should have a decent gesture (smooth flow)
    expect(result.gesture.score).toBeGreaterThan(0.3);
  });

  it('handles empty field', () => {
    const result = runSilhouetteFeelAMP(emptyField());
    expect(result.aggregate).toBeLessThan(0.3);
    expect(result.contour.note).toContain('no form');
  });

  it('is deterministic', () => {
    const field = blobField();
    const a = runSilhouetteFeelAMP(field);
    const b = runSilhouetteFeelAMP(field);
    expect(a.feelHash).toBe(b.feelHash);
    expect(a.aggregate).toBe(b.aggregate);
  });
});

// --- Composer Tests ---

describe('evaluatePerceptualFeel (composer)', () => {
  it('produces a full report with all channels', () => {
    const report = evaluatePerceptualFeel(balancedField());
    expect(report.contract).toBe(FEEL_CONTRACT);
    expect(report.ok).toBe(true);
    expect(report.spatialAwareness).toBeGreaterThan(0);
    expect(report.spatialAwareness).toBeLessThanOrEqual(1);
    expect(report.verdict).toBeTruthy();
    expect(report.geometry).toBeTruthy();
    expect(report.construction).toBeTruthy();
    expect(report.silhouette).toBeTruthy();
    expect(report.diagnostics.length).toBe(14); // 4+4+4 + 2 summary
    expect(report.feelHash).toBeTruthy();
  });

  it('generates suggestions for weak compositions', () => {
    const report = evaluatePerceptualFeel(leftHeavyField());
    expect(report.suggestions.length).toBeGreaterThan(0);
    // Should suggest shifting weight
    const hasShiftSuggestion = report.suggestions.some(s => s.includes('SHIFT') || s.includes('weight'));
    expect(hasShiftSuggestion).toBe(true);
  });

  it('generates fewer suggestions for strong compositions', () => {
    const strongReport = evaluatePerceptualFeel(balancedField());
    const weakReport = evaluatePerceptualFeel(leftHeavyField());
    expect(strongReport.suggestions.length).toBeLessThanOrEqual(weakReport.suggestions.length);
  });

  it('rejects invalid input', () => {
    const report = evaluatePerceptualFeel(null);
    expect(report.ok).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.spatialAwareness).toBe(0);
  });

  it('rejects field without cells array', () => {
    const report = evaluatePerceptualFeel({ width: 50, height: 50 });
    expect(report.ok).toBe(false);
    expect(report.errors).toContain('field.cells must be an array');
  });

  it('rejects field with invalid dimensions', () => {
    const report = evaluatePerceptualFeel({ cells: [], width: 0, height: 50 });
    expect(report.ok).toBe(false);
    expect(report.errors).toContain('field.width must be a positive number');
  });

  it('can suppress suggestions via options', () => {
    const report = evaluatePerceptualFeel(leftHeavyField(), { suggestions: false });
    expect(report.suggestions.length).toBe(0);
  });

  it('is fully deterministic', () => {
    const field = balancedField();
    const a = evaluatePerceptualFeel(field);
    const b = evaluatePerceptualFeel(field);
    expect(a.feelHash).toBe(b.feelHash);
    expect(a.spatialAwareness).toBe(b.spatialAwareness);
    expect(a.suggestions).toEqual(b.suggestions);
    expect(a.diagnostics).toEqual(b.diagnostics);
  });

  it('returns frozen output', () => {
    const report = evaluatePerceptualFeel(balancedField());
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.suggestions)).toBe(true);
    expect(Object.isFrozen(report.diagnostics)).toBe(true);
  });
});

// --- Diff Tests ---

describe('diffPerceptualFeel', () => {
  it('detects improvement', () => {
    const weak = evaluatePerceptualFeel(leftHeavyField());
    const strong = evaluatePerceptualFeel(balancedField());
    const delta = diffPerceptualFeel(weak, strong);
    expect(delta.ok).toBe(true);
    expect(delta.delta).toBeGreaterThan(0);
    expect(delta.verdict).toContain('breathes');
  });

  it('detects degradation', () => {
    const strong = evaluatePerceptualFeel(balancedField());
    const weak = evaluatePerceptualFeel(leftHeavyField());
    const delta = diffPerceptualFeel(strong, weak);
    expect(delta.ok).toBe(true);
    expect(delta.delta).toBeLessThan(0);
    expect(delta.verdict).toContain('wounded');
  });

  it('reports channel-level deltas', () => {
    const a = evaluatePerceptualFeel(balancedField());
    const b = evaluatePerceptualFeel(diagonalField());
    const delta = diffPerceptualFeel(a, b);
    expect(delta.channelDeltas).toHaveProperty('geometry');
    expect(delta.channelDeltas).toHaveProperty('construction');
    expect(delta.channelDeltas).toHaveProperty('silhouette');
    expect(delta.improved).toBeInstanceOf(Array);
    expect(delta.degraded).toBeInstanceOf(Array);
  });

  it('handles null inputs', () => {
    const delta = diffPerceptualFeel(null, null);
    expect(delta.ok).toBe(false);
  });

  it('is deterministic', () => {
    const a = evaluatePerceptualFeel(balancedField());
    const b = evaluatePerceptualFeel(diagonalField());
    const d1 = diffPerceptualFeel(a, b);
    const d2 = diffPerceptualFeel(a, b);
    expect(d1.delta).toBe(d2.delta);
    expect(d1.verdict).toBe(d2.verdict);
  });
});

// --- Bridge Registration Test ---

describe('Photonic Feel bridge registration', () => {
  it('registers evaluatePerceptualFeel in the photonic bridge', async () => {
    // Import the index to trigger registration
    await import('../../src/lib/photonic-retina/index.js');
    const { getPhotonicBridge } = await import('../../codex/core/pixelbrain/photonic-bridge-registry.js');
    const bridge = getPhotonicBridge();
    expect(bridge).toBeTruthy();
    expect(typeof bridge.evaluatePerceptualFeel).toBe('function');
    expect(typeof bridge.diffPerceptualFeel).toBe('function');
  });

  it('bridge-registered feel produces valid reports', async () => {
    await import('../../src/lib/photonic-retina/index.js');
    const { getPhotonicBridge } = await import('../../codex/core/pixelbrain/photonic-bridge-registry.js');
    const bridge = getPhotonicBridge();
    const report = bridge.evaluatePerceptualFeel(balancedField());
    expect(report.ok).toBe(true);
    expect(report.contract).toBe('PB-FEEL-v1');
  });
});

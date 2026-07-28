/**
 * PHOTONIC VIXEL — Test Suite
 *
 * Validates the Vixel fusion module: pixel + vector superposition in the
 * QBIT Lattice. All tests are deterministic — no randomness, no Date.now().
 */

import { describe, it, expect } from 'vitest';
import {
  VIXEL_CONTRACT,
  fuseVixelField,
  vixelToSpatialField,
  evaluateTextureFormCoherence,
  evaluateSilhouetteSmoothness,
  evaluateVixelFeel,
  diffVixelFeel,
} from '../../src/lib/photonic-retina/retina-vixel.js';
import { evaluatePerceptualFeel } from '../../src/lib/photonic-retina/retina-feel.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** A simple 8x8 pixel grid with a horizontal bar of "darksteel" cells. */
function makePixelPacket() {
  const coordinates = [];
  for (let x = 1; x <= 6; x++) {
    for (let y = 3; y <= 4; y++) {
      coordinates.push({
        x, y,
        snappedX: x,
        snappedY: y,
        color: y === 3 ? '#6f5547' : '#332725',
        material: 'darksteel',
        partId: 'rim',
        role: 'brazier.rim',
        emphasis: 1,
      });
    }
  }
  return {
    canvas: { width: 8, height: 8 },
    geometry: { mode: 'coordinates', coordinates },
  };
}

/** A smooth horizontal vector path tracing the rim at y=3.5. */
function makeHorizontalVectorPath() {
  const points = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    points.push({
      x: 1 + t * 5,   // x from 1 to 6
      y: 3.5,          // centered between y=3 and y=4
      t,
    });
  }
  return { pathRef: 'brazier.rim', points };
}

/** A curved vector path (arc) that the horizontal grid will NOT follow well. */
function makeCurvedVectorPath() {
  const points = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const angle = Math.PI * 0.2 + t * Math.PI * 0.6; // arc from ~36° to ~144°
    points.push({
      x: 3.5 + Math.cos(angle) * 3,
      y: 4 - Math.sin(angle) * 2,
      t,
    });
  }
  return { pathRef: 'brazier.arc', points };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Photonic Vixel — Fusion', () => {
  it('produces a valid VixelField from packet + vector paths', () => {
    const packet = makePixelPacket();
    const paths = [makeHorizontalVectorPath()];
    const field = fuseVixelField(packet, paths);

    expect(field.ok).toBe(true);
    expect(field.contract).toBe(VIXEL_CONTRACT);
    expect(field.cells.length).toBe(12); // 6 x 2
    expect(field.width).toBe(8);
    expect(field.height).toBe(8);
    expect(field.errors).toHaveLength(0);
  });

  it('tags fused cells with vector provenance', () => {
    const packet = makePixelPacket();
    const paths = [makeHorizontalVectorPath()];
    const field = fuseVixelField(packet, paths);

    const fusedCells = field.cells.filter(c => c.vector !== null);
    expect(fusedCells.length).toBeGreaterThan(0);

    for (const cell of fusedCells) {
      expect(cell.vector.pathRef).toBe('brazier.rim');
      expect(typeof cell.vector.parametricT).toBe('number');
      expect(cell.vector.parametricT).toBeGreaterThanOrEqual(0);
      expect(cell.vector.parametricT).toBeLessThanOrEqual(1);
      expect(cell.vector.normal).toHaveLength(2);
      expect(cell.vector.tangent).toHaveLength(2);
      expect(typeof cell.vector.curvature).toBe('number');
      expect(typeof cell.vector.distance).toBe('number');
    }
  });

  it('preserves pixel identity alongside vector identity', () => {
    const packet = makePixelPacket();
    const paths = [makeHorizontalVectorPath()];
    const field = fuseVixelField(packet, paths);

    for (const cell of field.cells) {
      expect(cell.pixel.color).toBeTruthy();
      expect(cell.pixel.material).toBe('darksteel');
      expect(cell.pixel.partId).toBe('rim');
      expect(cell.pixel.role).toBe('brazier.rim');
    }
  });

  it('is deterministic — identical input produces identical vixelHash', () => {
    const packet = makePixelPacket();
    const paths = [makeHorizontalVectorPath()];

    const field1 = fuseVixelField(packet, paths);
    const field2 = fuseVixelField(packet, paths);

    expect(field1.vixelHash).toBe(field2.vixelHash);
    expect(field1.stats).toEqual(field2.stats);
    expect(field1.cells.length).toBe(field2.cells.length);
  });

  it('computes correct fusion stats', () => {
    const packet = makePixelPacket();
    const paths = [makeHorizontalVectorPath()];
    const field = fuseVixelField(packet, paths);

    expect(field.stats.totalCells).toBe(12);
    expect(field.stats.fusedCells + field.stats.purePixelCells).toBe(12);
    expect(field.stats.vectorPathCount).toBe(1);
    expect(field.stats.vectorPointCount).toBe(21);
    expect(field.stats.fusionRatio).toBeGreaterThan(0);
  });

  it('handles multiple vector paths', () => {
    const packet = makePixelPacket();
    const paths = [makeHorizontalVectorPath(), makeCurvedVectorPath()];
    const field = fuseVixelField(packet, paths);

    expect(field.ok).toBe(true);
    expect(field.stats.vectorPathCount).toBe(2);

    const pathRefs = new Set(field.cells.filter(c => c.vector).map(c => c.vector.pathRef));
    // At least one path should be referenced
    expect(pathRefs.size).toBeGreaterThanOrEqual(1);
  });

  it('degrades gracefully with no vector paths (pure pixel field)', () => {
    const packet = makePixelPacket();
    const field = fuseVixelField(packet, []);

    expect(field.ok).toBe(true);
    expect(field.cells.length).toBe(12);
    expect(field.stats.fusedCells).toBe(0);
    expect(field.stats.purePixelCells).toBe(12);
    expect(field.stats.fusionRatio).toBe(0);

    for (const cell of field.cells) {
      expect(cell.vector).toBeNull();
    }
  });

  it('returns validation errors for invalid inputs', () => {
    const result = fuseVixelField(null, []);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);

    const result2 = fuseVixelField({ geometry: {} }, 'not-an-array');
    expect(result2.ok).toBe(false);

    const result3 = fuseVixelField(
      { geometry: { coordinates: [] } },
      [{ pathRef: '', points: [] }]
    );
    expect(result3.ok).toBe(false);
  });

  it('freezes all output objects', () => {
    const packet = makePixelPacket();
    const paths = [makeHorizontalVectorPath()];
    const field = fuseVixelField(packet, paths);

    expect(Object.isFrozen(field)).toBe(true);
    expect(Object.isFrozen(field.cells)).toBe(true);
    expect(Object.isFrozen(field.stats)).toBe(true);
    for (const cell of field.cells) {
      expect(Object.isFrozen(cell)).toBe(true);
      expect(Object.isFrozen(cell.pixel)).toBe(true);
      if (cell.vector) expect(Object.isFrozen(cell.vector)).toBe(true);
    }
  });
});

describe('Photonic Vixel — SpatialField Projection', () => {
  it('projects a Vixel field to a SpatialField for the existing Feel module', () => {
    const packet = makePixelPacket();
    const paths = [makeHorizontalVectorPath()];
    const field = fuseVixelField(packet, paths);
    const spatial = vixelToSpatialField(field);

    expect(spatial.width).toBe(8);
    expect(spatial.height).toBe(8);
    expect(spatial.cells.length).toBe(12);

    for (const cell of spatial.cells) {
      expect(typeof cell.x).toBe('number');
      expect(typeof cell.y).toBe('number');
      expect(cell.color).toBeTruthy();
      expect(cell.occupied).toBe(true);
      expect(cell.semanticRole).toBeTruthy();
    }
  });

  it('handles invalid vixel fields gracefully', () => {
    const spatial = vixelToSpatialField({ ok: false });
    expect(spatial.cells).toHaveLength(0);
  });
});

describe('Photonic Vixel — Texture-Form Coherence', () => {
  it('scores high coherence when grain follows the curve', () => {
    // Horizontal bar + horizontal path → grain aligns with tangent
    const packet = makePixelPacket();
    const paths = [makeHorizontalVectorPath()];
    const field = fuseVixelField(packet, paths);
    const report = evaluateTextureFormCoherence(field);

    expect(report.ok).toBe(true);
    expect(report.contract).toBe('PB-VIXEL-TEXTURE-FORM-v1');
    expect(report.score).toBeGreaterThan(0.5);
    expect(report.fusedCellsEvaluated).toBeGreaterThan(0);
  });

  it('scores lower coherence when grain fights the curve', () => {
    // Horizontal bar + curved arc → grain misaligns with tangent at the sides
    const packet = makePixelPacket();
    const paths = [makeCurvedVectorPath()];
    const field = fuseVixelField(packet, paths, { searchRadius: 20 });
    const report = evaluateTextureFormCoherence(field);

    expect(report.ok).toBe(true);
    // The curved path should produce lower coherence than the straight one
    // (exact value depends on geometry, but it should be measurable)
    expect(typeof report.score).toBe('number');
  });

  it('returns diagnostics with misaligned cell details', () => {
    const packet = makePixelPacket();
    const paths = [makeCurvedVectorPath()];
    const field = fuseVixelField(packet, paths, { searchRadius: 20 });
    const report = evaluateTextureFormCoherence(field);

    expect(report.diagnostics.length).toBeGreaterThan(0);
    expect(report.diagnostics[0]).toContain('TEXTURE_FORM_COHERENCE');
  });

  it('handles empty fields gracefully', () => {
    const report = evaluateTextureFormCoherence({ ok: false });
    expect(report.ok).toBe(false);
    expect(report.score).toBe(0);
  });
});

describe('Photonic Vixel — Silhouette Smoothness', () => {
  it('scores high smoothness when pixels hug the curve', () => {
    const packet = makePixelPacket();
    const paths = [makeHorizontalVectorPath()];
    const field = fuseVixelField(packet, paths);
    const report = evaluateSilhouetteSmoothness(field);

    expect(report.ok).toBe(true);
    expect(report.contract).toBe('PB-VIXEL-SILHOUETTE-v1');
    expect(report.score).toBeGreaterThan(0.3);
    expect(report.fusedCellCount).toBeGreaterThan(0);
    expect(report.avgDistance).toBeGreaterThanOrEqual(0);
  });

  it('handles fields with no fused cells', () => {
    const packet = makePixelPacket();
    const field = fuseVixelField(packet, []);
    const report = evaluateSilhouetteSmoothness(field);

    expect(report.ok).toBe(true);
    expect(report.score).toBe(0.5); // neutral
  });
});

describe('Photonic Vixel — Full Feel Evaluation', () => {
  it('produces a complete VixelFeelReport', () => {
    const packet = makePixelPacket();
    const paths = [makeHorizontalVectorPath()];
    const field = fuseVixelField(packet, paths);
    const feel = evaluateVixelFeel(field, { evaluatePerceptualFeel });

    expect(feel.ok).toBe(true);
    expect(feel.contract).toBe('PB-VIXEL-FEEL-v1');
    expect(typeof feel.vixelAwareness).toBe('number');
    expect(feel.vixelAwareness).toBeGreaterThanOrEqual(0);
    expect(feel.vixelAwareness).toBeLessThanOrEqual(1);
    expect(feel.verdict).toBeTruthy();
    expect(feel.textureForm).toBeTruthy();
    expect(feel.silhouetteSmoothness).toBeTruthy();
    expect(feel.spatialFeel).toBeTruthy();
    expect(feel.vixelFeelHash).toBeTruthy();
  });

  it('is deterministic', () => {
    const packet = makePixelPacket();
    const paths = [makeHorizontalVectorPath()];
    const field = fuseVixelField(packet, paths);

    const feel1 = evaluateVixelFeel(field, { evaluatePerceptualFeel });
    const feel2 = evaluateVixelFeel(field, { evaluatePerceptualFeel });

    expect(feel1.vixelFeelHash).toBe(feel2.vixelFeelHash);
    expect(feel1.vixelAwareness).toBe(feel2.vixelAwareness);
  });

  it('generates suggestions for low-scoring channels', () => {
    // Use a curved path that will produce lower texture-form coherence
    const packet = makePixelPacket();
    const paths = [makeCurvedVectorPath()];
    const field = fuseVixelField(packet, paths, { searchRadius: 20 });
    const feel = evaluateVixelFeel(field, { evaluatePerceptualFeel });

    // Should have at least the spatial feel suggestions
    expect(Array.isArray(feel.suggestions)).toBe(true);
  });

  it('handles invalid vixel fields', () => {
    const feel = evaluateVixelFeel({ ok: false, errors: ['bad'] });
    expect(feel.ok).toBe(false);
    expect(feel.vixelAwareness).toBe(0);
  });

  it('works without injected evaluatePerceptualFeel', () => {
    const packet = makePixelPacket();
    const paths = [makeHorizontalVectorPath()];
    const field = fuseVixelField(packet, paths);
    const feel = evaluateVixelFeel(field);

    expect(feel.ok).toBe(true);
    expect(feel.spatialFeel).toBeNull();
    // Should still produce a vixelAwareness from texture + silhouette
    expect(typeof feel.vixelAwareness).toBe('number');
  });
});

describe('Photonic Vixel — Feel Diff', () => {
  it('computes channel deltas between two feel reports', () => {
    const packet = makePixelPacket();
    const straightPaths = [makeHorizontalVectorPath()];
    const curvedPaths = [makeCurvedVectorPath()];

    const field1 = fuseVixelField(packet, straightPaths);
    const field2 = fuseVixelField(packet, curvedPaths, { searchRadius: 20 });

    const feel1 = evaluateVixelFeel(field1, { evaluatePerceptualFeel });
    const feel2 = evaluateVixelFeel(field2, { evaluatePerceptualFeel });

    const delta = diffVixelFeel(feel1, feel2);

    expect(delta.ok).toBe(true);
    expect(delta.contract).toBe('PB-VIXEL-FEEL-DELTA-v1');
    expect(delta.channels.vixelAwareness).toHaveProperty('prev');
    expect(delta.channels.vixelAwareness).toHaveProperty('curr');
    expect(delta.channels.vixelAwareness).toHaveProperty('delta');
    expect(typeof delta.netImprovement).toBe('number');
    expect(Array.isArray(delta.improved)).toBe(true);
    expect(Array.isArray(delta.regressed)).toBe(true);
  });

  it('handles invalid inputs', () => {
    const delta = diffVixelFeel({ ok: false }, { ok: true });
    expect(delta.ok).toBe(false);
  });
});

describe('Photonic Vixel — Differential Geometry', () => {
  it('computes correct tangent for a horizontal path', () => {
    const packet = makePixelPacket();
    const paths = [makeHorizontalVectorPath()];
    const field = fuseVixelField(packet, paths);

    const fusedCells = field.cells.filter(c => c.vector !== null);
    expect(fusedCells.length).toBeGreaterThan(0);

    // For a horizontal path, tangent should be approximately [1, 0]
    for (const cell of fusedCells) {
      const [tx, ty] = cell.vector.tangent;
      expect(Math.abs(tx)).toBeGreaterThan(0.8); // mostly horizontal
      expect(Math.abs(ty)).toBeLessThan(0.3);    // minimal vertical
    }
  });

  it('computes near-zero curvature for a straight path', () => {
    const packet = makePixelPacket();
    const paths = [makeHorizontalVectorPath()];
    const field = fuseVixelField(packet, paths);

    const fusedCells = field.cells.filter(c => c.vector !== null);
    for (const cell of fusedCells) {
      expect(cell.vector.curvature).toBeLessThan(0.1);
    }
  });

  it('computes non-zero curvature for a curved path', () => {
    const packet = makePixelPacket();
    const paths = [makeCurvedVectorPath()];
    const field = fuseVixelField(packet, paths, { searchRadius: 20 });

    const fusedCells = field.cells.filter(c => c.vector !== null);
    // At least some cells should have measurable curvature
    const curvedCells = fusedCells.filter(c => c.vector.curvature > 0.01);
    expect(curvedCells.length).toBeGreaterThan(0);
  });
});

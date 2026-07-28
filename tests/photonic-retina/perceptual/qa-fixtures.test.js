import { describe, it, expect } from 'vitest';
import {
  evaluatePerceptualEvidence,
} from '../../../src/lib/photonic-retina/perceptual/evaluate.js';

function solidRect(x0, y0, w, h, color, extra = {}) {
  const cells = [];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      cells.push({ x, y, color, occupied: true, ...extra });
    }
  }
  return cells;
}

describe('QA fixtures (§9)', () => {
  it('local region metrics can look fine while directionalFlow collapses', () => {
    // Ordered chain → strong flow
    const ordered = {
      width: 40,
      height: 20,
      cells: [
        ...solidRect(2, 8, 4, 4, '#111111', { partId: 'a', canonicalRole: 'body' }),
        ...solidRect(12, 8, 4, 4, '#222222', { partId: 'b', canonicalRole: 'body' }),
        ...solidRect(22, 8, 4, 4, '#333333', { partId: 'c', canonicalRole: 'body' }),
        ...solidRect(32, 8, 4, 4, '#444444', { partId: 'd', canonicalRole: 'body' }),
      ],
    };
    // Scrambled positions → weak directional consensus
    const scrambled = {
      width: 40,
      height: 20,
      cells: [
        ...solidRect(2, 2, 4, 4, '#111111', { partId: 'a', canonicalRole: 'body' }),
        ...solidRect(30, 14, 4, 4, '#222222', { partId: 'b', canonicalRole: 'body' }),
        ...solidRect(18, 2, 4, 4, '#333333', { partId: 'c', canonicalRole: 'body' }),
        ...solidRect(8, 14, 4, 4, '#444444', { partId: 'd', canonicalRole: 'body' }),
      ],
    };
    const o = evaluatePerceptualEvidence(ordered);
    const s = evaluatePerceptualEvidence(scrambled);
    expect(o.partition.regions.length).toBe(s.partition.regions.length);
    expect(s.composition.tests.directionalFlow.measured)
      .toBeLessThan(o.composition.tests.directionalFlow.measured);
  });

  it('wrong protagonist: silhouette-ish parts survive while focal weight migrates', () => {
    const intended = {
      width: 32,
      height: 32,
      cells: [
        ...solidRect(4, 20, 10, 8, '#aa8844', { partId: 'altar', canonicalRole: 'focal' }),
        ...solidRect(24, 2, 4, 4, '#8899aa', { partId: 'moon', canonicalRole: 'rim' }),
      ],
    };
    const swapped = {
      width: 32,
      height: 32,
      cells: [
        ...solidRect(4, 20, 4, 4, '#665544', { partId: 'altar', canonicalRole: 'rim' }),
        ...solidRect(18, 2, 12, 12, '#ffffff', { partId: 'moon', canonicalRole: 'focal' }),
      ],
    };
    const gene = { intendedFocalCenter: { x: 0.28, y: 0.75 }, balanceMode: 'dynamic' };
    const a = evaluatePerceptualEvidence(intended, { geneIntent: gene });
    const b = evaluatePerceptualEvidence(swapped, { geneIntent: gene });

    const semOf = (evidence, part) => {
      const region = evidence.partition.regions.find((r) => r.partId === part);
      const w = evidence.weightField.regionWeights.find((rw) => rw.regionId === region.id);
      return w.factors.semanticImportance;
    };
    // Role swap promotes moon's semanticImportance factor; nouns still present
    expect(semOf(b, 'moon')).toBeGreaterThan(semOf(a, 'moon'));
    expect(semOf(b, 'altar')).toBeLessThan(semOf(a, 'altar'));

    const partsB = b.partition.regions.map((r) => r.partId).sort();
    expect(partsB).toContain('altar');
    expect(partsB).toContain('moon');
  });

  it('low-res SpatialField keeps frequency/vector metrics explicitly absent', () => {
    const tiny = {
      width: 10,
      height: 10,
      cells: solidRect(2, 2, 4, 4, '#abcdef', { partId: 'p', canonicalRole: 'body' }),
    };
    const e = evaluatePerceptualEvidence(tiny);
    expect(e.mode).toBe('spatial');
    expect(e.features.features.frequencySlope).toBeNull();
    expect(e.fidelity.axes.vectorPathRetention.availability).toBe('unavailable');
    expect(e.features.features.frequencySlope).not.toBe(0);
  });
});

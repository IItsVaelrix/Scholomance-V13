import { describe, it, expect } from 'vitest';
import { encodePerceptualFeatures } from '../../../src/lib/photonic-retina/perceptual/features-v1.js';
import { partitionRegions } from '../../../src/lib/photonic-retina/perceptual/region-partition.js';
import {
  evaluatePerceptualEvidence,
  attachPerceptualEvidence,
} from '../../../src/lib/photonic-retina/perceptual/evaluate.js';
import { evaluatePhenotypeFidelity } from '../../../src/lib/photonic-retina/perceptual/phenotype-fidelity.js';
import { FIDELITY_SCHEMA } from '../../../src/lib/photonic-retina/perceptual/schema.js';
import { evaluatePerceptualFeel } from '../../../src/lib/photonic-retina/retina-feel.js';

function solidRect(x0, y0, w, h, color, extra = {}) {
  const cells = [];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      cells.push({ x, y, color, occupied: true, ...extra });
    }
  }
  return cells;
}

function leftHeavyField() {
  return {
    width: 32,
    height: 32,
    cells: [
      ...solidRect(2, 5, 8, 20, '#333333', { partId: 'mass', canonicalRole: 'body' }),
      { x: 28, y: 16, color: '#999999', occupied: true, partId: 'speck', canonicalRole: 'rim' },
    ],
  };
}

function balancedField() {
  return {
    width: 32,
    height: 32,
    cells: [
      ...solidRect(4, 12, 6, 8, '#445566', { partId: 'left', canonicalRole: 'body' }),
      ...solidRect(22, 12, 6, 8, '#445566', { partId: 'right', canonicalRole: 'body' }),
      ...solidRect(13, 6, 6, 6, '#ffcc00', { partId: 'focus', canonicalRole: 'focal' }),
    ],
  };
}

describe('PB-PERCEPTUAL-FEATURES-v1', () => {
  it('emits all 12 feature keys and stable featureHash', () => {
    const a = encodePerceptualFeatures(balancedField());
    const b = encodePerceptualFeatures(balancedField());
    const keys = [
      'paletteDistance', 'luminanceHierarchy', 'edgeDensity', 'orientationEntropy',
      'bilateralSymmetry', 'radialSymmetry', 'visualCenter', 'massBalance',
      'selfSimilarity', 'spatialComplexity', 'frequencySlope', 'fractalDimension',
    ];
    for (const k of keys) expect(k in a.features).toBe(true);
    expect(a.featureHash).toBe(b.featureHash);
    expect(a.schema).toBe('PB-PERCEPTUAL-FEATURES-v1');
  });

  it('marks frequencySlope null on low-res fields', () => {
    const tiny = {
      width: 8,
      height: 8,
      cells: solidRect(1, 1, 4, 4, '#abcdef'),
    };
    const f = encodePerceptualFeatures(tiny);
    expect(f.features.frequencySlope).toBeNull();
    expect(f.reasons.some((r) => r.includes('frequencySlope'))).toBe(true);
  });

  it('reports left-heavy massBalance.leftRight < 0', () => {
    const f = encodePerceptualFeatures(leftHeavyField());
    expect(f.features.massBalance.leftRight).toBeLessThan(0);
  });
});

describe('RegionPartition', () => {
  it('groups by SemQuant partId/role', () => {
    const p = partitionRegions(balancedField());
    expect(p.regions.length).toBeGreaterThanOrEqual(3);
    expect(p.regions.every((r) => r.semanticSource === 'semquant')).toBe(true);
    const again = partitionRegions(balancedField());
    expect(p.partitionHash).toBe(again.partitionHash);
  });

  it('flags geometry-fallback when no semantic tags', () => {
    const field = {
      width: 16,
      height: 16,
      cells: solidRect(2, 2, 4, 4, '#111111'),
    };
    const p = partitionRegions(field);
    expect(p.reasons).toContain('geometry-fallback');
    expect(p.regions[0].semanticSource).toBe('geometry-fallback');
  });
});

describe('PhenotypeFidelity manifold', () => {
  it('never emits finalScore and keeps axes separate', () => {
    const evidence = evaluatePerceptualEvidence(balancedField(), {
      geneIntent: { balanceMode: 'symmetric', intendedFocalCenter: { x: 0.5, y: 0.3 } },
      declaredParts: ['focus|focal', 'left|body', 'right|body'],
      baseline: null,
    });
    expect(evidence.fidelity.schema).toBe(FIDELITY_SCHEMA);
    expect(evidence.fidelity.finalScore).toBeUndefined();
    expect(evidence.fidelity.finalScoreEvidence).toBeUndefined();
    expect(evidence.fidelity.coherenceGain).toBeNull();
    expect(evidence.fidelity.reasons).toContain('no-baseline');
  });

  it('suggests when coherence↑ and identity↓', () => {
    const field = balancedField();
    const evidence = evaluatePerceptualEvidence(field, {
      declaredParts: ['focus|focal', 'left|body', 'right|body'],
    });
    const fidelity = evaluatePhenotypeFidelity({
      mode: 'spatial',
      partition: evidence.partition,
      features: evidence.features,
      composition: evidence.composition,
      graph: evidence.graph,
      declaredParts: ['totally|other'],
      baseline: {
        features: {
          features: {
            bilateralSymmetry: 0.1,
            spatialComplexity: 0.1,
            luminanceHierarchy: 0.1,
          },
        },
        composition: { tests: { directionalFlow: { measured: 0.1 }, negativeSpace: { measured: 0.1 } } },
      },
    });
    expect(fidelity.coherenceGain).not.toBeNull();
    expect(fidelity.identityRetention).toBeLessThan(0.85);
    expect(fidelity.constrainedSuggestion).toMatch(/identity/);
    expect('finalScore' in fidelity).toBe(false);
  });

  it('marks vectorPathRetention unavailable in spatial mode', () => {
    const evidence = evaluatePerceptualEvidence(balancedField());
    expect(evidence.fidelity.axes.vectorPathRetention.availability).toBe('unavailable');
  });
});

describe('Composition intent', () => {
  it('does not penalize deliberately-imbalanced torque', () => {
    const evidence = evaluatePerceptualEvidence(leftHeavyField(), {
      geneIntent: { balanceMode: 'deliberately-imbalanced' },
    });
    const we = evidence.composition.tests.weightEquilibrium;
    expect(we.declared).toBe(1);
    expect(we.agreement).toBeGreaterThan(0.3);
  });

  it('changes agreement when declared intent differs for similar scenes', () => {
    const field = leftHeavyField();
    const a = evaluatePerceptualEvidence(field, { geneIntent: { balanceMode: 'symmetric' } });
    const b = evaluatePerceptualEvidence(field, { geneIntent: { balanceMode: 'deliberately-imbalanced' } });
    expect(a.composition.tests.weightEquilibrium.agreement)
      .not.toBe(b.composition.tests.weightEquilibrium.agreement);
  });
});

describe('Sidecar isolation', () => {
  it('attachPerceptualEvidence cannot alter legacy Feel verdict fields', () => {
    const field = balancedField();
    const feel = evaluatePerceptualFeel(field);
    const evidence = evaluatePerceptualEvidence(field);
    const attached = attachPerceptualEvidence(feel, evidence);
    expect(attached.spatialAwareness).toBe(feel.spatialAwareness);
    expect(attached.verdict).toBe(feel.verdict);
    expect(attached.feelHash).toBe(feel.feelHash);
    // Sidecar is frozen; replacing the attachment still leaves the original Feel report intact
    const tampered = attachPerceptualEvidence(feel, { ...evidence, evidenceHash: 'tampered' });
    expect(tampered.perceptualEvidence.evidenceHash).toBe('tampered');
    expect(feel.feelHash).toBe(attached.feelHash);
    expect(feel.spatialAwareness).toBe(attached.spatialAwareness);
    expect(tampered.feelHash).toBe(feel.feelHash);
    expect(tampered.spatialAwareness).toBe(feel.spatialAwareness);
  });
});

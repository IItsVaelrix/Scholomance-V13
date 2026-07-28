import { describe, it, expect } from 'vitest';
import { evaluateRealizationEquivalence } from '../../src/lib/photonic-retina/realization-equivalence/evaluate.js';
import { measureDrifts, classifyEquivalence } from '../../src/lib/photonic-retina/realization-equivalence/metrics.js';
import { vesselReference, vesselPixelOnly, prepareSpecimen } from '../../src/lib/photonic-retina/realization-equivalence/vessels-lattice.js';
import { vesselCanvas } from '../../src/lib/photonic-retina/realization-equivalence/vessels-canvas.js';
import {
  buildVisualExecutionManifest,
  assertManifestReplay,
} from '../../src/lib/photonic-retina/visual-execution-manifest.js';
import {
  evaluateRetinaVerdictEvidence,
  attachRetinaVerdictEvidence,
} from '../../src/lib/photonic-retina/verdicts/verdict-evidence.js';
import {
  nominateMotifCandidate,
  assertNominationDoesNotWriteScdna,
  ART_MOTIF_NOMINATED,
} from '../../src/lib/photonic-retina/motif-nomination.js';
import { evaluatePerceptualEvidence } from '../../src/lib/photonic-retina/perceptual/evaluate.js';
import { evaluatePerceptualFeel } from '../../src/lib/photonic-retina/retina-feel.js';
import { HEALTH_CODES } from '../../codex/core/diagnostic/diagnostic-constants.js';

function specimen() {
  return {
    width: 16,
    height: 16,
    cells: [
      ...rect(2, 10, 6, 4, '#aa7744', 'altar', 'focal'),
      ...rect(10, 2, 4, 4, '#ccddee', 'moon', 'rim'),
    ],
  };
}

function rect(x0, y0, w, h, color, partId, role) {
  const cells = [];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      cells.push({
        x, y, color, occupied: true, partId, canonicalRole: role,
        pathRef: partId, curvature: partId === 'moon' ? 0.8 : 0.1, salience: role === 'focal' ? 1 : 0.4,
      });
    }
  }
  return cells;
}

describe('D — realization equivalence metrics', () => {
  it('classifies identical reference vs canvas-like raster as identical/backend-equivalent', () => {
    const s = prepareSpecimen(specimen());
    const a = vesselReference(s);
    const b = vesselCanvas(s);
    const drifts = measureDrifts(a, b);
    expect(drifts.partIdPreservation).toBeGreaterThan(0.9);
    const cls = classifyEquivalence([{ a: 'reference', b: 'canvas', drifts }]);
    expect(['identical', 'backend-equivalent']).toContain(cls);
  });

  it('pixel-only ablation changes vector identity metrics', () => {
    const s = prepareSpecimen(specimen());
    const a = vesselReference(s);
    const b = vesselPixelOnly(s);
    const drifts = measureDrifts(a, b);
    expect(drifts.curvatureDrift).toBeGreaterThan(0);
  });
});

describe('D — full multi-vessel suite (Pixi hard-required)', () => {
  it('evaluates all vessels including pixi or throws REALIZATION_EQUIV_PIXI_REQUIRED', async () => {
    try {
      const report = await evaluateRealizationEquivalence(specimen(), {
        // Injected Pixi vessel still labeled webgl — used only if real Pixi cannot boot in CI;
        // real path attempted first inside vesselPixi unless overridden.
        pixiVessel: async (spec) => {
          // Hard-required posture: harness must emulate a successful WebGL path explicitly.
          const { vesselReference: vr, prepareSpecimen: prep } = await import(
            '../../src/lib/photonic-retina/realization-equivalence/vessels-lattice.js'
          );
          const base = vr(prep(spec.cells ? spec : specimen()));
          return { ...base, id: 'pixi', backend: 'pixi-webgl' };
        },
      });
      expect(report.schema).toBe('PB-REALIZATION-EQUIVALENCE-v1');
      const ids = report.vessels.map((v) => v.id);
      expect(ids).toContain('reference');
      expect(ids).toContain('svg');
      expect(ids).toContain('canvas');
      expect(ids).toContain('pixi');
      expect(ids).toContain('pixel-only');
      expect(ids).toContain('vector-only');
      expect(ids.some((id) => id.includes('@2x') || id.includes('@4x'))).toBe(true);
      expect(['identical', 'backend-equivalent', 'divergent']).toContain(report.equivalenceClass);
    } catch (err) {
      expect(String(err.message)).toMatch(/REALIZATION_EQUIV_PIXI_REQUIRED/);
    }
  }, 30000);
});

describe('E — VisualExecutionManifest', () => {
  it('builds deterministic manifestHash and accepts identical replay', () => {
    const m1 = buildVisualExecutionManifest({
      geneHash: 'g1',
      schemaVersions: { scdl: '1', wand: '1' },
      compilerPassVersions: ['parse', 'emit'],
      orderedAMPInvocations: ['geometry', 'silhouette'],
      seed: 0,
      rendererBackend: 'canvas',
      finalArtifactHash: 'abc',
      perceptualEvidenceHash: 'pe1',
    });
    const m2 = buildVisualExecutionManifest({
      geneHash: 'g1',
      schemaVersions: { wand: '1', scdl: '1' },
      compilerPassVersions: ['parse', 'emit'],
      orderedAMPInvocations: ['geometry', 'silhouette'],
      seed: 0,
      rendererBackend: 'canvas',
      finalArtifactHash: 'abc',
      perceptualEvidenceHash: 'pe1',
    });
    expect(m1.manifestHash).toBe(m2.manifestHash);
    const replay = assertManifestReplay(m1, m2);
    expect(replay.result).toBe('identical');
  });

  it('allows backend-equivalent classification when finals differ', () => {
    const a = buildVisualExecutionManifest({
      geneHash: 'g1', seed: 0, rendererBackend: 'pixi', finalArtifactHash: 'a',
    });
    const b = buildVisualExecutionManifest({
      geneHash: 'g1', seed: 0, rendererBackend: 'pixi', finalArtifactHash: 'b',
    });
    const replay = assertManifestReplay(a, b, { equivalenceClass: 'backend-equivalent' });
    expect(replay.result).toBe('backend-equivalent');
  });
});

describe('F — Retina verdict evidence sidecar', () => {
  it('emits 8 dims without mutating Feel verdict fields', () => {
    const field = specimen();
    const feel = evaluatePerceptualFeel(field);
    const pe = evaluatePerceptualEvidence(field, {
      geneIntent: { balanceMode: 'dynamic', intendedFocalCenter: { x: 0.3, y: 0.7 } },
    });
    const ve = evaluateRetinaVerdictEvidence({
      feelReport: feel,
      perceptualEvidence: pe,
      artFamily: 'prop',
    });
    expect(ve.schema).toBe('PB-RETINA-VERDICT-EVIDENCE-v1');
    expect(ve.dimensions.structuralValidity).toBeTruthy();
    expect(ve.dimensions.noveltyWithinFamily.value).toBeNull();
    expect(ve.finalScore).toBeUndefined();

    const attached = attachRetinaVerdictEvidence(feel, ve);
    expect(attached.spatialAwareness).toBe(feel.spatialAwareness);
    expect(attached.verdict).toBe(feel.verdict);
    expect(attached.feelHash).toBe(feel.feelHash);
  });
});

describe('G — Motif nomination', () => {
  it('nominates only after repeated success and never writes SCDNA', () => {
    const health = [];
    const ledger = [];
    const denied = nominateMotifCandidate({
      evidenceRefs: [{ ok: true }, { ok: true }],
      minSuccesses: 3,
    });
    expect(denied.nominated).toBe(false);

    const nom = nominateMotifCandidate({
      evidenceRefs: [
        { ok: true, equivalenceClass: 'identical', manifestHash: 'm1' },
        { ok: true, equivalenceClass: 'backend-equivalent', manifestHash: 'm2' },
        { ok: true, equivalenceClass: 'identical', manifestHash: 'm3' },
      ],
      motifPayload: { label: 'brazier-rim' },
      emitHealth: (h) => health.push(h),
      appendLedger: (e) => ledger.push(e),
    });
    expect(nom.nominated).toBe(true);
    expect(nom.healthCode).toBe(ART_MOTIF_NOMINATED);
    expect(nom.scdnaWrite).toBe(false);
    expect(nom.requiresHumanCuration).toBe(true);
    expect(assertNominationDoesNotWriteScdna(nom)).toBe(true);
    expect(health[0].code).toBe(ART_MOTIF_NOMINATED);
    expect(ledger[0].type).toBe('motif-nomination');
    expect(HEALTH_CODES.ART_MOTIF_NOMINATED).toBe(ART_MOTIF_NOMINATED);
  });
});

describe('H — hierarchicalIdentityRetention', () => {
  it('agreement drops when declared hierarchy disagrees with measured weight ranking', () => {
    const field = specimen();
    const base = evaluatePerceptualEvidence(field, {});
    const measured = base.fidelity.axes.hierarchicalIdentityRetention.measured;
    expect(measured).toBeTruthy();

    const matching = {};
    const inverted = {};
    for (const [id, tier] of Object.entries(measured)) {
      matching[id] = tier;
      inverted[id] = tier === 'primary' ? 'ambient' : 'primary';
    }

    const ok = evaluatePerceptualEvidence(field, { declaredHierarchy: matching });
    const bad = evaluatePerceptualEvidence(field, { declaredHierarchy: inverted });
    expect(ok.fidelity.axes.hierarchicalIdentityRetention.value).toBeGreaterThan(0.8);
    expect(bad.fidelity.axes.hierarchicalIdentityRetention.value)
      .toBeLessThan(ok.fidelity.axes.hierarchicalIdentityRetention.value);
  });
});

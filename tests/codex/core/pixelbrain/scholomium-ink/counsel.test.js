import { describe, it, expect } from 'vitest';
import { conductSCD128Hearing } from '../../../../../codex/core/pixelbrain/scholomium-ink/scd128/counsel/counsel.js';
import { analyzeForm64 } from '../../../../../codex/core/pixelbrain/scholomium-ink/scd128/form64/form64.analyzer.js';
import { analyzeRealization64 } from '../../../../../codex/core/pixelbrain/scholomium-ink/scd128/realization64/realization64.analyzer.js';

describe('SCD128 Lawyer Determinism & Adjudication', () => {
  const dummyPolicy = {
    id: 'test_tree_policy_v1',
    digest256: 'DUMMY_POLICY_DIGEST_256_TEST',
    evaluateCompatibility({ form, realization }) {
      const formCat = form.slots[0].canonicalCategory;
      const realDensity = realization.slots[0].canonicalCategory;
      if (formCat === 'oak' && realDensity === 'density_high') {
        return {
          satisfiedRules: ['RULE_CROWN_EDGE_ALIGNMENT', 'RULE_TRUNK_BARK_QUANTUM'],
          conflicts: [],
          directives: [
            { layer: 'trunk', order: 10, directiveType: 'draw_tapered_trunk', params: { width: 6 } },
          ],
        };
      }
      return {
        satisfiedRules: [],
        conflicts: [
          {
            ruleId: 'INCOMPATIBLE_STYLE',
            description: `Tree archetype ${formCat} is incompatible with density ${realDensity}`,
            formSlot: 'ASSET_CLASS',
            realizationSlot: 'PIXEL_DENSITY',
            severity: 'mandatory',
          },
        ],
        directives: [],
      };
    },
  };

  function createValidWitnesses() {
    const formView = {
      adapterFamily: 'tree',
      slots: {
        ASSET_CLASS: { canonicalCategory: 'oak', parameters: { id: 1 } },
        SCALE_FRAME: { canonicalCategory: 'dimetric_2_5d', parameters: { h: 64, w: 48 } },
        SILHOUETTE: { canonicalCategory: 'broad_rounded', parameters: { r: 20 } },
        STRUCTURAL_SKELETON: { canonicalCategory: 'bifurcated', parameters: { branches: 3 } },
        PROPORTION: { canonicalCategory: 'balanced', parameters: { p: 1 } },
        MASS_DISTRIBUTION: { canonicalCategory: 'mid_canopy', parameters: { m: 10 } },
        NEGATIVE_SPACE: { canonicalCategory: 'moderate_gaps', parameters: { v: 5 } },
        WORLD_FOOTPRINT: { canonicalCategory: 'buttressed_roots', parameters: { s: 8 } },
      },
    };

    const realView = {
      adapterFamily: 'tree',
      slots: {
        PIXEL_DENSITY: { canonicalCategory: 'density_high', parameters: { q: 1 } },
        EDGE_LANGUAGE: { canonicalCategory: 'selout_single', parameters: { o: 1 } },
        CLUSTER_RHYTHM: { canonicalCategory: 'foliage_masses', parameters: { c: 2 } },
        VALUE_HIERARCHY: { canonicalCategory: 'bands_5', parameters: { b: 5 } },
        MATERIAL_LANGUAGE: { canonicalCategory: 'oak_bark', parameters: { m: 1 } },
        PALETTE_LOGIC: { canonicalCategory: 'verdant', parameters: { p: 1 } },
        LIGHT_RESPONSE: { canonicalCategory: 'upper_left', parameters: { x: -1, y: -1 } },
        SURFACE_VARIATION: { canonicalCategory: 'subtle_moss', parameters: { v: 1 } },
      },
    };

    const formResult = analyzeForm64(formView);
    const realResult = analyzeRealization64(realView);

    return { form: formResult.packet, realization: realResult.packet };
  }

  it('runs 100 repeated hearings and guarantees byte-identical receipts', () => {
    const { form, realization } = createValidWitnesses();
    const input = {
      form,
      realization,
      policy: dummyPolicy,
      projectionContext: { scale: 1 },
      mode: 'canonical',
    };

    const baseline = conductSCD128Hearing(input);
    expect(baseline.receipt.verdict).toBe('approved');
    expect(baseline.artPacket).not.toBeNull();

    for (let i = 0; i < 100; i++) {
      const run = conductSCD128Hearing(input);
      expect(run.receipt.receiptDigest256).toBe(baseline.receipt.receiptDigest256);
      expect(run.receipt.checksum128).toBe(baseline.receipt.checksum128);
      expect(JSON.stringify(run.receipt)).toBe(JSON.stringify(baseline.receipt));
    }
  });

  it('fails closed and issues quarantined receipt when policy finds conflict', () => {
    const { form, realization } = createValidWitnesses();
    // Intentionally mismatch density to trigger conflict
    const mismatchedRealView = {
      adapterFamily: 'tree',
      slots: {
        PIXEL_DENSITY: { canonicalCategory: 'density_incompatible', parameters: { q: 1 } },
        EDGE_LANGUAGE: { canonicalCategory: 'selout_single', parameters: { o: 1 } },
        CLUSTER_RHYTHM: { canonicalCategory: 'foliage_masses', parameters: { c: 2 } },
        VALUE_HIERARCHY: { canonicalCategory: 'bands_5', parameters: { b: 5 } },
        MATERIAL_LANGUAGE: { canonicalCategory: 'oak_bark', parameters: { m: 1 } },
        PALETTE_LOGIC: { canonicalCategory: 'verdant', parameters: { p: 1 } },
        LIGHT_RESPONSE: { canonicalCategory: 'upper_left', parameters: { x: -1, y: -1 } },
        SURFACE_VARIATION: { canonicalCategory: 'subtle_moss', parameters: { v: 1 } },
      },
    };
    const realResult = analyzeRealization64(mismatchedRealView);

    const result = conductSCD128Hearing({
      form,
      realization: realResult.packet,
      policy: dummyPolicy,
      mode: 'canonical',
    });

    expect(result.receipt.verdict).toBe('quarantined');
    expect(result.receipt.conflicts.length).toBeGreaterThan(0);
    expect(result.receipt.projectionDirectives).toHaveLength(0);
    expect(result.artPacket).toBeNull();
  });

  it('fails closed in canonical mode when confidence is unbound', () => {
    const { form, realization } = createValidWitnesses();
    // Replace slot 0 in form with confidence: 'unbound'
    const unboundFormView = {
      adapterFamily: 'tree',
      slots: {
        ASSET_CLASS: { canonicalCategory: 'oak', confidence: 'unbound', parameters: { id: 1 } },
        SCALE_FRAME: { canonicalCategory: 'dimetric_2_5d', parameters: { h: 64, w: 48 } },
        SILHOUETTE: { canonicalCategory: 'broad_rounded', parameters: { r: 20 } },
        STRUCTURAL_SKELETON: { canonicalCategory: 'bifurcated', parameters: { branches: 3 } },
        PROPORTION: { canonicalCategory: 'balanced', parameters: { p: 1 } },
        MASS_DISTRIBUTION: { canonicalCategory: 'mid_canopy', parameters: { m: 10 } },
        NEGATIVE_SPACE: { canonicalCategory: 'moderate_gaps', parameters: { v: 5 } },
        WORLD_FOOTPRINT: { canonicalCategory: 'buttressed_roots', parameters: { s: 8 } },
      },
    };
    const formResult = analyzeForm64(unboundFormView);

    const result = conductSCD128Hearing({
      form: formResult.packet,
      realization,
      policy: dummyPolicy,
      mode: 'canonical',
    });

    expect(result.receipt.verdict).toBe('quarantined');
    expect(result.receipt.conflicts.some((c) => c.ruleId === 'NO_UNBOUND_IN_CANONICAL')).toBe(true);
    expect(result.artPacket).toBeNull();
  });
});

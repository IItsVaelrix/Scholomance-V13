import { describe, it, expect } from 'vitest';
import {
  NATURAL_VARIANTS_SPEC,
  HYBRID_SPECIES_SPEC,
  generateTreeDescendant,
} from '../../../../../codex/core/pixelbrain/scholomium-ink/families/tree/tree-derivation.js';

describe('SCD128 Tree Generalization (14 Natural Variants & 3 Hybrids)', () => {
  it('generates all 14 unseen natural variants across the seven families', () => {
    expect(NATURAL_VARIANTS_SPEC).toHaveLength(14);

    for (const spec of NATURAL_VARIANTS_SPEC) {
      const variant = generateTreeDescendant({ spec, isHybrid: false });
      expect(variant.id).toBe(spec.id);
      expect(variant.isHybrid).toBe(false);
      expect(variant.receipt.verdict).toBe('approved');
      expect(variant.projection.ok).toBe(true);
      expect(variant.projection.compileResult.ok).toBe(true);
      expect(variant.projection.layerSurfaces.length).toBeGreaterThanOrEqual(9);
    }
  });

  it('generates all 3 original Scholomance hybrid species with explicit parentage', () => {
    expect(HYBRID_SPECIES_SPEC).toHaveLength(3);

    for (const spec of HYBRID_SPECIES_SPEC) {
      const hybrid = generateTreeDescendant({
        spec,
        isHybrid: true,
        parentReceipts: spec.parents.map((p) => `parent_counsel_${p}_v1`),
      });

      expect(hybrid.id).toBe(spec.id);
      expect(hybrid.isHybrid).toBe(true);
      expect(hybrid.parentReceipts.length).toBe(2);
      expect(hybrid.receipt.verdict).toBe('approved');
      expect(hybrid.projection.ok).toBe(true);
      expect(hybrid.projection.compileResult.ok).toBe(true);
      expect(hybrid.projection.layerSurfaces.length).toBeGreaterThanOrEqual(9);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeForm64 } from '../../../../../codex/core/pixelbrain/scholomium-ink/scd128/form64/form64.analyzer.js';
import { analyzeRealization64 } from '../../../../../codex/core/pixelbrain/scholomium-ink/scd128/realization64/realization64.analyzer.js';
import { SCD128_ERROR_CODES } from '../../../../../codex/core/pixelbrain/scholomium-ink/scd128/scd128.constants.js';

describe('SCD128 Bank Isolation & Mutation Invariance', () => {
  it('enforces static import isolation between form64 and realization64', () => {
    const formFiles = [
      resolve('codex/core/pixelbrain/scholomium-ink/scd128/form64/form64.schema.js'),
      resolve('codex/core/pixelbrain/scholomium-ink/scd128/form64/form64.vocabulary.js'),
      resolve('codex/core/pixelbrain/scholomium-ink/scd128/form64/form64.analyzer.js'),
    ];
    const realizationFiles = [
      resolve('codex/core/pixelbrain/scholomium-ink/scd128/realization64/realization64.schema.js'),
      resolve('codex/core/pixelbrain/scholomium-ink/scd128/realization64/realization64.vocabulary.js'),
      resolve('codex/core/pixelbrain/scholomium-ink/scd128/realization64/realization64.analyzer.js'),
    ];

    for (const f of formFiles) {
      const content = readFileSync(f, 'utf8');
      expect(content).not.toContain('realization64');
      expect(content).not.toContain('REALIZATION64_SLOT_NAMES');
      expect(content).not.toContain('analyzeRealization64');
    }

    for (const r of realizationFiles) {
      const content = readFileSync(r, 'utf8');
      expect(content).not.toContain('form64');
      expect(content).not.toContain('FORM64_SLOT_NAMES');
      expect(content).not.toContain('analyzeForm64');
    }
  });

  it('rejects forbidden realization fields in form analyzer', () => {
    const dirtyFormView = {
      adapterFamily: 'tree',
      slots: {
        ASSET_CLASS: {
          canonicalCategory: 'tree',
          parameters: { palette: '#FF0000', color: 'blue' },
        },
      },
    };

    const result = analyzeForm64(dirtyFormView);
    expect(result.ok).toBe(false);
    expect(result.packet).toBeNull();
    expect(result.diagnostics.some((d) => d.code === SCD128_ERROR_CODES.FORBIDDEN_FIELD)).toBe(true);
  });

  it('rejects forbidden structural fields in realization analyzer', () => {
    const dirtyRealizationView = {
      adapterFamily: 'tree',
      slots: {
        PIXEL_DENSITY: {
          canonicalCategory: 'standard',
          parameters: { skeleton_nodes: 12, trunk_taper: 4 },
        },
      },
    };

    const result = analyzeRealization64(dirtyRealizationView);
    expect(result.ok).toBe(false);
    expect(result.packet).toBeNull();
    expect(result.diagnostics.some((d) => d.code === SCD128_ERROR_CODES.FORBIDDEN_FIELD)).toBe(true);
  });

  it('proves FORM64 is byte-identical across realization changes', () => {
    const formViewA = {
      adapterFamily: 'tree',
      slots: {
        ASSET_CLASS: { canonicalCategory: 'oak', parameters: { archetype_id: 1 } },
        SCALE_FRAME: { canonicalCategory: 'dimetric', parameters: { height_units: 64, width_units: 48 } },
        SILHOUETTE: { canonicalCategory: 'broad_rounded', parameters: { crown_radius: 20 } },
        STRUCTURAL_SKELETON: { canonicalCategory: 'bifurcated', parameters: { limb_count: 4 } },
        PROPORTION: { canonicalCategory: 'balanced', parameters: { trunk_ratio: { numerator: '1', denominator: '3' } } },
        MASS_DISTRIBUTION: { canonicalCategory: 'mid_canopy', parameters: { center_y: 28 } },
        NEGATIVE_SPACE: { canonicalCategory: 'moderate_gaps', parameters: { void_pct: 15 } },
        WORLD_FOOTPRINT: { canonicalCategory: 'buttressed_roots', parameters: { root_spread: 16 } },
      },
    };

    // Analyze form view
    const resA1 = analyzeForm64(formViewA);
    expect(resA1.ok).toBe(true);

    // Analyze same form view again
    const resA2 = analyzeForm64(formViewA);
    expect(resA2.ok).toBe(true);

    // Must be 100% byte-identical
    expect(resA1.packet.checksum64).toBe(resA2.packet.checksum64);
    expect(resA1.packet.digest256).toBe(resA2.packet.digest256);
  });

  it('proves REALIZATION64 is byte-identical across structural changes', () => {
    const realizationView = {
      adapterFamily: 'tree',
      slots: {
        PIXEL_DENSITY: { canonicalCategory: 'res_32x52', parameters: { quantum: 1 } },
        EDGE_LANGUAGE: { canonicalCategory: 'selout_single', parameters: { outline_step: 1 } },
        CLUSTER_RHYTHM: { canonicalCategory: 'foliage_masses', parameters: { max_isolated_cells: 3 } },
        VALUE_HIERARCHY: { canonicalCategory: 'bands_5', parameters: { contrast_curve: 'balanced' } },
        MATERIAL_LANGUAGE: { canonicalCategory: 'oak_bark_and_leaf', parameters: { mark_freq: 2 } },
        PALETTE_LOGIC: { canonicalCategory: 'verdant_forest', parameters: { steps: 5 } },
        LIGHT_RESPONSE: { canonicalCategory: 'upper_left', parameters: { light_x: -1, light_y: -1 } },
        SURFACE_VARIATION: { canonicalCategory: 'subtle_moss', parameters: { variation_pct: 5 } },
      },
    };

    const resB1 = analyzeRealization64(realizationView);
    expect(resB1.ok).toBe(true);

    const resB2 = analyzeRealization64(realizationView);
    expect(resB2.ok).toBe(true);

    expect(resB1.packet.checksum64).toBe(resB2.packet.checksum64);
    expect(resB1.packet.digest256).toBe(resB2.packet.digest256);
  });
});

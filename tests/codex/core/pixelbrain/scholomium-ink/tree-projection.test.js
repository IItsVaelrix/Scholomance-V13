import { describe, it, expect } from 'vitest';
import { analyzeForm64 } from '../../../../../codex/core/pixelbrain/scholomium-ink/scd128/form64/form64.analyzer.js';
import { analyzeRealization64 } from '../../../../../codex/core/pixelbrain/scholomium-ink/scd128/realization64/realization64.analyzer.js';
import { conductSCD128Hearing } from '../../../../../codex/core/pixelbrain/scholomium-ink/scd128/counsel/counsel.js';
import { treeCounselPolicy } from '../../../../../codex/core/pixelbrain/scholomium-ink/families/tree/tree-counsel.policy.js';
import { projectCounseledTreeToSCDLV2 } from '../../../../../codex/core/pixelbrain/scholomium-ink/families/tree/tree-projection.adapter.js';
import {
  buildTreeFormEvidenceView,
  buildTreeRealizationEvidenceView,
} from '../../../../../codex/core/pixelbrain/scholomium-ink/families/tree/tree-derivation.js';

describe('SCD128 Tree Projection Adapter & 9 Semantic Layers', () => {
  const EXPECTED_9_LAYERS = [
    'ground_shadow',
    'roots_and_ground',
    'trunk',
    'primary_branches',
    'secondary_branches',
    'canopy_masses',
    'foliage_edges',
    'surface_detail',
    'highlights',
  ];

  function getApprovedOak() {
    const formView = buildTreeFormEvidenceView({
      family: 'oak',
      assetName: 'oak_master',
      canvasWidth: 48,
      canvasHeight: 64,
      envelope: 'broad_rounded',
    });
    const realView = buildTreeRealizationEvidenceView({
      family: 'oak',
      assetName: 'oak_master',
      density: 'res_48x64',
      edgeStyle: 'lobed_leaf_clumps',
      palette: 'verdant_forest',
      valueBands: 5,
    });

    const form = analyzeForm64(formView).packet;
    const realization = analyzeRealization64(realView).packet;
    const hearing = conductSCD128Hearing({ form, realization, policy: treeCounselPolicy });
    return { receipt: hearing.receipt, artPacket: hearing.artPacket };
  }

  it('projects an approved oak into valid semantic SCDL v2 and compiles with 9 layer surfaces', () => {
    const { receipt, artPacket } = getApprovedOak();
    expect(receipt.verdict).toBe('approved');

    const projected = projectCounseledTreeToSCDLV2({
      receipt,
      artPacket,
      assetName: 'test_oak_projection',
    });

    expect(projected.ok).toBe(true);
    expect(projected.compileResult.ok).toBe(true);
    expect(projected.scdlSource).toContain('SCDL 2');
    expect(projected.scdlSource).toContain('ASSET test_oak_projection');

    // Verify all 9 semantic layers exist in the compiled packet
    const layers = projected.compileResult.package?.layers || [];
    const layerNames = layers.map((l) => l.id);
    for (const expected of EXPECTED_9_LAYERS) {
      expect(layerNames).toContain(expected);
    }

    // Verify un-occluded layerSurfaces IR is emitted
    const surfaces = projected.layerSurfaces;
    expect(surfaces.length).toBeGreaterThanOrEqual(9);
    for (const expected of EXPECTED_9_LAYERS) {
      const surface = surfaces.find((s) => s.id === expected);
      expect(surface).toBeDefined();
      expect(surface.cells.length).toBeGreaterThan(0);
    }
  });

  it('refuses projection when receipt is quarantined', () => {
    const quarantinedReceipt = {
      contract: 'SCD128-COUNSEL-v1',
      verdict: 'quarantined',
      mode: 'canonical',
      checksum128: '0'.repeat(128),
    };

    expect(() =>
      projectCounseledTreeToSCDLV2({
        receipt: quarantinedReceipt,
        artPacket: null,
        assetName: 'quarantined_tree',
      })
    ).toThrow(/refused/i);
  });
});

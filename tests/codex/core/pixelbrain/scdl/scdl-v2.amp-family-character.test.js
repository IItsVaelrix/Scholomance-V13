import { describe, it, expect } from 'vitest';
import { compileSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import { getAmpAdapter, getAmpManifest } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-catalog.js';

describe('SCDL v2 AMP Family 3: Character & Image Analysis', () => {
  const family3Amps = [
    'pixelbrain.neighbor-extrapolation',
    'pixelbrain.pixel-scale',
    'pixelbrain.hair-flow',
    'pixelbrain.scholomance-character-motif',
    'pixelbrain.gravity',
  ];

  it('all 5 Family 3 AMPs are registered with valid PB-AMP-ABI-v1 manifests and adapters', () => {
    for (const ampId of family3Amps) {
      const manifest = getAmpManifest(ampId);
      expect(manifest, `Manifest missing for ${ampId}`).toBeDefined();
      expect(manifest.contract).toBe('PB-AMP-ABI-v1');
      expect(manifest.checksum).toBeDefined();

      const adapter = getAmpAdapter(ampId);
      expect(adapter, `Adapter missing for ${ampId}`).toBeDefined();
      expect(typeof adapter.execute).toBe('function');
    }
  });

  describe('analysis and rendering adapters', () => {
    it('executes pixelbrain.neighbor-extrapolation', () => {
      const adapter = getAmpAdapter('pixelbrain.neighbor-extrapolation');
      const layer = { id: 'main', cells: [{ x: 2, y: 2, color: '#ff0000' }] };
      const res = adapter.execute({ target: layer }, { iterations: 2 }, {});
      expect(res.neighborExtrapolated).toBe(true);
      expect(res.smoothingIterations).toBe(2);
    });

    it('executes pixelbrain.pixel-scale', () => {
      const adapter = getAmpAdapter('pixelbrain.pixel-scale');
      const layer = { id: 'main', cells: [{ x: 0, y: 0, color: '#ffffff' }] };
      const res = adapter.execute({ layer }, { scale: 4, mode: 'xbr' }, {});
      expect(res.pixelScaled).toBe(true);
      expect(res.scaleFactor).toBe(4);
      expect(res.upscaleMode).toBe('xbr');
    });
  });

  describe('character shape and paint adapters', () => {
    it('executes pixelbrain.hair-flow', () => {
      const adapter = getAmpAdapter('pixelbrain.hair-flow');
      const shape = { kind: 'Circle', center: { x: 16, y: 8 }, radius: 6 };
      const res = adapter.execute({ geometry: shape }, { direction: 120, strands: 12 }, {});
      expect(res.hairFlowApplied).toBe(true);
      expect(res.flowDirection).toBe(120);
      expect(res.strandCount).toBe(12);
      expect(res.hasStrandVectors).toBe(true);
    });

    it('executes pixelbrain.scholomance-character-motif', () => {
      const adapter = getAmpAdapter('pixelbrain.scholomance-character-motif');
      const layer = { id: 'robe', cells: [{ x: 16, y: 16, color: '#222222' }] };
      const res = adapter.execute({ target: layer }, { school: 'frost', intensity: 0.85 }, {});
      expect(res.characterMotifApplied).toBe(true);
      expect(res.school).toBe('frost');
      expect(res.intensity).toBe(0.85);
    });

    it('executes pixelbrain.gravity', () => {
      const adapter = getAmpAdapter('pixelbrain.gravity');
      const shape = { kind: 'Polygon', cells: [{ x: 8, y: 8 }] };
      const res = adapter.execute({ geometry: shape }, { steps: 8, energyType: 'STRUCTURAL' }, {});
      expect(res.gravityApplied).toBe(true);
      expect(res.descentSteps).toBe(8);
      expect(res.energyType).toBe('STRUCTURAL');
      expect(res.hasGravityTaper).toBe(true);
    });
  });

  describe('End-to-End SCDL v2 compilation with Family 3 AMPs', () => {
    it('compiles program invoking pixelbrain.hair-flow and emits package', () => {
      const src = `SCDL 2
ASSET scholar_hair
CANVAS WIDTH 32 HEIGHT 32

SHAPE $head (CIRCLE CENTER (VEC2 (PX 16) (PX 12)) RADIUS (PX 6))

APPLY_AMP $tresses SHAPE {
  AMP pixelbrain.hair-flow
  VERSION 1.0.0
  STAGE SHAPE_POST
  INPUT geometry $head
  PARAM direction (DEGREES 90)
  PARAM strands 10
}

LAYER main ORDER 10 {
  PAINT $tresses FILL #8b4513 RASTER CENTER
}
`;
      const res = compileSCDLV2(src);
      expect(res.ok).toBe(true);
      expect(res.package).toBeDefined();
      expect(res.package.framePackets).toHaveLength(1);
      expect(res.diagnostics).toHaveLength(0);
    });

    it('compiles program invoking pixelbrain.scholomance-character-motif at PAINT stage', () => {
      const src = `SCDL 2
ASSET arcane_robe
CANVAS WIDTH 32 HEIGHT 32

SHAPE $robe (CIRCLE CENTER (VEC2 (PX 16) (PX 16)) RADIUS (PX 8))

LAYER main ORDER 10 {
  PAINT $robe FILL #1a0933 RASTER CENTER
}

APPLY_AMP $enchanted LAYER {
  AMP pixelbrain.scholomance-character-motif
  VERSION 1.0.0
  STAGE PAINT
  INPUT target main
  PARAM school void
  PARAM intensity 0.8
}
`;
      const res = compileSCDLV2(src);
      expect(res.ok).toBe(true);
      expect(res.package).toBeDefined();
      expect(res.package.framePackets).toHaveLength(1);
      expect(res.diagnostics).toHaveLength(0);
    });
  });
});

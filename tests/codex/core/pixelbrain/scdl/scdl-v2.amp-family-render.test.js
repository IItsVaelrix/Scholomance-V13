import { describe, it, expect } from 'vitest';
import { compileSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import { getAmpAdapter, getAmpManifest } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-catalog.js';

describe('SCDL v2 AMP Family 2: Foundry & Render Fidelity', () => {
  const family2Amps = [
    'pixelbrain.chestplate',
    'pixelbrain.chestplate-bevel',
    'pixelbrain.chestplate-surface-texture',
    'pixelbrain.crystal-core',
    'pixelbrain.flame-tip',
    'pixelbrain.holyfire-motif',
    'pixelbrain.jewelry',
    'pixelbrain.heraldry',
    'pixelbrain.palette-quantization',
    'pixelbrain.shadow',
    'pixelbrain.square-sharpness-contrast',
    'pixelbrain.tonation',
    'pixelbrain.vector',
    'pixelbrain.volume',
  ];

  it('all 14 Family 2 AMPs are registered with valid PB-AMP-ABI-v1 manifests and adapters', () => {
    for (const ampId of family2Amps) {
      const manifest = getAmpManifest(ampId);
      expect(manifest, `Manifest missing for ${ampId}`).toBeDefined();
      expect(manifest.contract).toBe('PB-AMP-ABI-v1');
      expect(manifest.checksum).toBeDefined();

      const adapter = getAmpAdapter(ampId);
      expect(adapter, `Adapter missing for ${ampId}`).toBeDefined();
      expect(typeof adapter.execute).toBe('function');
    }
  });

  describe('shape post-processing adapters', () => {
    it('executes pixelbrain.chestplate', () => {
      const adapter = getAmpAdapter('pixelbrain.chestplate');
      const shape = { kind: 'Polygon', cells: [{ x: 10, y: 10 }] };
      const res = adapter.execute({ geometry: shape }, { tier: 3, profile: 'armor.void' }, {});
      expect(res.chestplateApplied).toBe(true);
      expect(res.tier).toBe(3);
      expect(res.profile).toBe('armor.void');
    });

    it('executes pixelbrain.chestplate-bevel', () => {
      const adapter = getAmpAdapter('pixelbrain.chestplate-bevel');
      const shape = { kind: 'Polygon', cells: [{ x: 10, y: 10 }] };
      const res = adapter.execute({ geometry: shape }, { depth: 4 }, {});
      expect(res.bevelApplied).toBe(true);
      expect(res.bevelDepth).toBe(4);
    });

    it('executes pixelbrain.crystal-core', () => {
      const adapter = getAmpAdapter('pixelbrain.crystal-core');
      const shape = { kind: 'Circle', center: { x: 8, y: 8 }, radius: 4 };
      const res = adapter.execute({ geometry: shape }, { resonance: 0.9 }, {});
      expect(res.crystalCoreApplied).toBe(true);
      expect(res.resonance).toBe(0.9);
      expect(res.hasFacetHighlights).toBe(true);
    });

    it('executes pixelbrain.flame-tip', () => {
      const adapter = getAmpAdapter('pixelbrain.flame-tip');
      const shape = { kind: 'Polygon', cells: [{ x: 16, y: 4 }] };
      const res = adapter.execute({ geometry: shape }, { intensity: 0.8 }, {});
      expect(res.flameTipApplied).toBe(true);
      expect(res.intensity).toBe(0.8);
    });

    it('executes pixelbrain.jewelry', () => {
      const adapter = getAmpAdapter('pixelbrain.jewelry');
      const shape = { kind: 'Circle', center: { x: 16, y: 16 }, radius: 6 };
      const res = adapter.execute({ geometry: shape }, { cut: 'emerald', gemType: 'sapphire' }, {});
      expect(res.jewelryApplied).toBe(true);
      expect(res.cut).toBe('emerald');
      expect(res.gemType).toBe('sapphire');
    });

    it('executes pixelbrain.heraldry', () => {
      const adapter = getAmpAdapter('pixelbrain.heraldry');
      const shape = { kind: 'Polygon', cells: [{ x: 8, y: 8 }] };
      const res = adapter.execute({ geometry: shape }, { charge: 'griffin', division: 'chevron' }, {});
      expect(res.heraldryApplied).toBe(true);
      expect(res.charge).toBe('griffin');
      expect(res.division).toBe('chevron');
    });

    it('executes pixelbrain.vector', () => {
      const adapter = getAmpAdapter('pixelbrain.vector');
      const shape = { kind: 'Path', commands: [] };
      const res = adapter.execute({ geometry: shape }, { subdivide: 2 }, {});
      expect(res.vectorRefined).toBe(true);
      expect(res.subdivisions).toBe(2);
    });

    it('executes pixelbrain.volume', () => {
      const adapter = getAmpAdapter('pixelbrain.volume');
      const shape = { kind: 'Rectangle', width: 16, height: 16 };
      const res = adapter.execute({ geometry: shape }, { depth: 5, lightZ: 0.8 }, {});
      expect(res.volumeExtruded).toBe(true);
      expect(res.extrusionDepth).toBe(5);
      expect(res.lightZ).toBe(0.8);
    });
  });

  describe('layer paint and post-processing adapters', () => {
    it('executes pixelbrain.chestplate-surface-texture', () => {
      const adapter = getAmpAdapter('pixelbrain.chestplate-surface-texture');
      const layer = { id: 'torso', cells: [{ x: 1, y: 1, color: '#444444' }] };
      const res = adapter.execute({ target: layer }, { roughness: 0.4 }, {});
      expect(res.surfaceTextureApplied).toBe(true);
      expect(res.roughness).toBe(0.4);
    });

    it('executes pixelbrain.holyfire-motif', () => {
      const adapter = getAmpAdapter('pixelbrain.holyfire-motif');
      const layer = { id: 'motif', cells: [{ x: 5, y: 5, color: '#ffaa00' }] };
      const res = adapter.execute({ target: layer }, { radiance: 0.95 }, {});
      expect(res.holyfireMotifApplied).toBe(true);
      expect(res.radiance).toBe(0.95);
    });

    it('executes pixelbrain.palette-quantization', () => {
      const adapter = getAmpAdapter('pixelbrain.palette-quantization');
      const layer = { id: 'main', cells: [{ x: 0, y: 0, color: '#112233' }] };
      const res = adapter.execute({ layer }, { colors: 8, dither: true }, {});
      expect(res.paletteQuantized).toBe(true);
      expect(res.colorBudget).toBe(8);
      expect(res.ditherEnabled).toBe(true);
    });

    it('executes pixelbrain.shadow', () => {
      const adapter = getAmpAdapter('pixelbrain.shadow');
      const layer = { id: 'main', cells: [{ x: 5, y: 5, color: '#ffffff' }] };
      const res = adapter.execute({ layer }, { elevation: 2, angle: 225, opacity: 0.6 }, {});
      expect(res.shadowApplied).toBe(true);
      expect(res.elevation).toBe(2);
      expect(res.shadowOpacity).toBe(0.6);
    });

    it('executes pixelbrain.square-sharpness-contrast', () => {
      const adapter = getAmpAdapter('pixelbrain.square-sharpness-contrast');
      const layer = { id: 'main', cells: [{ x: 5, y: 5, color: '#888888' }] };
      const res = adapter.execute({ layer }, { sharpness: 0.7 }, {});
      expect(res.sharpnessApplied).toBe(true);
      expect(res.sharpness).toBe(0.7);
    });

    it('executes pixelbrain.tonation', () => {
      const adapter = getAmpAdapter('pixelbrain.tonation');
      const layer = { id: 'main', cells: [{ x: 5, y: 5, color: '#888888' }] };
      const res = adapter.execute({ layer }, { warmth: 0.6, contrast: 0.7 }, {});
      expect(res.tonationApplied).toBe(true);
      expect(res.warmth).toBe(0.6);
      expect(res.contrast).toBe(0.7);
    });
  });

  describe('End-to-End SCDL v2 compilation with Family 2 AMPs', () => {
    it('compiles program invoking pixelbrain.crystal-core and emits package', () => {
      const src = `SCDL 2
ASSET crystal_talisman
CANVAS WIDTH 32 HEIGHT 32

SHAPE $raw (CIRCLE CENTER (VEC2 (PX 16) (PX 16)) RADIUS (PX 6))

APPLY_AMP $crystal SHAPE {
  AMP pixelbrain.crystal-core
  VERSION 1.0.0
  STAGE SHAPE_POST
  INPUT geometry $raw
  PARAM resonance 0.9
}

LAYER main ORDER 10 {
  PAINT $crystal FILL #00e5ff RASTER CENTER
}
`;
      const res = compileSCDLV2(src);
      expect(res.ok).toBe(true);
      expect(res.package).toBeDefined();
      expect(res.package.framePackets).toHaveLength(1);
      expect(res.diagnostics).toHaveLength(0);
    });

    it('compiles program invoking pixelbrain.shadow at LAYER_POST', () => {
      const src = `SCDL 2
ASSET shadowed_relic
CANVAS WIDTH 32 HEIGHT 32

SHAPE $relic (CIRCLE CENTER (VEC2 (PX 16) (PX 16)) RADIUS (PX 8))

LAYER main ORDER 10 {
  PAINT $relic FILL #ffaa00 RASTER CENTER
}

APPLY_AMP $shadowed LAYER {
  AMP pixelbrain.shadow
  VERSION 1.0.0
  STAGE LAYER_POST
  INPUT layer main
  PARAM elevation 2
  PARAM angle (DEGREES 225)
  PARAM opacity 0.6
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

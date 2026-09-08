import { describe, it, expect } from 'vitest';
import { compileSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import { getAmpAdapter, getAmpManifest } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-catalog.js';

describe('SCDL v2 AMP Family 1: Compile-Time Geometry & Paint', () => {
  describe('pixelbrain.geometry', () => {
    it('is registered in catalog with valid PB-AMP-ABI-v1 manifest', () => {
      const manifest = getAmpManifest('pixelbrain.geometry');
      expect(manifest).toBeDefined();
      expect(manifest.contract).toBe('PB-AMP-ABI-v1');
      expect(manifest.stage).toBe('SHAPE_POST');
      expect(manifest.execution).toBe('COMPILE');
    });

    it('classifies geometry roles and provides bounding masks', () => {
      const adapter = getAmpAdapter('pixelbrain.geometry');
      expect(adapter).toBeDefined();

      const inputShape = {
        kind: 'Circle',
        center: { x: 16, y: 16 },
        radius: 8,
        cells: [
          { x: 16, y: 16, color: '#ffffff' },
          { x: 16, y: 17, color: '#ffffff' },
        ],
      };

      const result = adapter.execute({ geometry: inputShape }, { classifyRoles: true }, {});
      expect(result).toBeDefined();
      expect(result.geometryRoles).toBeDefined();
      expect(result.geometryRoles.hasSilhouette).toBe(true);
      expect(result.boundingBox).toBeDefined();
    });

    it('handles empty/invalid input safely without throwing', () => {
      const adapter = getAmpAdapter('pixelbrain.geometry');
      const result = adapter.execute({}, {}, {});
      expect(result).toBeDefined();
      expect(result.geometryStructured).toBe(false);
    });
  });

  describe('pixelbrain.region-fill', () => {
    it('is registered in catalog with PAINT stage', () => {
      const manifest = getAmpManifest('pixelbrain.region-fill');
      expect(manifest).toBeDefined();
      expect(manifest.stage).toBe('PAINT');
    });

    it('fills layer cells using material palette mapping', () => {
      const adapter = getAmpAdapter('pixelbrain.region-fill');
      const layer = {
        id: 'main',
        cells: [
          { x: 10, y: 10, color: '#ffffff' },
          { x: 11, y: 10, color: '#ffffff' },
        ],
      };

      const result = adapter.execute({ target: layer }, { material: 'void', anchor: 'body' }, {});
      expect(result).toBeDefined();
      expect(result.cells).toBeDefined();
      expect(result.cells.length).toBe(2);
      expect(result.regionFillApplied).toBe(true);
    });
  });

  describe('pixelbrain.sdf-shape', () => {
    it('samples signed distance field with threshold', () => {
      const adapter = getAmpAdapter('pixelbrain.sdf-shape');
      const shape = {
        kind: 'Circle',
        center: { x: 8, y: 8 },
        radius: 4,
        cells: [{ x: 8, y: 8, color: '#ffffff' }],
      };

      const result = adapter.execute({ geometry: shape }, { threshold: 0 }, {});
      expect(result).toBeDefined();
      expect(result.sdfQuantized).toBe(true);
      expect(Array.isArray(result.cells)).toBe(true);
    });
  });

  describe('pixelbrain.selout', () => {
    it('applies directional outline modulation to layer perimeter', () => {
      const adapter = getAmpAdapter('pixelbrain.selout');
      const layer = {
        id: 'main',
        cells: [
          { x: 5, y: 5, color: '#ffffff' },
          { x: 6, y: 5, color: '#ffffff' },
          { x: 5, y: 6, color: '#ffffff' },
          { x: 6, y: 6, color: '#ffffff' },
        ],
      };

      const result = adapter.execute({ layer }, { lightAngle: 225, threshold: 0.3 }, {});
      expect(result).toBeDefined();
      expect(result.seloutApplied).toBe(true);
      expect(result.cells.length).toBeGreaterThan(0);
    });
  });

  describe('pixelbrain.shield-rim', () => {
    it('adds outer rim border thickness to shield geometry', () => {
      const adapter = getAmpAdapter('pixelbrain.shield-rim');
      const shield = {
        kind: 'Polygon',
        cells: [
          { x: 10, y: 10, color: '#cccccc' },
          { x: 11, y: 10, color: '#cccccc' },
          { x: 10, y: 11, color: '#cccccc' },
        ],
      };

      const result = adapter.execute({ geometry: shield }, { thickness: 2 }, {});
      expect(result).toBeDefined();
      expect(result.shieldRimApplied).toBe(true);
      expect(result.rimThickness).toBe(2);
    });
  });

  describe('pixelbrain.shield-volume', () => {
    it('applies volumetric curved face shading gradient', () => {
      const adapter = getAmpAdapter('pixelbrain.shield-volume');
      const shield = {
        kind: 'Polygon',
        cells: [
          { x: 10, y: 10, color: '#cccccc' },
          { x: 11, y: 10, color: '#cccccc' },
          { x: 12, y: 10, color: '#cccccc' },
        ],
      };

      const result = adapter.execute({ geometry: shield }, { curvature: 0.5 }, {});
      expect(result).toBeDefined();
      expect(result.shieldVolumeApplied).toBe(true);
      expect(result.curvature).toBe(0.5);
    });
  });

  describe('pixelbrain.sketch', () => {
    it('generates auto-shaded contour bands and construction guidelines', () => {
      const adapter = getAmpAdapter('pixelbrain.sketch');
      const shape = {
        kind: 'Rectangle',
        x: 0,
        y: 0,
        width: 16,
        height: 16,
      };

      const result = adapter.execute({ geometry: shape }, { bands: 4 }, {});
      expect(result).toBeDefined();
      expect(result.sketchApplied).toBe(true);
      expect(result.bands).toBe(4);
      expect(result.guidelines).toBe(true);
    });
  });

  describe('pixelbrain.symmetry', () => {
    it('symmetrically mirrors geometry across vertical axis', () => {
      const adapter = getAmpAdapter('pixelbrain.symmetry');
      const shape = {
        kind: 'Custom',
        cells: [
          { x: 5, y: 10, color: '#ff0000' },
          { x: 6, y: 10, color: '#00ff00' },
        ],
      };

      const result = adapter.execute({ geometry: shape }, { axis: 'VERTICAL' }, { canvasWidth: 32 });
      expect(result).toBeDefined();
      expect(result.symmetryApplied).toBe(true);
      expect(result.cells.length).toBeGreaterThan(2);
    });
  });

  describe('End-to-End SCDL v2 compilation with Family 1 AMPs', () => {
    it('compiles program invoking pixelbrain.symmetry and emits packet', () => {
      const src = `SCDL 2
ASSET symmetry_blade
CANVAS WIDTH 32 HEIGHT 32

SHAPE $wing (CIRCLE CENTER (VEC2 (PX 10) (PX 16)) RADIUS (PX 4))

APPLY_AMP $mirrored SHAPE {
  AMP pixelbrain.symmetry
  VERSION 1.0.0
  STAGE SHAPE_POST
  INPUT geometry $wing
  PARAM axis VERTICAL
}

LAYER main ORDER 10 {
  PAINT $mirrored FILL #ff00ff RASTER CENTER
}
`;
      const res = compileSCDLV2(src);
      expect(res.ok).toBe(true);
      expect(res.package).toBeDefined();
      expect(res.package.framePackets).toHaveLength(1);
      expect(res.diagnostics).toHaveLength(0);
    });

    it('compiles program invoking pixelbrain.selout at LAYER_POST', () => {
      const src = `SCDL 2
ASSET outlined_orb
CANVAS WIDTH 32 HEIGHT 32

SHAPE $orb (CIRCLE CENTER (VEC2 (PX 16) (PX 16)) RADIUS (PX 6))

LAYER main ORDER 10 {
  PAINT $orb FILL #00ffff RASTER CENTER
}

APPLY_AMP $shaded LAYER {
  AMP pixelbrain.selout
  VERSION 1.0.0
  STAGE LAYER_POST
  INPUT layer main
  PARAM lightAngle (DEGREES 225)
  PARAM threshold 0.3
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

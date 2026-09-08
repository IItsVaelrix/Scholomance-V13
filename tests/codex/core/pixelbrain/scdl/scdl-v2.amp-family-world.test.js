import { describe, it, expect } from 'vitest';
import { compileSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import { getAmpAdapter, getAmpManifest } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-catalog.js';

describe('SCDL v2 AMP Family 4: World, Voxel & Runtime Descriptors', () => {
  const family4Amps = [
    'pixelbrain.biome-coherence',
    'pixelbrain.volume-lift',
    'pixelbrain.hollowness',
    'pixelbrain.chunks-seam',
    'pixelbrain.school-tag',
    'pixelbrain.grass',
    'pixelbrain.biome-material',
    'pixelbrain.material-resolver',
    'pixelbrain.fibonacci-field',
    'pixelbrain.fibonacci-seed-field',
    'pixelbrain.iso-tile-geometry',
    'pixelbrain.tile-socket',
    'pixelbrain.volume-processor',
    'pixelbrain.heightmap',
    'pixelbrain.perlin-field',
    'pixelbrain.noise-mask',
  ];

  it('all 16 Family 4 AMPs are registered with valid PB-AMP-ABI-v1 manifests and adapters', () => {
    for (const ampId of family4Amps) {
      const manifest = getAmpManifest(ampId);
      expect(manifest, `Manifest missing for ${ampId}`).toBeDefined();
      expect(manifest.contract).toBe('PB-AMP-ABI-v1');
      expect(manifest.checksum).toBeDefined();

      const adapter = getAmpAdapter(ampId);
      expect(adapter, `Adapter missing for ${ampId}`).toBeDefined();
      expect(typeof adapter.execute).toBe('function');
    }
  });

  describe('world and runtime descriptor adapters', () => {
    it('executes pixelbrain.biome-coherence descriptor', () => {
      const adapter = getAmpAdapter('pixelbrain.biome-coherence');
      const res = adapter.execute({ targetId: 'forest_chunk_0' }, { coherenceThreshold: 0.7 }, {});
      expect(res.contract).toBe('PB-WORLD-DESCRIPTOR-v1');
      expect(res.kind).toBe('BIOME_COHERENCE');
      expect(res.coherenceThreshold).toBe(0.7);
    });

    it('executes pixelbrain.volume-lift descriptor', () => {
      const adapter = getAmpAdapter('pixelbrain.volume-lift');
      const res = adapter.execute({ targetId: 'spire_base' }, { liftHeight: 8 }, {});
      expect(res.contract).toBe('PB-WORLD-DESCRIPTOR-v1');
      expect(res.kind).toBe('VOLUME_LIFT');
      expect(res.liftHeight).toBe(8);
    });

    it('executes pixelbrain.hollowness descriptor', () => {
      const adapter = getAmpAdapter('pixelbrain.hollowness');
      const res = adapter.execute({ targetId: 'tower_core' }, { innerRadius: 5 }, {});
      expect(res.contract).toBe('PB-WORLD-DESCRIPTOR-v1');
      expect(res.kind).toBe('HOLLOWNESS');
      expect(res.innerRadius).toBe(5);
    });

    it('executes pixelbrain.chunks-seam descriptor', () => {
      const adapter = getAmpAdapter('pixelbrain.chunks-seam');
      const res = adapter.execute({ targetId: 'seam_edge' }, { seamMargin: 2 }, {});
      expect(res.contract).toBe('PB-WORLD-DESCRIPTOR-v1');
      expect(res.kind).toBe('CHUNKS_SEAM');
      expect(res.seamMargin).toBe(2);
    });

    it('executes pixelbrain.school-tag descriptor', () => {
      const adapter = getAmpAdapter('pixelbrain.school-tag');
      const res = adapter.execute({ targetId: 'sanctum_gate' }, { school: 'frost' }, {});
      expect(res.contract).toBe('PB-WORLD-DESCRIPTOR-v1');
      expect(res.kind).toBe('SCHOOL_TAG');
      expect(res.school).toBe('frost');
    });

    it('executes pixelbrain.grass descriptor', () => {
      const adapter = getAmpAdapter('pixelbrain.grass');
      const res = adapter.execute({ targetId: 'meadow_patch' }, { bladeDensity: 0.8 }, {});
      expect(res.contract).toBe('PB-WORLD-DESCRIPTOR-v1');
      expect(res.kind).toBe('GRASS');
      expect(res.bladeDensity).toBe(0.8);
    });

    it('executes pixelbrain.biome-material descriptor', () => {
      const adapter = getAmpAdapter('pixelbrain.biome-material');
      const res = adapter.execute({ targetId: 'swamp_zone' }, { biome: 'swamp' }, {});
      expect(res.contract).toBe('PB-WORLD-DESCRIPTOR-v1');
      expect(res.kind).toBe('BIOME_MATERIAL');
      expect(res.biome).toBe('swamp');
    });

    it('executes pixelbrain.material-resolver descriptor', () => {
      const adapter = getAmpAdapter('pixelbrain.material-resolver');
      const res = adapter.execute({ targetId: 'unknown_rock' }, { fallback: 'granite' }, {});
      expect(res.contract).toBe('PB-WORLD-DESCRIPTOR-v1');
      expect(res.kind).toBe('MATERIAL_RESOLVER');
      expect(res.fallbackMaterial).toBe('granite');
    });

    it('executes pixelbrain.fibonacci-field descriptor', () => {
      const adapter = getAmpAdapter('pixelbrain.fibonacci-field');
      const res = adapter.execute({ targetId: 'spiral_altar' }, { count: 34, goldenAngle: 137.5 }, {});
      expect(res.contract).toBe('PB-RUNTIME-DESCRIPTOR-v1');
      expect(res.kind).toBe('FIBONACCI_FIELD');
      expect(res.nodeCount).toBe(34);
    });

    it('executes pixelbrain.fibonacci-seed-field descriptor', () => {
      const adapter = getAmpAdapter('pixelbrain.fibonacci-seed-field');
      const res = adapter.execute({ targetId: 'sunflower_disk' }, { seed: 101, points: 21 }, {});
      expect(res.contract).toBe('PB-RUNTIME-DESCRIPTOR-v1');
      expect(res.kind).toBe('FIBONACCI_SEED_FIELD');
      expect(res.seed).toBe(101);
      expect(res.pointCount).toBe(21);
    });

    it('executes pixelbrain.iso-tile-geometry descriptor', () => {
      const adapter = getAmpAdapter('pixelbrain.iso-tile-geometry');
      const res = adapter.execute({ targetId: 'iso_floor' }, { tileWidth: 64, tileHeight: 32 }, {});
      expect(res.contract).toBe('PB-WORLD-DESCRIPTOR-v1');
      expect(res.kind).toBe('ISO_TILE_GEOMETRY');
      expect(res.tileWidth).toBe(64);
      expect(res.tileHeight).toBe(32);
    });

    it('executes pixelbrain.tile-socket descriptor', () => {
      const adapter = getAmpAdapter('pixelbrain.tile-socket');
      const res = adapter.execute({ targetId: 'dungeon_corner' }, { socketMask: 63 }, {});
      expect(res.contract).toBe('PB-WORLD-DESCRIPTOR-v1');
      expect(res.kind).toBe('TILE_SOCKET');
      expect(res.socketMask).toBe(63);
    });

    it('executes pixelbrain.volume-processor descriptor', () => {
      const adapter = getAmpAdapter('pixelbrain.volume-processor');
      const res = adapter.execute({ targetId: 'voxel_cliff' }, { subsample: 2 }, {});
      expect(res.contract).toBe('PB-WORLD-DESCRIPTOR-v1');
      expect(res.kind).toBe('VOLUME_PROCESSOR');
      expect(res.subsampleRate).toBe(2);
    });

    it('executes pixelbrain.heightmap descriptor', () => {
      const adapter = getAmpAdapter('pixelbrain.heightmap');
      const res = adapter.execute({ targetId: 'mountain_range' }, { maxElevation: 32 }, {});
      expect(res.contract).toBe('PB-WORLD-DESCRIPTOR-v1');
      expect(res.kind).toBe('HEIGHTMAP');
      expect(res.maxElevation).toBe(32);
    });

    it('executes pixelbrain.perlin-field descriptor', () => {
      const adapter = getAmpAdapter('pixelbrain.perlin-field');
      const res = adapter.execute({ targetId: 'cloud_sky' }, { scale: 0.25, octaves: 4 }, {});
      expect(res.contract).toBe('PB-RUNTIME-DESCRIPTOR-v1');
      expect(res.kind).toBe('PERLIN_FIELD');
      expect(res.noiseScale).toBe(0.25);
      expect(res.octaves).toBe(4);
    });

    it('executes pixelbrain.noise-mask compiler pass', () => {
      const adapter = getAmpAdapter('pixelbrain.noise-mask');
      const mask = { kind: 'Mask', cells: [{ x: 10, y: 10 }] };
      const res = adapter.execute({ mask }, { cutoff: 0.6 }, {});
      expect(res.noiseModulated).toBe(true);
      expect(res.cutoffThreshold).toBe(0.6);
    });
  });

  describe('End-to-End SCDL v2 compilation with Family 4 Descriptors', () => {
    it('compiles program invoking pixelbrain.school-tag and emits world descriptor in package', () => {
      const src = `SCDL 2
ASSET sanctum_crest
CANVAS WIDTH 32 HEIGHT 32

APPLY_AMP $tag ANY {
  AMP pixelbrain.school-tag
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM school void
}

LAYER main ORDER 10 {
  PAINT (CIRCLE CENTER (VEC2 (PX 16) (PX 16)) RADIUS (PX 8)) FILL #331144 RASTER CENTER
}
`;
      const res = compileSCDLV2(src);
      expect(res.ok).toBe(true);
      expect(res.package).toBeDefined();
      expect(res.ampDescriptors.length).toBeGreaterThanOrEqual(1);
      const schoolDescriptor = res.ampDescriptors.find((d) => d.kind === 'SCHOOL_TAG');
      expect(schoolDescriptor).toBeDefined();
      expect(schoolDescriptor.contract).toBe('PB-WORLD-DESCRIPTOR-v1');
      expect(schoolDescriptor.school).toBe('void');
    });

    it('compiles program invoking pixelbrain.fibonacci-field runtime descriptor', () => {
      const src = `SCDL 2
ASSET golden_spiral_nodes
CANVAS WIDTH 32 HEIGHT 32

APPLY_AMP $field ANY {
  AMP pixelbrain.fibonacci-field
  VERSION 1.0.0
  STAGE RUNTIME_DESCRIPTOR
  PARAM count 34
  PARAM goldenAngle 137.5
}

LAYER main ORDER 10 {
  PAINT (PIXEL AT (VEC2 (PX 16) (PX 16))) FILL #ffd700 RASTER CENTER
}
`;
      const res = compileSCDLV2(src);
      expect(res.ok).toBe(true);
      expect(res.package).toBeDefined();
      expect(res.ampDescriptors.length).toBeGreaterThanOrEqual(1);
      const fibDescriptor = res.ampDescriptors.find((d) => d.kind === 'FIBONACCI_FIELD');
      expect(fibDescriptor).toBeDefined();
      expect(fibDescriptor.contract).toBe('PB-RUNTIME-DESCRIPTOR-v1');
      expect(fibDescriptor.nodeCount).toBe(34);
    });
  });
});

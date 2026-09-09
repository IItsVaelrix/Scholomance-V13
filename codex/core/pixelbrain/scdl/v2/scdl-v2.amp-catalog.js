/**
 * Central Catalog and Registry for SCDL v2 Universal AMP Substrate.
 *
 * Tracks all registered PB-AMP-ABI-v1 manifests and their associated
 * execution adapters.
 */

import { validateAmpAbiManifest, computeAmpAbiChecksum } from './scdl-v2.amp-abi.js';
import { ANCHOR_MANIFESTS } from './amp-manifests/index.js';

import FacetAdapter from './adapters/facet.adapter.js';
import PixelAAAdapter from './adapters/pixel-aa.adapter.js';
import ImageSegmentationAdapter from './adapters/image-segmentation.adapter.js';
import GearGlideAdapter from './adapters/gear-glide.adapter.js';
import NoiseFillAdapter from './adapters/noise-fill.adapter.js';
import GeometryAdapter from './adapters/geometry.adapter.js';
import RegionFillAdapter from './adapters/region-fill.adapter.js';
import SdfShapeAdapter from './adapters/sdf-shape.adapter.js';
import SeloutAdapter from './adapters/selout.adapter.js';
import ShieldRimAdapter from './adapters/shield-rim.adapter.js';
import ShieldVolumeAdapter from './adapters/shield-volume.adapter.js';
import SketchAdapter from './adapters/sketch.adapter.js';
import SymmetryAdapter from './adapters/symmetry.adapter.js';
import ChestplateAdapter from './adapters/chestplate.adapter.js';
import ChestplateBevelAdapter from './adapters/chestplate-bevel.adapter.js';
import ChestplateSurfaceTextureAdapter from './adapters/chestplate-surface-texture.adapter.js';
import CrystalCoreAdapter from './adapters/crystal-core.adapter.js';
import FlameTipAdapter from './adapters/flame-tip.adapter.js';
import HolyfireMotifAdapter from './adapters/holyfire-motif.adapter.js';
import JewelryAdapter from './adapters/jewelry.adapter.js';
import HeraldryAdapter from './adapters/heraldry.adapter.js';
import PaletteQuantizationAdapter from './adapters/palette-quantization.adapter.js';
import ShadowAdapter from './adapters/shadow.adapter.js';
import SquareSharpnessContrastAdapter from './adapters/square-sharpness-contrast.adapter.js';
import TonationAdapter from './adapters/tonation.adapter.js';
import VectorAdapter from './adapters/vector.adapter.js';
import VolumeAdapter from './adapters/volume.adapter.js';
import NeighborExtrapolationAdapter from './adapters/neighbor-extrapolation.adapter.js';
import PixelScaleAdapter from './adapters/pixel-scale.adapter.js';
import HairFlowAdapter from './adapters/hair-flow.adapter.js';
import ScholomanceCharacterMotifAdapter from './adapters/scholomance-character-motif.adapter.js';
import GravityAdapter from './adapters/gravity.adapter.js';
import BiomeCoherenceAdapter from './adapters/biome-coherence.adapter.js';
import VolumeLiftAdapter from './adapters/volume-lift.adapter.js';
import HollownessAdapter from './adapters/hollowness.adapter.js';
import ChunksSeamAdapter from './adapters/chunks-seam.adapter.js';
import SchoolTagAdapter from './adapters/school-tag.adapter.js';
import GrassAdapter from './adapters/grass.adapter.js';
import BiomeMaterialAdapter from './adapters/biome-material.adapter.js';
import MaterialResolverAdapter from './adapters/material-resolver.adapter.js';
import FibonacciFieldAdapter from './adapters/fibonacci-field.adapter.js';
import FibonacciSeedFieldAdapter from './adapters/fibonacci-seed-field.adapter.js';
import IsoTileGeometryAdapter from './adapters/iso-tile-geometry.adapter.js';
import TileSocketAdapter from './adapters/tile-socket.adapter.js';
import VolumeProcessorAdapter from './adapters/volume-processor.adapter.js';
import HeightmapAdapter from './adapters/heightmap.adapter.js';
import PerlinFieldAdapter from './adapters/perlin-field.adapter.js';
import NoiseMaskAdapter from './adapters/noise-mask.adapter.js';
import SoilAdapter from './adapters/soil.adapter.js';
import WandStrokeAdapter from './adapters/wand-stroke.adapter.js';

class AmpCatalog {
  constructor() {
    this.manifests = new Map();
    this.adapters = new Map();
    this.checksums = new Map();
  }

  /**
   * Registers a PB-AMP-ABI-v1 manifest.
   * Throws if the manifest is invalid.
   */
  registerManifest(manifest) {
    const val = validateAmpAbiManifest(manifest);
    if (!val.ok) {
      throw new Error(`Cannot register invalid manifest for '${manifest?.ampId}': ${val.errors.join('; ')}`);
    }

    const checksum = computeAmpAbiChecksum(manifest);
    const frozen = Object.freeze({ ...manifest, checksum });
    this.manifests.set(manifest.ampId, frozen);
    this.checksums.set(manifest.ampId, checksum);
    return frozen;
  }

  getManifest(ampId) {
    return this.manifests.get(ampId) || null;
  }

  hasManifest(ampId) {
    return this.manifests.has(ampId);
  }

  listManifests() {
    return Object.freeze([...this.manifests.values()]);
  }

  /**
   * Registers an execution adapter for an AMP.
   * An adapter must implement:
   * - execute(inputs, params, context) -> output
   */
  registerAdapter(ampId, adapter) {
    if (!adapter || typeof adapter.execute !== 'function') {
      throw new Error(`Adapter for '${ampId}' must provide an execute() method.`);
    }
    this.adapters.set(ampId, Object.freeze(adapter));
  }

  getAdapter(ampId) {
    return this.adapters.get(ampId) || null;
  }

  hasAdapter(ampId) {
    return this.adapters.has(ampId);
  }

  clear() {
    this.manifests.clear();
    this.adapters.clear();
    this.checksums.clear();
  }

  loadManifestsFromDir(dirPath) {
    // In browser bundles, directory scanning is unsupported.
    // Anchor manifests are statically pre-registered in initAnchorAmps.
    return [];
  }

  initAnchorAmps() {
    for (const manifest of ANCHOR_MANIFESTS) {
      this.registerManifest(manifest);
    }
    this.registerAdapter('pixelbrain.facet', FacetAdapter);
    this.registerAdapter('pixelbrain.pixel-aa', PixelAAAdapter);
    this.registerAdapter('pixelbrain.image-segmentation', ImageSegmentationAdapter);
    this.registerAdapter('pixelbrain.gear-glide', GearGlideAdapter);
    this.registerAdapter('pixelbrain.noise-fill', NoiseFillAdapter);
    this.registerAdapter('pixelbrain.geometry', GeometryAdapter);
    this.registerAdapter('pixelbrain.region-fill', RegionFillAdapter);
    this.registerAdapter('pixelbrain.sdf-shape', SdfShapeAdapter);
    this.registerAdapter('pixelbrain.selout', SeloutAdapter);
    this.registerAdapter('pixelbrain.shield-rim', ShieldRimAdapter);
    this.registerAdapter('pixelbrain.shield-volume', ShieldVolumeAdapter);
    this.registerAdapter('pixelbrain.sketch', SketchAdapter);
    this.registerAdapter('pixelbrain.symmetry', SymmetryAdapter);
    this.registerAdapter('pixelbrain.chestplate', ChestplateAdapter);
    this.registerAdapter('pixelbrain.chestplate-bevel', ChestplateBevelAdapter);
    this.registerAdapter('pixelbrain.chestplate-surface-texture', ChestplateSurfaceTextureAdapter);
    this.registerAdapter('pixelbrain.crystal-core', CrystalCoreAdapter);
    this.registerAdapter('pixelbrain.flame-tip', FlameTipAdapter);
    this.registerAdapter('pixelbrain.holyfire-motif', HolyfireMotifAdapter);
    this.registerAdapter('pixelbrain.jewelry', JewelryAdapter);
    this.registerAdapter('pixelbrain.heraldry', HeraldryAdapter);
    this.registerAdapter('pixelbrain.palette-quantization', PaletteQuantizationAdapter);
    this.registerAdapter('pixelbrain.shadow', ShadowAdapter);
    this.registerAdapter('pixelbrain.square-sharpness-contrast', SquareSharpnessContrastAdapter);
    this.registerAdapter('pixelbrain.tonation', TonationAdapter);
    this.registerAdapter('pixelbrain.vector', VectorAdapter);
    this.registerAdapter('pixelbrain.volume', VolumeAdapter);
    this.registerAdapter('pixelbrain.neighbor-extrapolation', NeighborExtrapolationAdapter);
    this.registerAdapter('pixelbrain.pixel-scale', PixelScaleAdapter);
    this.registerAdapter('pixelbrain.hair-flow', HairFlowAdapter);
    this.registerAdapter('pixelbrain.scholomance-character-motif', ScholomanceCharacterMotifAdapter);
    this.registerAdapter('pixelbrain.gravity', GravityAdapter);
    this.registerAdapter('pixelbrain.biome-coherence', BiomeCoherenceAdapter);
    this.registerAdapter('pixelbrain.volume-lift', VolumeLiftAdapter);
    this.registerAdapter('pixelbrain.hollowness', HollownessAdapter);
    this.registerAdapter('pixelbrain.chunks-seam', ChunksSeamAdapter);
    this.registerAdapter('pixelbrain.school-tag', SchoolTagAdapter);
    this.registerAdapter('pixelbrain.grass', GrassAdapter);
    this.registerAdapter('pixelbrain.biome-material', BiomeMaterialAdapter);
    this.registerAdapter('pixelbrain.material-resolver', MaterialResolverAdapter);
    this.registerAdapter('pixelbrain.fibonacci-field', FibonacciFieldAdapter);
    this.registerAdapter('pixelbrain.fibonacci-seed-field', FibonacciSeedFieldAdapter);
    this.registerAdapter('pixelbrain.iso-tile-geometry', IsoTileGeometryAdapter);
    this.registerAdapter('pixelbrain.tile-socket', TileSocketAdapter);
    this.registerAdapter('pixelbrain.volume-processor', VolumeProcessorAdapter);
    this.registerAdapter('pixelbrain.heightmap', HeightmapAdapter);
    this.registerAdapter('pixelbrain.perlin-field', PerlinFieldAdapter);
    this.registerAdapter('pixelbrain.noise-mask', NoiseMaskAdapter);
    this.registerAdapter('pixelbrain.soil', SoilAdapter);
    this.registerAdapter('pixelbrain.dirt', SoilAdapter);
    this.registerAdapter('pixelbrain.tile-ground', SoilAdapter);
    this.registerAdapter('pixelbrain.wand-stroke', WandStrokeAdapter);
  }
}

export const globalAmpCatalog = new AmpCatalog();
globalAmpCatalog.initAnchorAmps();

export function registerAmpManifest(manifest) {
  return globalAmpCatalog.registerManifest(manifest);
}

export function getAmpManifest(ampId) {
  return globalAmpCatalog.getManifest(ampId);
}

export function listAmpManifests() {
  return globalAmpCatalog.listManifests();
}

export function registerAmpAdapter(ampId, adapter) {
  return globalAmpCatalog.registerAdapter(ampId, adapter);
}

export function getAmpAdapter(ampId) {
  return globalAmpCatalog.getAdapter(ampId);
}

export const DESCRIPTOR_CONSUMER_REGISTRY = Object.freeze({
  'pixelbrain.soil': Object.freeze({
    target: 'terrain_mesh_subsurface',
    targetRole: 'ground_base',
    consumedBy: Object.freeze(['tile-forge.synthesizer', 'world-voxel-renderer']),
    capabilities: Object.freeze(['subterranean_depth', 'material_ramps', 'bedrock_floor']),
    modifiesPixels: true,
    modifiesPixelsAtCompile: false,
    runtimePresentation: true,
  }),
  'pixelbrain.dirt': Object.freeze({
    targetRole: 'ground_base',
    consumedBy: Object.freeze(['tile-forge.synthesizer', 'world-voxel-renderer']),
    capabilities: Object.freeze(['subterranean_depth', 'material_ramps', 'bedrock_floor']),
    modifiesPixelsAtCompile: false,
    runtimePresentation: true,
  }),
  'pixelbrain.grass': Object.freeze({
    targetRole: 'ground_cover',
    consumedBy: Object.freeze(['grass-engine', 'world-vegetation-renderer']),
    capabilities: Object.freeze(['wind_sway', 'blade_placement', 'bioluminescence']),
    modifiesPixelsAtCompile: false,
    runtimePresentation: true,
  }),
  'pixelbrain.tile-socket': Object.freeze({
    targetRole: 'adjacency_socket',
    consumedBy: Object.freeze(['tile-forge.pipeline', 'chunk-assembler']),
    capabilities: Object.freeze(['socket_matching', 'elevation_transition']),
    modifiesPixelsAtCompile: false,
    runtimePresentation: false,
  }),
  'pixelbrain.chunks-seam': Object.freeze({
    targetRole: 'chunk_boundary',
    consumedBy: Object.freeze(['chunk-assembler']),
    capabilities: Object.freeze(['edge_stitching']),
    modifiesPixelsAtCompile: false,
    runtimePresentation: false,
  }),
});

export function getDescriptorConsumer(ampId) {
  return DESCRIPTOR_CONSUMER_REGISTRY[ampId] || null;
}


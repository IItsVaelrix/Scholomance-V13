/**
 * Static anchor manifests export for SCDL v2 browser-safe runtime.
 *
 * Provides static exports for the 5 anchor manifests, avoiding runtime
 * node:fs/node:path imports in the compiler dependency graph.
 */

export const FACET_MANIFEST = Object.freeze({
  contract: 'PB-AMP-ABI-v1',
  ampId: 'pixelbrain.facet',
  version: '1.0.0',
  execution: 'COMPILE',
  stage: 'SHAPE_POST',
  scope: ['SHAPE', 'LAYER'],
  inputs: [
    {
      name: 'geometry',
      type: 'SHAPE',
      required: true,
      description: 'Input shape to facet into angular planar regions',
    },
  ],
  parameters: [
    {
      name: 'facetCount',
      type: 'I32',
      min: 3,
      max: 32,
      default: 8,
      description: 'Number of radial facet divisions',
    },
  ],
  output: {
    type: 'SHAPE',
    description: 'Faceted shape geometry with faceted region metadata',
  },
  determinism: {
    class: 'PURE',
    seedRequired: false,
  },
  cost: {
    model: 'LINEAR_IN_CELLS',
    multiplier: 4,
    fixed: 0,
  },
  order: 40,
  relevance: {
    pipelines: ['item', 'render-fidelity'],
    conditions: [
      {
        field: 'materials',
        op: 'includes',
        value: 'gem',
      },
    ],
  },
  checksum: '9b4e952848668f470ab38ba938e8912557e0f4a48e8805819d91e73df94ef28a',
});

export const GEAR_GLIDE_MANIFEST = Object.freeze({
  contract: 'PB-AMP-ABI-v1',
  ampId: 'pixelbrain.gear-glide',
  version: '1.0.0',
  execution: 'DESCRIPTOR',
  stage: 'RUNTIME_DESCRIPTOR',
  scope: ['TIMELINE', 'ASSET'],
  inputs: [
    {
      name: 'targetId',
      type: 'ANY',
      required: false,
      description: 'Optional target layer or shape identifier',
    },
  ],
  parameters: [
    {
      name: 'bpm',
      type: 'I32',
      min: 40,
      max: 220,
      default: 90,
      description: 'BPM tempo sync rate',
    },
    {
      name: 'degreesPerBeat',
      type: 'I32',
      min: 15,
      max: 360,
      default: 90,
      description: 'Angular rotation degrees advanced per beat',
    },
  ],
  output: {
    type: 'ANY',
    description: 'Immutable runtime motion and rotation descriptor',
  },
  determinism: {
    class: 'PURE',
    seedRequired: false,
  },
  cost: {
    model: 'CONSTANT',
    multiplier: 1,
    fixed: 10,
  },
  order: 110,
  relevance: {
    pipelines: ['runtime'],
    conditions: [
      {
        field: 'tags',
        op: 'includes',
        value: 'gear',
      },
    ],
  },
  checksum: 'ea7ac201b94a7f48f78b061cc2e197343c8a613259ca9770c5e2adf5d22d6ebe',
});

export const IMAGE_SEGMENTATION_MANIFEST = Object.freeze({
  contract: 'PB-AMP-ABI-v1',
  ampId: 'pixelbrain.image-segmentation',
  version: '1.0.0',
  execution: 'ANALYZE',
  stage: 'SOURCE_ANALYSIS',
  scope: ['PROGRAM', 'ASSET'],
  inputs: [
    {
      name: 'target',
      type: 'LAYER',
      required: true,
      description: 'Source layer to analyze into connected-component regions',
    },
  ],
  parameters: [
    {
      name: 'minRegionSize',
      type: 'I32',
      min: 1,
      max: 100,
      default: 5,
      description: 'Minimum cell count to form an independent slab',
    },
  ],
  output: {
    type: 'LAYER',
    description: 'Analyzed layer with segmented region tags',
  },
  determinism: {
    class: 'PURE',
    seedRequired: false,
  },
  cost: {
    model: 'LINEAR_IN_CELLS',
    multiplier: 3,
    fixed: 0,
  },
  order: 10,
  relevance: {
    pipelines: ['image-lattice'],
    conditions: [],
  },
  checksum: 'aa840a748b9aae2ab6cfecab4f2817626f5bccdcbf4d472cc6e3af289bf49122',
});

export const NOISE_FILL_MANIFEST = Object.freeze({
  contract: 'PB-AMP-ABI-v1',
  ampId: 'pixelbrain.noise-fill',
  version: '1.0.0',
  execution: 'COMPILE',
  stage: 'PAINT',
  scope: ['LAYER', 'SHAPE'],
  inputs: [
    {
      name: 'target',
      type: 'LAYER',
      required: true,
      description: 'Layer or paint cells whose intensities are modulated with deterministic noise',
    },
  ],
  parameters: [
    {
      name: 'seed',
      type: 'I32',
      min: 0,
      max: 2147483647,
      default: 1337,
      description: 'Deterministic PRNG seed',
    },
    {
      name: 'frequency',
      type: 'FIXED',
      min: 0,
      max: 1,
      default: 0.1,
      description: 'Noise spatial frequency',
    },
  ],
  output: {
    type: 'LAYER',
    description: 'Layer with modulated cell intensity metadata',
  },
  determinism: {
    class: 'SEEDED',
    seedRequired: true,
  },
  cost: {
    model: 'LINEAR_IN_CELLS',
    multiplier: 3,
    fixed: 0,
  },
  order: 60,
  relevance: {
    pipelines: ['item', 'render-fidelity'],
    conditions: [
      {
        field: 'materials',
        op: 'includes',
        value: 'noise',
      },
    ],
  },
  checksum: '7e638f20f68d68093f1266246edadc27f1d00f9f59a0fb2d32c6400d548d52e0',
});

export const PIXEL_AA_MANIFEST = Object.freeze({
  contract: 'PB-AMP-ABI-v1',
  ampId: 'pixelbrain.pixel-aa',
  version: '1.0.0',
  execution: 'COMPILE',
  stage: 'LAYER_POST',
  scope: ['LAYER'],
  inputs: [
    {
      name: 'layer',
      type: 'LAYER',
      required: true,
      description: 'Layer whose raster paint cells receive anti-aliasing',
    },
  ],
  parameters: [
    {
      name: 'strength',
      type: 'FIXED',
      min: 0,
      max: 1,
      default: 1,
      description: 'Anti-aliasing corner softening factor',
    },
  ],
  output: {
    type: 'LAYER',
    description: 'Layer with anti-aliased perimeter cells',
  },
  determinism: {
    class: 'PURE',
    seedRequired: false,
  },
  cost: {
    model: 'LINEAR_IN_CELLS',
    multiplier: 2,
    fixed: 0,
  },
  order: 70,
  relevance: {
    pipelines: ['render-fidelity'],
    conditions: [],
  },
  checksum: '7ae8d3114ba8d547dc1b7b36c08a83f703e0213f1a3f3ad2017ac5acd3789b0e',
});

export const ANCHOR_MANIFESTS = Object.freeze([
  FACET_MANIFEST,
  GEAR_GLIDE_MANIFEST,
  IMAGE_SEGMENTATION_MANIFEST,
  NOISE_FILL_MANIFEST,
  PIXEL_AA_MANIFEST,
]);

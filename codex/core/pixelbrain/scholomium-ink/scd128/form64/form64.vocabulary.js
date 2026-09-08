/**
 * Scholomium Ink — FORM64 Universal Structural Vocabulary
 *
 * Provides the base allow-lists and constraints for the 8 FORM64 slot categories.
 * Family-specific specializations extend these categories without violating bounds.
 */

export const FORM64_BASE_VOCABULARY = Object.freeze({
  ASSET_CLASS: Object.freeze([
    'tree',
    'foliage_prop',
    'flora',
    'canopy_structure',
  ]),

  SCALE_FRAME: Object.freeze({
    projections: Object.freeze(['dimetric_2_5d', 'ortho_2d', 'top_down', 'profile_side']),
    orientations: Object.freeze(['upright', 'leaning_left', 'leaning_right', 'horizontal']),
    groundAnchors: Object.freeze(['bottom_center', 'bottom_left', 'bottom_right', 'center_root']),
  }),

  SILHOUETTE: Object.freeze({
    envelopes: Object.freeze([
      'broad_rounded',
      'oval_columnar',
      'tapered_spire',
      'horizontal_terraced',
      'radial_tiered',
      'dense_conical',
      'lobed_spreading',
    ]),
    trunkExposures: Object.freeze(['low', 'medium', 'high', 'extreme']),
  }),

  STRUCTURAL_SKELETON: Object.freeze({
    trunkAxes: Object.freeze(['straight', 'sinuous', 'forked', 'bent', 'twisted']),
    branchingOrders: Object.freeze(['single_dominant', 'bifurcated', 'whorled', 'deliquescent']),
  }),

  PROPORTION: Object.freeze({
    aspectClasses: Object.freeze(['ultra_tall', 'tall_slender', 'balanced', 'broad_spreading', 'squat']),
  }),

  MASS_DISTRIBUTION: Object.freeze({
    weightCenters: Object.freeze(['low', 'mid', 'high', 'tiered_whorls', 'upper_canopy']),
  }),

  NEGATIVE_SPACE: Object.freeze({
    voidFrequencies: Object.freeze(['dense_closed', 'moderate_gaps', 'open_airy', 'layered_horizontal_voids']),
  }),

  WORLD_FOOTPRINT: Object.freeze({
    rootSpreads: Object.freeze(['compact', 'buttressed', 'exposed_spreading', 'stilted']),
    collisionFootprints: Object.freeze(['circular_base', 'elliptical_base', 'pill_base']),
  }),
});

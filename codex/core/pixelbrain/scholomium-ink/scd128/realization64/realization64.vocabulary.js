/**
 * Scholomium Ink — REALIZATION64 Universal Pixel-Language Vocabulary
 *
 * Provides the base allow-lists and constraints for the 8 REALIZATION64 slot categories.
 * Family-specific specializations extend these categories without violating bounds.
 */

export const REALIZATION64_BASE_VOCABULARY = Object.freeze({
  PIXEL_DENSITY: Object.freeze({
    resolutions: Object.freeze(['16x16', '24x24', '32x32', '32x52', '48x48', '48x64', '64x64', '64x96', '64x128']),
    clusterQuanta: Object.freeze([1, 2, 3, 4]),
    detailFrequencies: Object.freeze(['low_sparse', 'medium_clustered', 'high_dense', 'micro_textured']),
  }),

  EDGE_LANGUAGE: Object.freeze({
    outlineWeights: Object.freeze(['none', 'selout_single', 'dark_edge_double', 'selective_accent', 'crisp_1px']),
    stairCadences: Object.freeze(['uniform_steps', 'irregular_organic', 'steep_vertical', 'horizontal_terraced']),
    antiAliasPolicies: Object.freeze(['strict_binary_no_aa', 'selective_corner_aa', 'cluster_terminal_aa']),
  }),

  CLUSTER_RHYTHM: Object.freeze({
    clusterStyles: Object.freeze(['foliage_masses', 'linear_needles', 'bark_furrows', 'organic_patches']),
    isolatedCellPolicies: Object.freeze(['forbidden_zero_orphans', 'allowed_sparkle_only', 'foliage_glints_bounded']),
  }),

  VALUE_HIERARCHY: Object.freeze({
    valueBandCounts: Object.freeze([3, 4, 5, 6, 7]),
    contrastCurves: Object.freeze(['high_key_crisp', 'balanced_medium', 'deep_shadow_dramatic']),
  }),

  MATERIAL_LANGUAGE: Object.freeze({
    barkMaterialMarks: Object.freeze(['furrowed_deep', 'fibrous_striated', 'plated_scaly', 'papery_smooth']),
    foliageMaterialMarks: Object.freeze(['needle_clusters', 'lobed_leaf_clumps', 'horizontal_scale_leaves', 'fan_leaves']),
  }),

  PALETTE_LOGIC: Object.freeze({
    colorRoles: Object.freeze([
      'canopy_dark',
      'canopy_base',
      'canopy_mid',
      'canopy_lit',
      'canopy_hi',
      'canopy_spec',
      'bark_dark',
      'bark_base',
      'bark_mid',
      'bark_lit',
      'shadow_abyss',
    ]),
    temperatureShifts: Object.freeze(['warm_highlights_cool_shadows', 'cool_highlights_warm_shadows', 'neutral_monochrome']),
  }),

  LIGHT_RESPONSE: Object.freeze({
    directions: Object.freeze(['upper_left', 'upper_right', 'top_down', 'ambient_diffuse']),
    canopyTransmissionRates: Object.freeze(['opaque', 'subtle_glow', 'high_translucency']),
  }),

  SURFACE_VARIATION: Object.freeze({
    variationModes: Object.freeze(['clean_unweathered', 'lichen_spotted', 'moss_laden', 'frost_rimed', 'bioluminescent_drift']),
  }),
});

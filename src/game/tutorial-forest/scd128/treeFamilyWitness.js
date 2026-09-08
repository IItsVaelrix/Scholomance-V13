/**
 * Tutorial Forest — SCD128 Dual-Witness Tree Family Specification
 *
 * Formal dual-witness architecture for botanical tree species in the Tutorial Forest.
 * Strictly separates FORM64 (silhouette habit, branching skeleton, proportion) from
 * REALIZATION64 (hue-shifted palette ramps, Bayer dithering, discrete lobe normals).
 */

import {
  computeCanonicalDigest256,
  deriveSlotBlockHex,
} from '../../../../codex/core/pixelbrain/scholomium-ink/scd128/scd128.canonical.js';

export const TREE_FORM_SLOTS = [
  'ASSET_CLASS',
  'SCALE_FRAME',
  'SILHOUETTE',
  'STRUCTURAL_SKELETON',
  'PROPORTION',
  'MASS_DISTRIBUTION',
  'NEGATIVE_SPACE',
  'WORLD_FOOTPRINT',
];

export const TREE_REALIZATION_SLOTS = [
  'PIXEL_DENSITY',
  'EDGE_LANGUAGE',
  'CLUSTER_RHYTHM',
  'VALUE_HIERARCHY',
  'MATERIAL_LANGUAGE',
  'PALETTE_LOGIC',
  'LIGHT_RESPONSE',
  'SURFACE_VARIATION',
];

export const FOREST_TREE_SPECIES = Object.freeze({
  ancient_moss_oak: {
    id: 'ancient_moss_oak',
    name: 'Ancient Moss Oak',
    canvasWidth: 56,
    canvasHeight: 72,
    envelope: 'broad_rounded',
    branching: 'deliquescent_massive',
    proportion: 'heavy_low_canopy',
    rootSpread: 18,
    paletteKey: 'ancient_verdant',
    foliageMaterial: 'broadleaf_oak_clumps',
    barkMaterial: 'gnarled_furrowed_oak',
    canopyColors: {
      c7: '#BEF264', c6: '#84CC16', c5: '#44A832', c4: '#288828',
      c3: '#186424', c2: '#0E481C', c1: '#0A3014', c0: '#04180A',
    },
    woodColors: {
      t4: '#9A7B56', t3: '#6B4E2B', t2: '#4A3319', t1: '#2E1E0E', t0: '#170E06',
    },
  },
  sacred_lotus_cedar: {
    id: 'sacred_lotus_cedar',
    name: 'Sacred Lotus Cedar',
    canvasWidth: 48,
    canvasHeight: 64,
    envelope: 'horizontal_terraced',
    branching: 'tiered_horizontal_shelves',
    proportion: 'balanced_stepped',
    rootSpread: 14,
    paletteKey: 'lotus_emerald_cinnamon',
    foliageMaterial: 'flat_cedar_fronds',
    barkMaterial: 'cinnamon_fibrous_ironbark',
    canopyColors: {
      c7: '#6EE7B7', c6: '#10B981', c5: '#059669', c4: '#047857',
      c3: '#064E3B', c2: '#033B2C', c1: '#022C22', c0: '#011712',
    },
    woodColors: {
      t4: '#D97706', t3: '#B45309', t2: '#92400E', t1: '#78350F', t0: '#451A03',
    },
  },
  sunlit_young_sapling: {
    id: 'sunlit_young_sapling',
    name: 'Sunlit Glade Sapling',
    canvasWidth: 32,
    canvasHeight: 48,
    envelope: 'compact_oval',
    branching: 'slender_upright',
    proportion: 'slender_sapling',
    rootSpread: 8,
    paletteKey: 'sunlit_lime',
    foliageMaterial: 'tender_young_leaf',
    barkMaterial: 'smooth_green_hazel',
    canopyColors: {
      c7: '#FDE047', c6: '#BEF264', c5: '#84CC16', c4: '#4D7C0F',
      c3: '#365314', c2: '#1A2E05', c1: '#0E1A03', c0: '#060F02',
    },
    woodColors: {
      t4: '#A8A29E', t3: '#78716C', t2: '#57534E', t1: '#3B3734', t0: '#1C1917',
    },
  },
  sentinel_frostpine: {
    id: 'sentinel_frostpine',
    name: 'Sentinel Frostpine',
    canvasWidth: 36,
    canvasHeight: 68,
    envelope: 'dense_conical_spire',
    branching: 'radial_whorled_spire',
    proportion: 'columnar_tall',
    rootSpread: 10,
    paletteKey: 'glacial_spruce',
    foliageMaterial: 'dense_comb_needles',
    barkMaterial: 'pine_scaly_grey',
    canopyColors: {
      c7: '#BAE6FD', c6: '#38BDF8', c5: '#0284C7', c4: '#0369A1',
      c3: '#075985', c2: '#0C4A6E', c1: '#082F49', c0: '#031726',
    },
    woodColors: {
      t4: '#78716C', t3: '#57534E', t2: '#44403C', t1: '#292524', t0: '#1C1917',
    },
  },
  grandfather_oak: {
    id: 'grandfather_oak',
    name: 'Grandfather Ancient Oak',
    canvasWidth: 160,
    canvasHeight: 200,
    envelope: 'heroic_broad_oak',
    branching: 'sprawling_gnarled_boughs',
    proportion: 'heroic_monumental',
    rootSpread: 42,
    paletteKey: 'heroic_verdant_moss',
    foliageMaterial: 'volumetric_oak_canopy',
    barkMaterial: 'gnarled_ancient_timber',
    canopyColors: {
      c7: '#E2F972', c6: '#A9DF26', c5: '#76B819', c4: '#498816',
      c3: '#2D6112', c2: '#1D450C', c1: '#112C07', c0: '#071603',
    },
    woodColors: {
      t4: '#C29B68', t3: '#926F42', t2: '#684926', t1: '#432C13', t0: '#231508',
    },
  },
  autumn_gold_maple: {
    id: 'autumn_gold_maple',
    name: 'Autumnal Gold Maple',
    canvasWidth: 140,
    canvasHeight: 180,
    envelope: 'heroic_autumn_maple',
    branching: 'sweeping_curved_limbs',
    proportion: 'graceful_flaring_canopy',
    rootSpread: 36,
    paletteKey: 'autumnal_gold_amber',
    foliageMaterial: 'layered_amber_maple_fronds',
    barkMaterial: 'weathered_grey_walnut',
    canopyColors: {
      c7: '#FEF08A', c6: '#FBBF24', c5: '#F59E0B', c4: '#D97706',
      c3: '#B45309', c2: '#92400E', c1: '#662208', c0: '#380E04',
    },
    woodColors: {
      t4: '#A89E96', t3: '#786F68', t2: '#524B45', t1: '#36302B', t0: '#1D1917',
    },
  },
});

export function buildTreeFormWitness(speciesKey = 'ancient_moss_oak') {
  const spec = FOREST_TREE_SPECIES[speciesKey] || FOREST_TREE_SPECIES.ancient_moss_oak;

  const slotData = {
    ASSET_CLASS: { canonicalCategory: 'botanical_tree', parameters: { species: spec.id } },
    SCALE_FRAME: {
      canonicalCategory: 'dimetric_tree_canvas',
      parameters: { canvas_width: spec.canvasWidth, canvas_height: spec.canvasHeight },
    },
    SILHOUETTE: {
      canonicalCategory: spec.envelope,
      parameters: { max_width: spec.canvasWidth - 4, crown_bottom_pct: 35 },
    },
    STRUCTURAL_SKELETON: {
      canonicalCategory: spec.branching,
      parameters: { bough_clusters: spec.envelope === 'horizontal_terraced' ? 5 : 4 },
    },
    PROPORTION: {
      canonicalCategory: spec.proportion,
      parameters: { root_spread_px: spec.rootSpread },
    },
    MASS_DISTRIBUTION: {
      canonicalCategory: 'spherical_lobe_clusters',
      parameters: { primary_lobes: spec.canvasWidth > 40 ? 6 : 4 },
    },
    NEGATIVE_SPACE: {
      canonicalCategory: 'foliage_sky_windows',
      parameters: { canopy_density_pct: 82 },
    },
    WORLD_FOOTPRINT: {
      canonicalCategory: 'anchored_buttress',
      parameters: { ground_depth_px: 4, trunk_radius_px: Math.round(spec.rootSpread / 3) },
    },
  };

  const slots = TREE_FORM_SLOTS.map((slotName, pos) => {
    const record = slotData[slotName];
    const digest256 = computeCanonicalDigest256(record);
    const blockHex = deriveSlotBlockHex(digest256, pos, 'form');
    return { slot: slotName, position: pos, blockHex, digest256, ...record };
  });

  const form64Hex = slots.map((s) => s.blockHex).join('');
  return { bank: 'form', form64Hex, slots };
}

export function buildTreeRealizationWitness(speciesKey = 'ancient_moss_oak') {
  const spec = FOREST_TREE_SPECIES[speciesKey] || FOREST_TREE_SPECIES.ancient_moss_oak;

  const slotData = {
    PIXEL_DENSITY: {
      canonicalCategory: 'quantum_1x_discrete',
      parameters: { pixel_size: 1, subpixel_blur: 'forbidden' },
    },
    EDGE_LANGUAGE: {
      canonicalCategory: 'notched_leaf_perimeter',
      parameters: { edge_stipple: 'bayer_2x2', outline: 'selective_dark_ao' },
    },
    CLUSTER_RHYTHM: {
      canonicalCategory: 'layered_foliage_lobes',
      parameters: { spherical_normals: true, lobe_curvature: 85 },
    },
    VALUE_HIERARCHY: {
      canonicalCategory: 'stepped_8_tone_canopy_5_wood',
      parameters: { canopy_bands: 8, wood_bands: 5 },
    },
    MATERIAL_LANGUAGE: {
      canonicalCategory: `${spec.foliageMaterial}_over_${spec.barkMaterial}`,
      parameters: { foliage: spec.foliageMaterial, bark: spec.barkMaterial },
    },
    PALETTE_LOGIC: {
      canonicalCategory: spec.paletteKey,
      parameters: { highlight_hex: spec.canopyColors.c7, shadow_hex: spec.canopyColors.c0 },
    },
    LIGHT_RESPONSE: {
      canonicalCategory: 'upper_left_spherical_dot',
      parameters: { light_vector: [-65, -75], ambient_occlusion: 25 },
    },
    SURFACE_VARIATION: {
      canonicalCategory: 'foliage_highlights_and_bark_ribs',
      parameters: { highlight_flecks: true, wood_striations: true },
    },
  };

  const slots = TREE_REALIZATION_SLOTS.map((slotName, pos) => {
    const record = slotData[slotName];
    const digest256 = computeCanonicalDigest256(record);
    const blockHex = deriveSlotBlockHex(digest256, pos, 'realization');
    return { slot: slotName, position: pos, blockHex, digest256, ...record };
  });

  const realization64Hex = slots.map((s) => s.blockHex).join('');
  return { bank: 'realization', realization64Hex, slots };
}

export function createTreeWitnessRecord(speciesKey = 'ancient_moss_oak') {
  const form = buildTreeFormWitness(speciesKey);
  const realization = buildTreeRealizationWitness(speciesKey);
  const scd128Wire = `${form.form64Hex}${realization.realization64Hex}`;

  return {
    contract: 'SCD128-ASSET-RECORD',
    assetClass: 'botanical_tree',
    speciesKey,
    scd128Wire,
    form,
    realization,
  };
}

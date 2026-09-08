/**
 * Tutorial Forest — SCD128 Dual-Witness Grass Tile Specification
 *
 * Defines strictly isolated FORM64 and REALIZATION64 witness contracts for
 * procedural isometric grass and meadow tiles.
 *
 * Adheres to:
 * - Anti-Vector Invariant: Discrete 1x cells, integer rasterization.
 * - 2:1 Dimetric standard footprint: 80x40 diamond.
 * - Bank Isolation: FORM64 contains zero color/palette data; REALIZATION64 contains zero geometry/mesh data.
 */

import {
  computeCanonicalDigest256,
  deriveSlotBlockHex,
} from '../../../../codex/core/pixelbrain/scholomium-ink/scd128/scd128.canonical.js';

export const GRASS_FORM_SLOTS = [
  'ASSET_CLASS',
  'SCALE_FRAME',
  'SILHOUETTE',
  'STRUCTURAL_SKELETON',
  'PROPORTION',
  'MASS_DISTRIBUTION',
  'NEGATIVE_SPACE',
  'WORLD_FOOTPRINT',
];

export const GRASS_REALIZATION_SLOTS = [
  'PIXEL_DENSITY',
  'EDGE_LANGUAGE',
  'CLUSTER_RHYTHM',
  'VALUE_HIERARCHY',
  'MATERIAL_LANGUAGE',
  'PALETTE_LOGIC',
  'LIGHT_RESPONSE',
  'SURFACE_VARIATION',
];

export const GRASS_PALETTES = Object.freeze({
  verdant_glade: {
    name: 'Verdant Glade',
    c7: '#BEF264', // sun-kissed blade tip
    c6: '#84CC16', // bright foliage highlight
    c5: '#44A832', // rich grass midtone
    c4: '#288828', // base blade body
    c3: '#186424', // under-canopy grass
    c2: '#0E481C', // shadowed base
    c1: '#0A3014', // soil border
    c0: '#04180A', // deep humus occlusion
    soil_hi: '#635446',
    soil_mid: '#3D2817',
    soil_dark: '#1C0F05',
    flower_accent: '#FDE047',
    flower_rare: '#F472B6',
  },
  mossy_grove: {
    name: 'Mossy Grove Shade',
    c7: '#6EE7B7',
    c6: '#10B981',
    c5: '#059669',
    c4: '#047857',
    c3: '#064E3B',
    c2: '#033B2C',
    c1: '#022C22',
    c0: '#011712',
    soil_hi: '#44403C',
    soil_mid: '#292524',
    soil_dark: '#1C1917',
    flower_accent: '#67E8F9',
    flower_rare: '#C084FC',
  },
  path_verge: {
    name: 'Worn Trail Verge',
    c7: '#D9F99D',
    c6: '#A3E635',
    c5: '#65A30D',
    c4: '#4D7C0F',
    c3: '#365314',
    c2: '#273C0E',
    c1: '#1A2E05',
    c0: '#0E1A03',
    soil_hi: '#A8A29E',
    soil_mid: '#57534E',
    soil_dark: '#292524',
    flower_accent: '#FCD34D',
    flower_rare: '#FB7185',
  },
});

/**
 * Builds the FORM64 witness for an isometric grass tile.
 */
export function buildGrassFormWitness({
  variantId = 'glade_standard',
  tileW = 80,
  tileH = 40,
  elevation = 0,
  hasCliff = false,
  cliffDrop = 24,
}) {
  const slotData = {
    ASSET_CLASS: { canonicalCategory: 'iso_terrain_tile', parameters: { subtype: 'grass', variant: variantId } },
    SCALE_FRAME: {
      canonicalCategory: 'dimetric_2_1',
      parameters: { width: Math.round(tileW), height: Math.round(tileH), elevation_z: Math.round(elevation) },
    },
    SILHOUETTE: {
      canonicalCategory: hasCliff ? 'diamond_extruded' : 'diamond_flat',
      parameters: { cliff_drop: hasCliff ? Math.round(cliffDrop) : 0 },
    },
    STRUCTURAL_SKELETON: {
      canonicalCategory: 'subdivided_quadrants',
      parameters: { quad_count: 4, apex_x: Math.round(tileW / 2), apex_y: 0 },
    },
    PROPORTION: {
      canonicalCategory: 'iso_standard_ratio',
      parameters: { aspect: { numerator: '2', denominator: '1' } },
    },
    MASS_DISTRIBUTION: {
      canonicalCategory: 'centered_convex',
      parameters: { top_plane_pct: 100, rim_bevel_px: 1 },
    },
    NEGATIVE_SPACE: {
      canonicalCategory: 'solid_cell_lattice',
      parameters: { interior_holes: 0 },
    },
    WORLD_FOOTPRINT: {
      canonicalCategory: 'iso_socket_grid',
      parameters: { socket_north: 1, socket_east: 1, socket_south: 1, socket_west: 1 },
    },
  };

  const slots = GRASS_FORM_SLOTS.map((slotName, pos) => {
    const record = slotData[slotName];
    const digest256 = computeCanonicalDigest256(record);
    const blockHex = deriveSlotBlockHex(digest256, pos, 'form');
    return { slot: slotName, position: pos, blockHex, digest256, ...record };
  });

  const form64Hex = slots.map((s) => s.blockHex).join('');
  return { bank: 'form', form64Hex, slots };
}

/**
 * Builds the REALIZATION64 witness for an isometric grass tile.
 */
export function buildGrassRealizationWitness({
  paletteKey = 'verdant_glade',
  _densityLevel = 'medium_lush',
  flowerDensity = 'scattered',
}) {
  const palette = GRASS_PALETTES[paletteKey] || GRASS_PALETTES.verdant_glade;

  const slotData = {
    PIXEL_DENSITY: {
      canonicalCategory: 'quantum_1x_crisp',
      parameters: { pixel_scale: 1, antialias: 'none_discrete' },
    },
    EDGE_LANGUAGE: {
      canonicalCategory: 'serrated_blade_fringe',
      parameters: { fringe_max_px: 2, edge_dither: 'bayer_2x2' },
    },
    CLUSTER_RHYTHM: {
      canonicalCategory: 'sward_cellular_patches',
      parameters: { octave_count: 3, persistence: { numerator: '1', denominator: '2' } },
    },
    VALUE_HIERARCHY: {
      canonicalCategory: 'stepped_8_tone',
      parameters: { highlight_stops: 2, mid_stops: 3, shadow_stops: 3 },
    },
    MATERIAL_LANGUAGE: {
      canonicalCategory: 'living_foliage_loam',
      parameters: { blade_material: 'verdant_cellulose', soil_material: 'humus_clay' },
    },
    PALETTE_LOGIC: {
      canonicalCategory: paletteKey,
      parameters: { key_tones: 8, base_hex: palette.c4, shadow_hex: palette.c0 },
    },
    LIGHT_RESPONSE: {
      canonicalCategory: 'upper_left_directional',
      parameters: { light_dir: [-65, -75], ambient_fill: 30 },
    },
    SURFACE_VARIATION: {
      canonicalCategory: flowerDensity,
      parameters: { flower_rate_pct: flowerDensity === 'carpet' ? 12 : flowerDensity === 'scattered' ? 4 : 0 },
    },
  };

  const slots = GRASS_REALIZATION_SLOTS.map((slotName, pos) => {
    const record = slotData[slotName];
    const digest256 = computeCanonicalDigest256(record);
    const blockHex = deriveSlotBlockHex(digest256, pos, 'realization');
    return { slot: slotName, position: pos, blockHex, digest256, ...record };
  });

  const realization64Hex = slots.map((s) => s.blockHex).join('');
  return { bank: 'realization', realization64Hex, slots };
}

/**
 * Creates a complete SCD128 Dual-Witness Record for a Grass Tile.
 */
export function createGrassTileWitnessRecord(formArgs = {}, realizationArgs = {}) {
  const form = buildGrassFormWitness(formArgs);
  const realization = buildGrassRealizationWitness(realizationArgs);
  const scd128Wire = `${form.form64Hex}${realization.realization64Hex}`;

  return {
    contract: 'SCD128-ASSET-RECORD',
    assetClass: 'iso_grass_tile',
    scd128Wire,
    form,
    realization,
  };
}

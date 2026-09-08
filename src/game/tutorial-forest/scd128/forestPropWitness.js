/**
 * Tutorial Forest — SCD128 Dual-Witness Forest Floor & Prop Specification
 *
 * Defines contracts for:
 * 1. Cobblestone / Earth Trail Tiles (80x40 isometric diamond)
 * 2. Mossy Forest Boulders
 * 3. Ancient Carved Waymarker Shrine (tutorial guidance landmark)
 */

import {
  computeCanonicalDigest256,
  deriveSlotBlockHex,
} from '../../../../codex/core/pixelbrain/scholomium-ink/scd128/scd128.canonical.js';

export const PROP_FORM_SLOTS = [
  'ASSET_CLASS',
  'SCALE_FRAME',
  'SILHOUETTE',
  'STRUCTURAL_SKELETON',
  'PROPORTION',
  'MASS_DISTRIBUTION',
  'NEGATIVE_SPACE',
  'WORLD_FOOTPRINT',
];

export const PROP_REALIZATION_SLOTS = [
  'PIXEL_DENSITY',
  'EDGE_LANGUAGE',
  'CLUSTER_RHYTHM',
  'VALUE_HIERARCHY',
  'MATERIAL_LANGUAGE',
  'PALETTE_LOGIC',
  'LIGHT_RESPONSE',
  'SURFACE_VARIATION',
];

export const PROP_PALETTES = Object.freeze({
  stone_trail: {
    s7: '#F5F5F4', // sun-struck stone edge
    s6: '#E7E5E4',
    s5: '#D6D3D1',
    s4: '#A8A29E', // stone body midtone
    s3: '#78716C',
    s2: '#57534E',
    s1: '#44403C', // crevice shadow
    s0: '#1C1917', // deep crevice occlusion
    moss_hi: '#84CC16',
    moss_mid: '#4D7C0F',
    moss_dark: '#14532D',
  },
  ancient_shrine: {
    stone_hi: '#CFBEAA',
    stone_mid: '#8C7B68',
    stone_dark: '#3D3124',
    rune_glow_hi: '#6EE7B7', // emerald sacred rune light
    rune_glow_mid: '#059669',
    rune_glow_dark: '#022C22',
    gold_inlay: '#FDE047',
  },
});

export function buildPropFormWitness(propType = 'cobblestone_path') {
  const isTile = propType.includes('path');
  const isShrine = propType.includes('shrine');

  const slotData = {
    ASSET_CLASS: {
      canonicalCategory: isTile ? 'iso_path_tile' : 'forest_prop',
      parameters: { prop_type: propType },
    },
    SCALE_FRAME: {
      canonicalCategory: isTile ? 'dimetric_2_1' : isShrine ? 'vertical_monolith' : 'compact_boulder',
      parameters: { width: isTile ? 80 : isShrine ? 24 : 32, height: isTile ? 40 : isShrine ? 48 : 24 },
    },
    SILHOUETTE: {
      canonicalCategory: isTile ? 'irregular_flagstones' : isShrine ? 'carved_obelisk' : 'rounded_erratic',
      parameters: { stone_count: isTile ? 7 : 1 },
    },
    STRUCTURAL_SKELETON: {
      canonicalCategory: isTile ? 'interlocking_pavers' : isShrine ? 'chamfered_pylon' : 'asymmetric_dome',
      parameters: { segments: isTile ? 7 : 3 },
    },
    PROPORTION: {
      canonicalCategory: isShrine ? 'tall_slender' : 'ground_hugging',
      parameters: { aspect: isShrine ? { numerator: '1', denominator: '2' } : { numerator: '4', denominator: '3' } },
    },
    MASS_DISTRIBUTION: {
      canonicalCategory: isShrine ? 'top_tapered' : 'bottom_heavy',
      parameters: { base_spread_px: isShrine ? 18 : 28 },
    },
    NEGATIVE_SPACE: {
      canonicalCategory: isTile ? 'loam_mortar_joints' : 'solid_stone_mass',
      parameters: { joint_gap_px: isTile ? 2 : 0 },
    },
    WORLD_FOOTPRINT: {
      canonicalCategory: isTile ? 'tile_socket_path' : 'ground_anchored_prop',
      parameters: { blocks_path: isShrine },
    },
  };

  const slots = PROP_FORM_SLOTS.map((slotName, pos) => {
    const record = slotData[slotName];
    const digest256 = computeCanonicalDigest256(record);
    const blockHex = deriveSlotBlockHex(digest256, pos, 'form');
    return { slot: slotName, position: pos, blockHex, digest256, ...record };
  });

  const form64Hex = slots.map((s) => s.blockHex).join('');
  return { bank: 'form', form64Hex, slots };
}

export function buildPropRealizationWitness(propType = 'cobblestone_path') {
  const isShrine = propType.includes('shrine');

  const slotData = {
    PIXEL_DENSITY: {
      canonicalCategory: 'quantum_1x_discrete',
      parameters: { pixel_size: 1 },
    },
    EDGE_LANGUAGE: {
      canonicalCategory: isShrine ? 'weathered_chisel_edges' : 'pebbled_mortar_borders',
      parameters: { edge_weathering_pct: 15 },
    },
    CLUSTER_RHYTHM: {
      canonicalCategory: 'lichen_and_moss_encrustation',
      parameters: { lichen_density: 'moderate' },
    },
    VALUE_HIERARCHY: {
      canonicalCategory: 'stone_value_gradient',
      parameters: { value_bands: 8 },
    },
    MATERIAL_LANGUAGE: {
      canonicalCategory: isShrine ? 'sacred_carved_granite' : 'river_stone_and_earth',
      parameters: { primary_material: 'granite', secondary_material: 'moss' },
    },
    PALETTE_LOGIC: {
      canonicalCategory: isShrine ? 'ancient_shrine' : 'stone_trail',
      parameters: { theme: isShrine ? 'sanctuary' : 'wayfarer_path' },
    },
    LIGHT_RESPONSE: {
      canonicalCategory: 'upper_left_relief',
      parameters: { light_dir: [-65, -75], bevel_specular: true },
    },
    SURFACE_VARIATION: {
      canonicalCategory: isShrine ? 'pulsing_emerald_runes' : 'moss_fringe_in_crevices',
      parameters: { active_sigils: isShrine },
    },
  };

  const slots = PROP_REALIZATION_SLOTS.map((slotName, pos) => {
    const record = slotData[slotName];
    const digest256 = computeCanonicalDigest256(record);
    const blockHex = deriveSlotBlockHex(digest256, pos, 'realization');
    return { slot: slotName, position: pos, blockHex, digest256, ...record };
  });

  const realization64Hex = slots.map((s) => s.blockHex).join('');
  return { bank: 'realization', realization64Hex, slots };
}

export function createPropWitnessRecord(propType = 'cobblestone_path') {
  const form = buildPropFormWitness(propType);
  const realization = buildPropRealizationWitness(propType);
  const scd128Wire = `${form.form64Hex}${realization.realization64Hex}`;

  return {
    contract: 'SCD128-ASSET-RECORD',
    assetClass: 'forest_prop_element',
    propType,
    scd128Wire,
    form,
    realization,
  };
}

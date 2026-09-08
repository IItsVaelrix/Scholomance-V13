/**
 * Tutorial Forest — SCD128 Dual-Witness Pixel Lotus & Pond Specification
 *
 * Defines FORM64 + REALIZATION64 contracts for:
 * 1. Deep & Shore Lotus Water Tiles (80x40 isometric diamond)
 * 2. Floating Lilypad Clusters
 * 3. Sacred Lotus Flower Blooms & Buds (radiant bioluminescent petals)
 */

import {
  computeCanonicalDigest256,
  deriveSlotBlockHex,
} from '../../../../codex/core/pixelbrain/scholomium-ink/scd128/scd128.canonical.js';

export const LOTUS_FORM_SLOTS = [
  'ASSET_CLASS',
  'SCALE_FRAME',
  'SILHOUETTE',
  'STRUCTURAL_SKELETON',
  'PROPORTION',
  'MASS_DISTRIBUTION',
  'NEGATIVE_SPACE',
  'WORLD_FOOTPRINT',
];

export const LOTUS_REALIZATION_SLOTS = [
  'PIXEL_DENSITY',
  'EDGE_LANGUAGE',
  'CLUSTER_RHYTHM',
  'VALUE_HIERARCHY',
  'MATERIAL_LANGUAGE',
  'PALETTE_LOGIC',
  'LIGHT_RESPONSE',
  'SURFACE_VARIATION',
];

export const LOTUS_PALETTES = Object.freeze({
  sacred_spring_water: {
    w0: '#030B17', // abyssal trough
    w1: '#071830',
    w2: '#0D2B4F',
    w3: '#144173',
    w4: '#1C5D9E',
    w5: '#287FCE',
    w6: '#4EA6FA', // caustic wave crest
    w7: '#BAE6FD', // specular ripple glint
  },
  bioluminescent_lotus: {
    p0: '#4C0519', // deep shadow petal base
    p1: '#831843',
    p2: '#BE185D',
    p3: '#E11D48',
    p4: '#F43F5E',
    p5: '#FB7185',
    p6: '#FDA4AF', // translucent petal rim
    p7: '#FFFFFF', // incandescent apex
    core_dark: '#78350F',
    core_mid: '#D97706',
    core_hi: '#FDE047', // golden sacred anthers
    pad_dark: '#022C22',
    pad_mid: '#059669',
    pad_hi: '#34D399',
    pad_dew: '#E0F2FE',
  },
});

export function buildLotusFormWitness(assetSubtype = 'sacred_lotus_bloom') {
  const isWater = assetSubtype.startsWith('water');
  const isPad = assetSubtype.includes('lilypad');

  const slotData = {
    ASSET_CLASS: {
      canonicalCategory: 'lotus_pond_element',
      parameters: { subtype: assetSubtype },
    },
    SCALE_FRAME: {
      canonicalCategory: isWater ? 'dimetric_2_1' : 'lotus_prop_frame',
      parameters: { width: isWater ? 80 : 40, height: isWater ? 40 : 32 },
    },
    SILHOUETTE: {
      canonicalCategory: isWater ? 'diamond_concave_liquid' : isPad ? 'cleft_disk' : 'radiant_lotus_whorl',
      parameters: { petal_tiers: isWater ? 0 : 3, radial_symmetry: isWater ? 4 : 8 },
    },
    STRUCTURAL_SKELETON: {
      canonicalCategory: isWater ? 'wave_interference_mesh' : 'octagonal_receptacle_calyx',
      parameters: { petals_per_tier: isWater ? 0 : [4, 6, 8] },
    },
    PROPORTION: {
      canonicalCategory: isWater ? 'tile_span_full' : 'centered_bloom',
      parameters: { core_radius_px: isWater ? 0 : 4, bloom_span_px: isWater ? 80 : 28 },
    },
    MASS_DISTRIBUTION: {
      canonicalCategory: isWater ? 'sunken_planar' : 'concentric_tiered_elevation',
      parameters: { elevation_offset: isWater ? -2 : 2 },
    },
    NEGATIVE_SPACE: {
      canonicalCategory: isWater ? 'liquid_continuum' : 'petal_interstices',
      parameters: { cleft_angle_deg: isPad ? 45 : 0 },
    },
    WORLD_FOOTPRINT: {
      canonicalCategory: isWater ? 'grid_socket_water' : 'buoyant_water_surface',
      parameters: { floats_on_water: true },
    },
  };

  const slots = LOTUS_FORM_SLOTS.map((slotName, pos) => {
    const record = slotData[slotName];
    const digest256 = computeCanonicalDigest256(record);
    const blockHex = deriveSlotBlockHex(digest256, pos, 'form');
    return { slot: slotName, position: pos, blockHex, digest256, ...record };
  });

  const form64Hex = slots.map((s) => s.blockHex).join('');
  return { bank: 'form', form64Hex, slots };
}

export function buildLotusRealizationWitness(assetSubtype = 'sacred_lotus_bloom') {
  const isWater = assetSubtype.startsWith('water');

  const slotData = {
    PIXEL_DENSITY: {
      canonicalCategory: 'quantum_1x_discrete',
      parameters: { pixel_size: 1, raster_policy: 'midpoint_exact' },
    },
    EDGE_LANGUAGE: {
      canonicalCategory: isWater ? 'flowing_caustic_crests' : 'tapered_petal_tips',
      parameters: { stipple: 'bayer_2x2', rim_light: true },
    },
    CLUSTER_RHYTHM: {
      canonicalCategory: isWater ? 'sinusoidal_liquid_bands' : 'radiant_anther_corona',
      parameters: { pulsation_cycles: 60 },
    },
    VALUE_HIERARCHY: {
      canonicalCategory: '8_stop_specular_ramp',
      parameters: { color_stops: 8, glow_intensity: isWater ? 30 : 85 },
    },
    MATERIAL_LANGUAGE: {
      canonicalCategory: isWater ? 'crystal_thaumaturgic_water' : 'bioluminescent_lotus_velvet',
      parameters: { translucency_pct: isWater ? 40 : 25 },
    },
    PALETTE_LOGIC: {
      canonicalCategory: isWater ? 'sacred_spring_water' : 'bioluminescent_lotus',
      parameters: { primary_hue: isWater ? 'cyan_sapphire' : 'magenta_pearl_gold' },
    },
    LIGHT_RESPONSE: {
      canonicalCategory: 'ambient_self_illuminating',
      parameters: { core_emission: isWater ? 15 : 70, directional_bias: [-65, -75] },
    },
    SURFACE_VARIATION: {
      canonicalCategory: 'caustic_glints_and_dewdrops',
      parameters: { specular_rate_pct: 8 },
    },
  };

  const slots = LOTUS_REALIZATION_SLOTS.map((slotName, pos) => {
    const record = slotData[slotName];
    const digest256 = computeCanonicalDigest256(record);
    const blockHex = deriveSlotBlockHex(digest256, pos, 'realization');
    return { slot: slotName, position: pos, blockHex, digest256, ...record };
  });

  const realization64Hex = slots.map((s) => s.blockHex).join('');
  return { bank: 'realization', realization64Hex, slots };
}

export function createLotusWitnessRecord(assetSubtype = 'sacred_lotus_bloom') {
  const form = buildLotusFormWitness(assetSubtype);
  const realization = buildLotusRealizationWitness(assetSubtype);
  const scd128Wire = `${form.form64Hex}${realization.realization64Hex}`;

  return {
    contract: 'SCD128-ASSET-RECORD',
    assetClass: 'pixel_lotus_element',
    assetSubtype,
    scd128Wire,
    form,
    realization,
  };
}

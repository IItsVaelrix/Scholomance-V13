/**
 * Tile Forge — SCD128 Dual-Witness Tile Specification
 *
 * Defines strictly isolated FORM64 and REALIZATION64 witness contracts for
 * Tile Forge procedural isometric chunks, sockets, and terrain families.
 *
 * Adheres to:
 * - Anti-Vector Invariant: Discrete 1x cells, integer rasterization.
 * - 2:1 Dimetric standard footprint: 80x40 diamond.
 * - Bank Isolation: FORM64 contains zero color/palette data; REALIZATION64 contains zero geometry/mesh data.
 * - SCD128 Law: 128 uppercase hex characters (64 FORM64 + 64 REALIZATION64).
 */

import {
  computeCanonicalDigest256,
  deriveSlotBlockHex,
} from '../scholomium-ink/scd128/scd128.canonical.js';

export const TILE_FORGE_FORM_SLOTS = [
  'PROJECTION_SPEC',
  'TOPOLOGY_PRIMITIVE',
  'ELEVATION_METRIC',
  'SOCKET_NORTH',
  'SOCKET_EAST',
  'SOCKET_SOUTH',
  'SOCKET_WEST',
  'TERRAIN_TYPE',
];

export const TILE_FORGE_REALIZATION_SLOTS = [
  'BIOME_PALETTE',
  'CELLULAR_SEED',
  'SURFACE_VARIATION',
  'LIGHT_RESPONSE',
  'DITHER_POLICY',
  'STRATIFICATION',
  'MATERIAL_OCTAVE',
  'REALIZED_CELL_COUNT',
];

export const TILE_FORGE_BIOME_PALETTES = Object.freeze({
  void_forest: {
    name: 'Void Forest Crystalline',
    c7: '#C084FC', // glowing lilac blade tips
    c6: '#9333EA', // vibrant cosmic purple highlight
    c5: '#6B21A8', // rich purple midtone
    c4: '#4C1D95', // deep indigo body
    c3: '#2E1065', // shadowed base
    c2: '#1E1B4B', // dark root soil
    c1: '#0F172A', // obsidian humus border
    c0: '#020617', // void occlusion
    cliff_hi: '#64748B',
    cliff_mid: '#334155',
    cliff_dark: '#0F172A',
    crystal_glow: '#38BDF8', // luminous cyan
    flower_accent: '#F43F5E', // bio-luminescent rose
  },
  void_ice: {
    name: 'Void Ice Prismatic Glade',
    c7: '#E0F2FE', // specular frost sheen
    c6: '#BAE6FD', // crystalline ice highlight
    c5: '#38BDF8', // prismatic cerulean midtone
    c4: '#0284C7', // deep glacial body
    c3: '#0369A1', // sub-surface refraction
    c2: '#0C4A6E', // shadowed crevasse
    c1: '#082F49', // obsidian bedrock
    c0: '#031726', // abyss occlusion
    cliff_hi: '#7DD3FC',
    cliff_mid: '#0284C7',
    cliff_dark: '#082F49',
    crystal_glow: '#A855F7', // void violet
    flower_accent: '#FDE047', // star crystal
  },
  verdant_glade: {
    name: 'Verdant Forest Glade',
    c7: '#BEF264',
    c6: '#84CC16',
    c5: '#44A832',
    c4: '#288828',
    c3: '#186424',
    c2: '#0E481C',
    c1: '#0A3014',
    c0: '#04180A',
    cliff_hi: '#78716C',
    cliff_mid: '#44403C',
    cliff_dark: '#1C1917',
    crystal_glow: '#10B981',
    flower_accent: '#FDE047',
  },
  cave_chasm: {
    name: 'Subterranean Chasm',
    c7: '#E2E8F0', // chiseled quartz facet
    c6: '#94A3B8', // stone flagstone highlight
    c5: '#64748B', // flagstone midtone
    c4: '#475569', // slate body
    c3: '#334155', // shadowed mortar
    c2: '#1E293B', // deep stone trench
    c1: '#0F172A', // cavern bedrock
    c0: '#020617', // pitch-black chasm
    cliff_hi: '#94A3B8',
    cliff_mid: '#475569',
    cliff_dark: '#0F172A',
    crystal_glow: '#22D3EE', // cyan subterranean lichen
    flower_accent: '#FB923C', // cave fungus spore
  },
  verdant_dofus: {
    name: 'Verdant Dofus Meadow',
    c7: '#F4FEA2',
    c6: '#DDF46A',
    c5: '#C2E048',
    c4: '#A8C838',
    c3: '#8DA829',
    c2: '#65821A',
    c1: '#425810',
    c0: '#2A3A0A',
    cliff_hi: '#9EA094',
    cliff_mid: '#6E7068',
    cliff_dark: '#2C3028',
    crystal_glow: '#BEF264',
    flower_accent: '#FDE047',
  },
  autumnal_gold: {
    name: 'Autumnal Golden Forest',
    c7: '#FEF08A',
    c6: '#FBBF24',
    c5: '#F59E0B',
    c4: '#D97706',
    c3: '#B45309',
    c2: '#92400E',
    c1: '#78350F',
    c0: '#451A03',
    cliff_hi: '#A1A1AA',
    cliff_mid: '#52525B',
    cliff_dark: '#27272A',
    crystal_glow: '#F59E0B',
    flower_accent: '#EF4444',
  },
  scholomance_sunlit_glade: {
    name: 'Scholomance Sunlit Glade',
    c7: '#E8F596', // sun-drenched blade tip
    c6: '#B9E043', // sunlit meadow
    c5: '#87BA2A', // vibrant grass body
    c4: '#5B8C1D', // midtone pasture
    c3: '#3C6415', // shadowed verge
    c2: '#26440F', // deep turf shade
    c1: '#162D0A', // rich humus border
    c0: '#0B1A05', // root-level occlusion
    cliff_hi: '#9CA3AF',
    cliff_mid: '#6B7280',
    cliff_dark: '#374151',
    crystal_glow: '#22D3EE', // cyan lotus
    flower_accent: '#F472B6', // lotus blossom
  },
});

/**
 * Builds FORM64 specification for a Tile Forge tile.
 */
export function buildTileForgeFormWitness(args = {}) {
  const width = args.width || 80;
  const height = args.height || 40;
  const hasCliff = Boolean(args.hasCliff);
  const cliffDepth = args.cliffDepth || 16;
  const elevation = args.elevation || 0;
  const terrainType = args.terrainType || 'void_forest_grass';
  const socketN = args.socketN || 'socket_open';
  const socketE = args.socketE || 'socket_open';
  const socketS = args.socketS || 'socket_open';
  const socketW = args.socketW || 'socket_open';

  const groundDepth = args.groundDepth !== undefined ? args.groundDepth : (args.hasGround ? (args.cliffDepth || 16) : (hasCliff ? cliffDepth : 0));
  const footprintW = args.footprintWidthTiles || 1;
  const footprintH = args.footprintHeightTiles || 1;

  const slotData = {
    PROJECTION_SPEC: {
      canonicalCategory: 'dimetric_2_to_1',
      parameters: { width, height, ratio: '2:1', footprint_tiles: [footprintW, footprintH] },
    },
    TOPOLOGY_PRIMITIVE: {
      canonicalCategory: hasCliff || groundDepth > 0 ? 'extruded_cliff_skirt' : 'flat_diamond_plane',
      parameters: { cliff_depth_px: cliffDepth, ground_depth_px: groundDepth, rim_outline: args.isRim ? 1 : 0 },
    },
    ELEVATION_METRIC: {
      canonicalCategory: `tier_${elevation}`,
      parameters: { z_step: elevation },
    },
    SOCKET_NORTH: {
      canonicalCategory: socketN,
      parameters: { socket_id: args.socketIdN || 0 },
    },
    SOCKET_EAST: {
      canonicalCategory: socketE,
      parameters: { socket_id: args.socketIdE || 0 },
    },
    SOCKET_SOUTH: {
      canonicalCategory: socketS,
      parameters: { socket_id: args.socketIdS || 0 },
    },
    SOCKET_WEST: {
      canonicalCategory: socketW,
      parameters: { socket_id: args.socketIdW || 0 },
    },
    TERRAIN_TYPE: {
      canonicalCategory: terrainType,
      parameters: { walkable: args.walkable !== false ? 1 : 0 },
    },
  };

  const slots = TILE_FORGE_FORM_SLOTS.map((slotName, pos) => {
    const record = slotData[slotName];
    const digest256 = computeCanonicalDigest256(record);
    const blockHex = deriveSlotBlockHex(digest256, pos, 'form');
    return { slot: slotName, position: pos, blockHex, digest256, ...record };
  });

  const form64Hex = slots.map((s) => s.blockHex).join('');
  return { bank: 'form', form64Hex, slots };
}

/**
 * Builds REALIZATION64 specification for a Tile Forge tile.
 */
export function buildTileForgeRealizationWitness(args = {}) {
  const biomeKey = args.biome || 'void_forest';
  const palette = TILE_FORGE_BIOME_PALETTES[biomeKey] || TILE_FORGE_BIOME_PALETTES.void_forest;
  const seed = args.seed || 4242;
  const cellCount = args.cellCount || (args.hasCliff || args.hasGround ? 2240 : 1600);
  const pixelDigest = args.pixelDigest || (args.pixels ? computeCanonicalDigest256(args.pixels) : null);

  const slotData = {
    BIOME_PALETTE: {
      canonicalCategory: biomeKey,
      parameters: { key_tones: 8, base_hex: palette.c4, shadow_hex: palette.c0 },
    },
    CELLULAR_SEED: {
      canonicalCategory: 'pcg32_deterministic',
      parameters: { seed },
    },
    SURFACE_VARIATION: {
      canonicalCategory: args.variation || 'standard',
      parameters: { density_pct: args.variationDensity || 15 },
    },
    LIGHT_RESPONSE: {
      canonicalCategory: 'upper_left_directional',
      parameters: { light_dir: [-65, -75], ambient_fill: 30 },
    },
    DITHER_POLICY: {
      canonicalCategory: 'bayer_2x2_ordered',
      parameters: { matrix_size: 2 },
    },
    STRATIFICATION: {
      canonicalCategory: args.stratification || 'columnar_basalt',
      parameters: { strata_bands: 4 },
    },
    MATERIAL_OCTAVE: {
      canonicalCategory: args.material || 'crystalline_obsidian',
      parameters: { specularity: 75, roughness: 40 },
    },
    REALIZED_CELL_COUNT: {
      canonicalCategory: 'discrete_1x_cells',
      parameters: pixelDigest ? { total_cells: cellCount, pixel_digest: pixelDigest } : { total_cells: cellCount },
    },
  };

  const slots = TILE_FORGE_REALIZATION_SLOTS.map((slotName, pos) => {
    const record = slotData[slotName];
    const digest256 = computeCanonicalDigest256(record);
    const blockHex = deriveSlotBlockHex(digest256, pos, 'realization');
    return { slot: slotName, position: pos, blockHex, digest256, ...record };
  });

  const realization64Hex = slots.map((s) => s.blockHex).join('');
  return { bank: 'realization', realization64Hex, slots };
}

/**
 * Creates a complete SCD128 Dual-Witness Record for Tile Forge.
 */
export function createTileForgeWitnessRecord(formArgs = {}, realizationArgs = {}) {
  const form = buildTileForgeFormWitness(formArgs);
  const realization = buildTileForgeRealizationWitness(realizationArgs);
  const scd128Wire = `${form.form64Hex}${realization.realization64Hex}`;

  return {
    contract: 'SCD128-ASSET-RECORD',
    assetClass: 'tile_forge_isometric_tile',
    scd128Wire,
    form,
    realization,
  };
}

/**
 * Verifies that a witness string matches freshly computed arguments.
 * Detects stale comment witnesses or mismatched payloads.
 */
export function verifyTileForgeWitness(scd128Wire, formArgs = {}, realizationArgs = {}) {
  const fresh = createTileForgeWitnessRecord(formArgs, realizationArgs);
  const isMatch = scd128Wire === fresh.scd128Wire;
  return {
    valid: isMatch,
    expected: fresh.scd128Wire,
    received: scd128Wire,
    formMatch: scd128Wire ? scd128Wire.slice(0, 64) === fresh.form.form64Hex : false,
    realizationMatch: scd128Wire ? scd128Wire.slice(64, 128) === fresh.realization.realization64Hex : false,
  };
}

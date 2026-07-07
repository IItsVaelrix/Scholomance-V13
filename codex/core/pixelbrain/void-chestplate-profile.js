/**
 * Void Chestplate specific data for the Edit Compiler
 * Parts, anchors, masks, polish profile.
 * Used for rehydration, constraints, semantic edits.
 */

export const VOID_CHESTPLATE_PARTS = [
  'left_pauldron_shell',
  'right_pauldron_shell',
  'left_pauldron_trim',
  'right_pauldron_trim',
  'body_trim',
  'bottom_trim',
  'collar_bridge',
  'upper_chest_panel',
  'left_void_panel',
  'right_void_panel',
  'sternum_core_socket',
  'core_crystal',
  'waist_guard',
  'lower_tab_crystal',
  'ornament_sockets',
  'outer_shadow',
];

export const VOID_CHESTPLATE_ANCHORS = {
  neckCenter: { x: 32, y: 14 },
  collarLeft: { x: 24, y: 13 },
  collarRight: { x: 40, y: 13 },
  shoulderLeftTip: { x: 2, y: 8 },
  shoulderRightTip: { x: 62, y: 8 },
  pauldronLeftPeak: { x: 10, y: 4 },
  pauldronRightPeak: { x: 54, y: 4 },
  sternumCore: { x: 32, y: 27 },
  waistCenter: { x: 32, y: 41 },
  lowerCrystal: { x: 32, y: 39 },
  leftPanelCenter: { x: 23, y: 31 },
  rightPanelCenter: { x: 41, y: 31 },
};

export const VOID_CHESTPLATE_MASKS = {
  silhouette: 'all non-transparent final cells',
  outerTrim: 'gold edge cells',
  pauldronShells: 'blue shoulder shells',
  innerVoidPanels: 'black / deep purple chest fields',
  coreCrystal: 'central lavender crystal',
  socketGlow: 'purple cells around core',
  ornaments: 'small violet cross marks',
  lowerGuard: 'bottom torso structure',
};

export const VAELRIX_VOID_ARMOR_POLISH_PROFILE = {
  contract: 'PB-POLISH-PROFILE-v1',
  version: '1.1.0',
  preferences: {
    shoulderSilhouette: {
      widerOuterTips: true,
      steppedHornProfile: true,
      heavyGoldOuterTrim: true,
    },
    coreDesign: {
      brightCentralCrystal: true,
      socketMustBeReadable: true,
      verticalLightColumn: true,
    },
    contrast: {
      darkInteriorPanels: true,
      highValueCore: true,
      trimSeparatesSilhouette: true,
    },
    motifs: {
      violetCrossSockets: true,
      sparseSymmetricOrnaments: true,
    },
    // Algorithmic tuning responses (2026-06):
    noise: {
      noOrphanPixels: true,          // cleanup pass merges isolated dots unless protected geometric motifs
      clusteringConstraint: true,
    },
    innerGeometry: {
      structuralRigidity: true,      // same edge rules for inner dark panels as outer silhouette; fight blobbiness
      straightBoundariesBelowCollar: true,
    },
    volume: {
      dropShadows: true,             // blue pauldrons/collar cast onto purple fabric for 3D read (not flat)
      explicitOcclusion: true,
    },
  },
};

export const VOID_CHESTPLATE_EXACT_PALETTE = Object.freeze([
  '#01030A',
  '#07091A',
  '#111633',
  '#20284A',
  '#465178',
  '#000004',
  '#05050D',
  '#0E1020',
  '#191C2D',
  '#A58A2D',
  '#CEB65A',
  '#E8DA91',
  '#000008',
  '#170A3A',
  '#32106D',
  '#6B35B8',
  '#A17AE0',
  '#E5D7FF',
  '#3B116B',
  '#6D28A8',
  '#A66BE0',
  '#160A54',
  '#3920A0',
  '#7463E8',
  '#B8B0FF',
  '#030308',
  '#0B0B14',
  '#16161F',
]);

import { resolveRole, CanonicalRoles } from './semantic-registry.js';

// Simple rehydrator stub: assigns part based on region heuristics for the chestplate
export function rehydrateVoidChestplateCells(coordinates, options = {}) {
  const w = options.width || 64;
  const _h = options.height || 80;
  const cx = w / 2;

  return coordinates.map(cell => {
    let partId = cell.partId || 'unknown';
    let material = cell.material || 'voidsteel';
    let role = resolveRole(cell) || cell.role || CanonicalRoles.BODY;

    const { x, y, color } = cell;

    // Very rough region inference for this specific asset
    if (y < 10 && Math.abs(x - cx) > 15) {
      partId = x < cx ? 'left_pauldron_shell' : 'right_pauldron_shell';
      role = 'shell';
    } else if (y < 12 && Math.abs(x - cx) > 12) {
      partId = x < cx ? 'left_pauldron_trim' : 'right_pauldron_trim';
      material = 'void_gold';
      role = 'trim';
    } else if (Math.abs(x - cx) < 4 && y > 24 && y < 32) {
      partId = 'core_crystal';
      material = 'void_amethyst';
      role = 'core';
    } else if (Math.abs(x - cx) < 6 && y > 20 && y < 35) {
      partId = 'sternum_core_socket';
      role = 'socket';
    } else if (Math.abs(x - cx) > 8 && y > 25 && y < 38) {
      partId = x < cx ? 'left_void_panel' : 'right_void_panel';
      material = 'voidsteel';
      role = 'panel';
    } else if (y > 38) {
      partId = 'waist_guard';
      role = 'guard';
    }

    if (color && color.toLowerCase().includes('a') || color === '#AA8B22') {
      material = 'void_gold';
    }

    return {
      ...cell,
      partId,
      material,
      role,
    };
  });
}

export { VOID_CHESTPLATE_PARTS as REQUIRED_PARTS };

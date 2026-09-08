/**
 * Tutorial Forest — Biome Layout & Zoning Model
 *
 * Defines the spatial layout of the 24x24 tutorial forest with high cohesion
 * and variance:
 * - Zone 1: Sunlit Glade (Player spawn glade, clover carpets, sunlit tufts)
 * - Zone 2: Wayfarer Trail (Ancient chiselled flagstones leading into glowing runic pavers)
 * - Zone 3: Sacred Lotus Pond (Deep spring, autotiled shorelines, reed clusters, lotus blooms)
 * - Zone 4: Ancient Dense Grove (Ancient oaks, root networks, hollow fairy stump with glowing fungi)
 * - Zone 5: Sanctuary Plateau (Elevated cliff tier with ancient dolmen, crystal tree, and waymarker obelisk)
 */

export const GRID_SIZE = 24;
export const TILE_W = 80;
export const TILE_H = 40;

export const PLAYER_SPAWN = { tx: 6, ty: 17 };
export const SHRINE_POS = { tx: 19, ty: 5 };
export const DOLMEN_POS = { tx: 18, ty: 7 };
export const FAIRY_STUMP_POS = { tx: 5, ty: 8 };
export const FALLEN_LOG_POS = { tx: 9, ty: 16 };
export const LOTUS_BASIN_POS = { tx: 11, ty: 6 };
export const STONE_WELL_POS = { tx: 8, ty: 7 };
export const TIMBER_FENCE_POS = { tx: 6, ty: 6 };
export const SUNFLOWER_PATCH_POS = { tx: 8, ty: 5 };

/**
 * Checks if a coordinate belongs to the winding pathway.
 */
function isPathCoordinate(tx, ty) {
  const pathNodes = [
    { tx: 6, ty: 17 },
    { tx: 6, ty: 16 },
    { tx: 7, ty: 15 },
    { tx: 8, ty: 14 },
    { tx: 9, ty: 13 },
    { tx: 10, ty: 13 },
    { tx: 10, ty: 12 },
    { tx: 10, ty: 11 },
    // Branch toward well & farmstead
    { tx: 9, ty: 11 },
    { tx: 8, ty: 10 },
    { tx: 8, ty: 9 },
    { tx: 8, ty: 8 },
    // Trail to sacred pond & sanctuary
    { tx: 11, ty: 11 },
    { tx: 12, ty: 11 },
    { tx: 13, ty: 11 },
    { tx: 14, ty: 11 },
    { tx: 15, ty: 11 },
    { tx: 16, ty: 10 },
    { tx: 16, ty: 9 },
    { tx: 17, ty: 8 },
    { tx: 18, ty: 7 },
    { tx: 19, ty: 6 },
    { tx: 19, ty: 5 },
  ];

  return pathNodes.some((p) => p.tx === tx && p.ty === ty);
}

/**
 * Computes the biome zone and baseline terrain for a grid coordinate.
 */
export function evaluateCoordinateBiome(tx, ty) {
  // 1. Boundary Framing (Outer 2-tile border is tranquil deep meadow perimeter)
  if (tx <= 1 || ty <= 1 || tx >= GRID_SIZE - 2 || ty >= GRID_SIZE - 2) {
    return {
      zone: 'perimeter_canopy',
      terrain: (tx + ty) % 2 === 0 ? 'grass_deep_sward' : 'grass_ancient_roots',
      elevation: 0,
      walkable: false,
      treeDensity: 'heroic_framing',
    };
  }

  // 2. Sanctuary Plateau (Elevated +1 tier in North-East: tx 17..21, ty 3..7)
  if (tx >= 17 && tx <= 21 && ty >= 3 && ty <= 7) {
    const isEdge = tx === 17 || ty === 7;
    let cliffType = 'cliff_mossy_granite';
    if (tx === 17 && ty === 5) cliffType = 'cliff_root_curtain';
    if (tx === 17 && ty === 6) cliffType = 'cliff_waterfall_basin';

    const isRunicWay = (tx === 17 && ty === 7) || (tx === 18 && ty === 7) || (tx === 19 && ty === 6) || (tx === 19 && ty === 5);

    return {
      zone: 'sanctuary_plateau',
      terrain: isRunicWay ? 'path_runic_way' : 'grass_clover_dappled',
      elevation: 1,
      hasCliff: isEdge,
      cliffVariant: cliffType,
      walkable: !(tx === SHRINE_POS.tx && ty === SHRINE_POS.ty) && !(tx === DOLMEN_POS.tx && ty === DOLMEN_POS.ty),
      treeDensity: 'sparse',
    };
  }

  // 3. Sacred Lotus Pond (North-Central: tx 11..16, ty 5..10)
  if (tx >= 11 && tx <= 16 && ty >= 5 && ty <= 10) {
    // Stepping stones
    const isSteppingStone = (tx === 11 && ty === 7) || (tx === 16 && ty === 8);
    if (isSteppingStone) {
      return {
        zone: 'lotus_pond_stepping_stone',
        terrain: 'path_ancient_flagstone',
        elevation: 0,
        walkable: true,
        treeDensity: 'none',
      };
    }

    const isShore = (tx === 11 || tx === 16 || ty === 5 || ty === 10);
    const isReed = isShore && ((tx + ty) % 2 === 1);
    const isCenter = (tx === 13 || tx === 14) && (ty === 7 || ty === 8);

    return {
      zone: 'sacred_lotus_pond',
      terrain: isReed ? 'water_reed_cluster' : isShore ? 'water_shore_transition' : 'water_deep_spring',
      elevation: 0,
      walkable: false,
      hasLotus: isCenter,
      hasLilypad: !isCenter && (tx + ty) % 2 === 0,
      treeDensity: 'none',
    };
  }

  // 4. Wayfarer Trail (Winding curve connecting spawn to pond & sanctuary)
  const isTrail = isPathCoordinate(tx, ty);
  if (isTrail) {
    const isRunic = (tx >= 17 && ty <= 8);
    const isOvergrown = (tx === 9 && ty === 13) || (tx === 10 && ty === 13);
    return {
      zone: 'wayfarer_trail',
      terrain: isRunic ? 'path_runic_way' : isOvergrown ? 'path_overgrown' : 'path_ancient_flagstone',
      elevation: 0,
      walkable: true,
      treeDensity: 'none',
    };
  }

  // 5. Sunlit Glade (Player spawn clearing)
  const distToSpawn = Math.hypot(tx - PLAYER_SPAWN.tx, ty - PLAYER_SPAWN.ty);
  if (distToSpawn <= 4.2) {
    return {
      zone: 'sunlit_glade',
      terrain: distToSpawn < 2.2 ? 'grass_clover_dappled' : (tx + ty) % 2 === 0 ? 'grass_sunlit_tufts' : 'grass_deep_sward',
      elevation: 0,
      walkable: true,
      treeDensity: distToSpawn < 2 ? 'none' : 'sapling_only',
    };
  }

  // 6. Western Rustic Farmstead & Ancient Grove (North-West)
  if (tx <= 8 && ty <= 10) {
    const isFarmProp = (tx === STONE_WELL_POS.tx && ty === STONE_WELL_POS.ty) ||
                       (tx === TIMBER_FENCE_POS.tx && ty === TIMBER_FENCE_POS.ty) ||
                       (tx === SUNFLOWER_PATCH_POS.tx && ty === SUNFLOWER_PATCH_POS.ty);
    return {
      zone: 'rustic_farmstead_grove',
      terrain: (tx + ty) % 2 === 0 ? 'grass_ancient_roots' : 'grass_deep_sward',
      elevation: 0,
      walkable: !(tx === FAIRY_STUMP_POS.tx && ty === FAIRY_STUMP_POS.ty) && !isFarmProp,
      treeDensity: 'heroic_framing',
    };
  }

  // 7. General Open Meadow Forest Floor (Clean, restful negative space)
  const grassVariants = ['grass_deep_sward', 'grass_clover_dappled', 'grass_sunlit_tufts', 'grass_deep_sward'];
  const varIdx = (tx * 3 + ty * 7) % grassVariants.length;

  return {
    zone: 'open_meadow',
    terrain: grassVariants[varIdx],
    elevation: 0,
    walkable: true,
    treeDensity: 'none',
  };
}

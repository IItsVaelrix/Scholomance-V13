import {
  generatePolarisFlatForestState,
  POLARIS_FOREST_SEED,
} from './polarisForestPipeline.js';
import { POLARIS_FOREST_MAP_ID, WORLD_MAPS } from './worldMapRegistry.js';

/** Scene target registry + tactical board source id for Polaris. */
export const POLARIS_SCENE_ID = POLARIS_FOREST_MAP_ID;

export const POLARIS_WORLD_REGION = WORLD_MAPS[POLARIS_FOREST_MAP_ID].worldRegion;

/** Player spawn in the south clearing of the forest map. */
export const POLARIS_SPAWN_TILE = Object.freeze({ ...WORLD_MAPS[POLARIS_FOREST_MAP_ID].spawnTile });

export const POLARIS_GRID_SIZE = WORLD_MAPS[POLARIS_FOREST_MAP_ID].gridSize;

export { POLARIS_FOREST_SEED, generatePolarisFlatForestState };

/**
 * @param {number} [gridSize]
 */
export function getDefaultTreePlacements(gridSize = POLARIS_GRID_SIZE) {
  return generatePolarisFlatForestState({
    gridSize,
    seed: POLARIS_FOREST_SEED,
    spawnTile: POLARIS_SPAWN_TILE,
  }).trees;
}

/**
 * @param {{ toIso: (tx: number, ty: number) => { x: number, y: number }, plateauZ: number }} metrics
 * @param {ReadonlyArray<{ tx: number, ty: number, scale?: number, phase?: number, lSystemSeed?: number, leanX?: number, leanY?: number, layer?: string }>} placements
 */
export function resolveTreeWorldPositions(metrics, placements) {
  return placements.map((placement) => {
    const iso = metrics.toIso(placement.tx, placement.ty);
    return {
      ...placement,
      worldX: iso.x,
      worldY: iso.y - metrics.plateauZ,
    };
  });
}
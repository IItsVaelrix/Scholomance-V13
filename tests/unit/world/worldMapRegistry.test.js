import { describe, expect, it } from 'vitest';
import {
  POLARIS_FOREST_MAP_ID,
  resolveWorldMap,
  TUTORIAL_ISLAND_MAP_ID,
  TUTORIAL_TO_POLARIS_CONNECTION,
  WORLD_MAPS,
} from '../../../src/game/world/worldMapRegistry.js';

describe('worldMapRegistry', () => {
  it('registers tutorial island and polaris as separate maps', () => {
    expect(WORLD_MAPS[TUTORIAL_ISLAND_MAP_ID].sceneKey).toBe('CombatArenaScene');
    expect(WORLD_MAPS[POLARIS_FOREST_MAP_ID].sceneKey).toBe('PolarisForestScene');
    expect(WORLD_MAPS[TUTORIAL_ISLAND_MAP_ID].gridSize).toBe(9);
    expect(WORLD_MAPS[POLARIS_FOREST_MAP_ID].gridSize).toBe(13);
  });

  it('links the cleared portal on tutorial island to polaris', () => {
    expect(TUTORIAL_TO_POLARIS_CONNECTION.from).toBe(TUTORIAL_ISLAND_MAP_ID);
    expect(TUTORIAL_TO_POLARIS_CONNECTION.to).toBe(POLARIS_FOREST_MAP_ID);
  });

  it('resolves map metadata by id', () => {
    expect(resolveWorldMap(POLARIS_FOREST_MAP_ID)?.spawnTile).toEqual({ tx: 6, ty: 10 });
  });
});
import { describe, expect, it } from 'vitest';
import {
  getDefaultTreePlacements,
  POLARIS_GRID_SIZE,
  POLARIS_SPAWN_TILE,
  resolveTreeWorldPositions,
} from '../../../src/game/world/polarisForestConfig.js';

describe('polarisForestConfig', () => {
  it('uses a 13x13 forest grid separate from the tutorial island', () => {
    expect(POLARIS_GRID_SIZE).toBe(13);
  });

  it('generates at least twelve procedural tuning-fork trees on flat ground', () => {
    const trees = getDefaultTreePlacements(POLARIS_GRID_SIZE);
    expect(trees.length).toBeGreaterThanOrEqual(12);
  });

  it('resolves tree world positions from grid metrics', () => {
    const metrics = {
      plateauZ: 48,
      toIso: (tx, ty) => ({ x: tx * 10, y: ty * 5 }),
    };
    const placements = getDefaultTreePlacements(POLARIS_GRID_SIZE);
    const positions = resolveTreeWorldPositions(metrics, placements);
    expect(positions[0].worldX).toBeDefined();
    expect(positions[0].worldY).toBe(metrics.toIso(placements[0].tx, placements[0].ty).y - 48);
  });

  it('spawns player in the south clearing of the forest map', () => {
    expect(POLARIS_SPAWN_TILE.ty).toBeGreaterThanOrEqual(9);
    expect(POLARIS_SPAWN_TILE.tx).toBe(Math.floor(POLARIS_GRID_SIZE / 2));
  });
});
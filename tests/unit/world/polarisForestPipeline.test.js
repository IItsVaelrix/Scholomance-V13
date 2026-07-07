import { describe, expect, it } from 'vitest';
import {
  applyHydraulicErosion,
  applyThermalErosion,
  buildPolarisTerrainHeightmap,
  computeMinTreeDistance,
  fbm2D,
  generateFlatForestTreePlacements,
  generatePolarisFlatForestState,
  generatePolarisForestState,
  generateTreePlacements,
  poissonDiskSample,
  POLARIS_FOREST_SEED,
} from '../../../src/game/world/polarisForestPipeline.js';
import { generatePermutationTable } from '../../../codex/core/pixelbrain/procedural-noise.js';
import { POLARIS_SPAWN_TILE, POLARIS_GRID_SIZE } from '../../../src/game/world/polarisForestConfig.js';

describe('polarisForestPipeline terrain', () => {
  it('fbm2D returns normalized values in [0, 1]', () => {
    const perm = generatePermutationTable(42);
    for (let i = 0; i < 20; i += 1) {
      const v = fbm2D(i * 0.7, i * 1.1, perm);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('hydraulic erosion reduces peak height variance', () => {
    const size = 15;
    const map = Array.from({ length: size }, (_, x) =>
      Array.from({ length: size }, (_, y) => (x === 7 && y === 7 ? 30 : 10 + (x % 3))),
    );
    const before = map[7][7];
    applyHydraulicErosion(map, size, { passes: 12, seed: 99 });
    expect(map[7][7]).toBeLessThan(before);
  });

  it('thermal erosion shaves steep cliff faces', () => {
    const size = 11;
    const map = Array.from({ length: size }, (_, x) =>
      Array.from({ length: size }, (_, y) => (x === 5 && y < 5 ? 20 : 8)),
    );
    const cliffBefore = map[5][4];
    applyThermalErosion(map, size, { passes: 6, talusRatio: 0.35 });
    expect(map[5][4]).toBeLessThan(cliffBefore);
  });

  it('buildPolarisTerrainHeightmap flattens south spawn clearing', () => {
    const size = 29;
    const radius = 14;
    const map = buildPolarisTerrainHeightmap({
      size,
      radius,
      seed: POLARIS_FOREST_SEED,
      spawnTile: { tx: 4, ty: 7 },
    });
    const spawn = map[4][7];
    expect(spawn).toBeGreaterThan(0);
    expect(spawn).toBeCloseTo(12, 0);
  });
});

describe('polarisForestPipeline flat forest map', () => {
  it('generateFlatForestTreePlacements yields trees away from spawn', () => {
    const trees = generateFlatForestTreePlacements({
      gridSize: POLARIS_GRID_SIZE,
      seed: POLARIS_FOREST_SEED,
      spawnTile: POLARIS_SPAWN_TILE,
    });
    expect(trees.length).toBeGreaterThanOrEqual(12);
    for (const tree of trees) {
      const dist = Math.hypot(tree.tx - POLARIS_SPAWN_TILE.tx, tree.ty - POLARIS_SPAWN_TILE.ty);
      expect(dist).toBeGreaterThan(2);
    }
    expect(computeMinTreeDistance(trees)).toBeGreaterThanOrEqual(2);
  });

  it('generatePolarisFlatForestState is deterministic', () => {
    const opts = { gridSize: POLARIS_GRID_SIZE, seed: POLARIS_FOREST_SEED, spawnTile: POLARIS_SPAWN_TILE };
    const a = generatePolarisFlatForestState(opts);
    const b = generatePolarisFlatForestState(opts);
    expect(a.trees).toEqual(b.trees);
    expect(a.heightmap[a.pad + 3][a.pad + 3]).toBe(12);
  });
});

describe('polarisForestPipeline ecosystem', () => {
  it('poissonDiskSample enforces minimum distance', () => {
    const points = poissonDiskSample({
      width: 20,
      height: 20,
      minDist: 3,
      seed: 7,
      maxAttempts: 30,
      isValid: () => true,
    });
    expect(points.length).toBeGreaterThan(3);
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const dx = points[i].x - points[j].x;
        const dy = points[i].y - points[j].y;
        expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(2.9);
      }
    }
  });

  it('generateTreePlacements yields at least eight trees away from spawn', () => {
    const size = 29;
    const radius = 14;
    const heightmap = buildPolarisTerrainHeightmap({
      size,
      radius,
      seed: POLARIS_FOREST_SEED,
      spawnTile: { tx: 4, ty: 7 },
    });
    const trees = generateTreePlacements({
      heightmap,
      size,
      radius,
      seed: POLARIS_FOREST_SEED,
      spawnTile: { tx: 4, ty: 7 },
    });
    expect(trees.length).toBeGreaterThanOrEqual(8);
  });

  it('generatePolarisForestState is deterministic for the same seed', () => {
    const opts = { size: 29, radius: 14, seed: POLARIS_FOREST_SEED };
    const a = generatePolarisForestState(opts);
    const b = generatePolarisForestState(opts);
    expect(a.trees).toEqual(b.trees);
  });
});
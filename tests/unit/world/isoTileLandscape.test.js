import { describe, expect, it } from 'vitest';
import {
  GRASS_VARIANT_IDS,
  WATER_VARIANT_IDS,
  generateIsoTileLandscape,
  resolveTerrainType,
  variantIdToFrameIndex,
} from '../../../src/game/world/isoTileLandscape.js';

describe('isoTileLandscape', () => {
  it('exposes grass and water variant catalogs matching tile manifests', () => {
    expect(GRASS_VARIANT_IDS).toHaveLength(11);
    expect(WATER_VARIANT_IDS).toHaveLength(12);
    expect(GRASS_VARIANT_IDS[0]).toBe('grass-plain');
    expect(WATER_VARIANT_IDS[0]).toBe('water-plain');
  });

  it('resolveTerrainType classifies low elevation and wet pockets as water', () => {
    expect(resolveTerrainType(0.2, 0.4)).toBe('water');
    expect(resolveTerrainType(0.42, 0.7)).toBe('water');
    expect(resolveTerrainType(0.55, 0.3)).toBe('grass');
  });

  it('generateIsoTileLandscape is deterministic for the same seed', () => {
    const left = generateIsoTileLandscape({ width: 8, height: 8, seed: 'polaris-landscape' });
    const right = generateIsoTileLandscape({ width: 8, height: 8, seed: 'polaris-landscape' });
    expect(right).toEqual(left);
  });

  it('generateIsoTileLandscape produces both grass and water across a medium map', () => {
    const map = generateIsoTileLandscape({ width: 24, height: 24, seed: 'polaris-landscape' });
    const terrains = new Set(map.cells.map((cell) => cell.terrain));
    expect(terrains.has('grass')).toBe(true);
    expect(terrains.has('water')).toBe(true);
  });

  it('uses shoreline variants beside terrain boundaries', () => {
    const map = generateIsoTileLandscape({ width: 32, height: 32, seed: 'shoreline-check' });
    const byKey = new Map(map.cells.map((cell) => [`${cell.tx},${cell.ty}`, cell]));

    const shorelineWater = map.cells.filter((cell) => {
      if (cell.terrain !== 'water') return false;
      const neighbors = [
        byKey.get(`${cell.tx + 1},${cell.ty}`),
        byKey.get(`${cell.tx - 1},${cell.ty}`),
        byKey.get(`${cell.tx},${cell.ty + 1}`),
        byKey.get(`${cell.tx},${cell.ty - 1}`),
      ];
      return neighbors.some((neighbor) => neighbor?.terrain === 'grass');
    });

    expect(shorelineWater.length).toBeGreaterThan(0);
    const shoreIds = new Set(shorelineWater.map((cell) => cell.variantId));
    expect(
      shoreIds.has('water-foam')
      || shoreIds.has('water-shallow')
      || shoreIds.has('water-reeds')
      || shoreIds.has('water-lily'),
    ).toBe(true);
  });

  it('variantIdToFrameIndex maps ids to sheet frame indices', () => {
    expect(variantIdToFrameIndex('grass-dense', 'grass')).toBe(GRASS_VARIANT_IDS.indexOf('grass-dense'));
    expect(variantIdToFrameIndex('water-sonic', 'water')).toBe(WATER_VARIANT_IDS.indexOf('water-sonic'));
  });
});
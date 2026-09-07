import { describe, expect, it } from 'vitest';

import {
  TILE_FORGE_PALETTE_FAMILIES,
  getTileForgePaletteColors,
} from '../../../codex/core/pixelbrain/tile-forge/tile-forge.palette-engine.js';
import { createTileForgeRegionSpec } from '../../../codex/core/pixelbrain/tile-forge/tile-forge.region-spec.js';
import { synthesizeTileForgeRegion } from '../../../codex/core/pixelbrain/tile-forge/tile-forge.region-synthesizer.js';

const MATERIAL_GRID = Object.freeze([
  Object.freeze(['grass_quiet', 'grass_quiet', 'water_pond', 'water_pond']),
  Object.freeze(['grass_edge', 'path_flagstone', 'water_pond', 'water_pond']),
  Object.freeze(['grass_edge', 'path_flagstone', 'grass_quiet', 'grass_quiet']),
  Object.freeze(['soil_garden', 'path_flagstone', 'path_flagstone', 'sanctuary_stone']),
]);

function makeSpec(seed = 4242, paletteFamily = 'scholomance_sunlit_glade') {
  return createTileForgeRegionSpec({
    id: 'region-realization-fixture',
    seed,
    gridWidth: 4,
    gridHeight: 4,
    paletteFamily,
    cells: MATERIAL_GRID.flatMap((row, ty) => row.map((material, tx) => ({
      tx,
      ty,
      elevation: 0,
      material,
      tags: material === 'path_flagstone' ? ['path'] : [],
    }))),
  });
}

function opaqueColors(asset) {
  const colors = new Set();
  for (let offset = 0; offset < asset.data.length; offset += 4) {
    if (asset.data[offset + 3] === 0) continue;
    colors.add(`#${[asset.data[offset], asset.data[offset + 1], asset.data[offset + 2]]
      .map((channel) => channel.toString(16).padStart(2, '0'))
      .join('')}`.toUpperCase());
  }
  return colors;
}

function cropSignature(asset, tx, ty) {
  const anchor = asset.form.cellAnchors[`${tx},${ty}`];
  const offsets = [[40, 20], [34, 18], [46, 22], [40, 12], [30, 20], [50, 20]];
  return offsets.map(([dx, dy]) => {
    const offset = ((anchor.y + dy) * asset.width + anchor.x + dx) * 4;
    return Array.from(asset.data.slice(offset, offset + 4)).join(',');
  });
}

describe('Tile Forge region realization', () => {
  it('catches palette-role omissions and palette overflow', () => {
    const family = TILE_FORGE_PALETTE_FAMILIES.scholomance_sunlit_glade;
    expect(Object.keys(family.roles)).toEqual(expect.arrayContaining([
      'meadow', 'verge', 'path', 'pond', 'cliff', 'wood', 'foliage',
      'flower', 'magicCyan', 'magicViolet', 'ink', 'castShadow',
    ]));
    expect(getTileForgePaletteColors(family)).toHaveLength(32);
  });

  it('catches nondeterministic realization for the same input', () => {
    const first = synthesizeTileForgeRegion(makeSpec());
    const second = synthesizeTileForgeRegion(makeSpec());

    expect(first.formHash).toBe(second.formHash);
    expect(first.realizationHash).toBe(second.realizationHash);
    expect(first.textureKey).toBe(second.textureKey);
    expect(Buffer.from(first.data).equals(Buffer.from(second.data))).toBe(true);
  });

  it('catches seeds changing form instead of surface detail', () => {
    const first = synthesizeTileForgeRegion(makeSpec(4242));
    const second = synthesizeTileForgeRegion(makeSpec(4243));

    expect(first.formHash).toBe(second.formHash);
    expect(Buffer.from(first.form.alphaMask).equals(Buffer.from(second.form.alphaMask))).toBe(true);
    expect(first.realizationHash).not.toBe(second.realizationHash);
    expect(Buffer.from(first.data).equals(Buffer.from(second.data))).toBe(false);
  });

  it('catches undeclared RGB output and loss of quiet meadow dominance', () => {
    const asset = synthesizeTileForgeRegion(makeSpec());
    const declared = new Set(asset.palette);
    const used = opaqueColors(asset);
    const middleMeadow = new Set(asset.paletteRoles.meadow.slice(2, 5));
    let quietPixels = 0;
    let quietMiddlePixels = 0;

    for (let index = 0; index < asset.form.alphaMask.length; index += 1) {
      if (asset.form.materialMasks.grass_quiet[index] !== 1) continue;
      quietPixels += 1;
      const offset = index * 4;
      const color = `#${[asset.data[offset], asset.data[offset + 1], asset.data[offset + 2]]
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')}`.toUpperCase();
      if (middleMeadow.has(color)) quietMiddlePixels += 1;
    }

    expect([...used].every((color) => declared.has(color))).toBe(true);
    expect(used.size).toBeLessThanOrEqual(32);
    expect(quietMiddlePixels / quietPixels).toBeGreaterThanOrEqual(0.7);
  });

  it('catches per-tile texture reset inside the continuous pond', () => {
    const asset = synthesizeTileForgeRegion(makeSpec());
    expect(cropSignature(asset, 2, 0)).not.toEqual(cropSignature(asset, 3, 0));
    expect(cropSignature(asset, 2, 0)).not.toEqual(cropSignature(asset, 2, 1));
  });

  it('catches a full tutorial substrate exceeding the synthesis budget', () => {
    const cells = [];
    for (let ty = 0; ty < 24; ty += 1) {
      for (let tx = 0; tx < 24; tx += 1) {
        cells.push({ tx, ty, elevation: 0, material: 'grass_quiet', tags: [] });
      }
    }
    const spec = createTileForgeRegionSpec({
      id: 'full-size-performance-fixture',
      seed: 4242,
      gridWidth: 24,
      gridHeight: 24,
      paletteFamily: 'scholomance_sunlit_glade',
      cells,
    });

    const startedAt = performance.now();
    const asset = synthesizeTileForgeRegion(spec);
    const elapsed = performance.now() - startedAt;

    expect(asset.width).toBe(1920);
    expect(asset.height).toBe(960);
    expect(elapsed).toBeLessThan(500);
  });
});

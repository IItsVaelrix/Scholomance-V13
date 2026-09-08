import { describe, expect, it } from 'vitest';

import { createTileForgeRegionSpec } from '../../../codex/core/pixelbrain/tile-forge/tile-forge.region-spec.js';
import { scoreTileForgeRegion } from '../../../codex/core/pixelbrain/tile-forge/tile-forge.region-quality-scorer.js';
import { synthesizeTileForgeRegion } from '../../../codex/core/pixelbrain/tile-forge/tile-forge.region-synthesizer.js';

const GRID = Object.freeze([
  Object.freeze(['grass_quiet', 'grass_quiet', 'water_pond', 'water_pond']),
  Object.freeze(['grass_edge', 'path_flagstone', 'water_pond', 'water_pond']),
  Object.freeze(['grass_quiet', 'path_flagstone', 'grass_quiet', 'grass_quiet']),
  Object.freeze(['soil_garden', 'path_flagstone', 'path_flagstone', 'sanctuary_stone']),
]);

function fixture() {
  const spec = createTileForgeRegionSpec({
    id: 'region-quality-fixture',
    seed: 991,
    gridWidth: 4,
    gridHeight: 4,
    paletteFamily: 'scholomance_sunlit_glade',
    cells: GRID.flatMap((row, ty) => row.map((material, tx) => ({
      tx,
      ty,
      elevation: 0,
      material,
      tags: material === 'path_flagstone' ? ['path'] : [],
    }))),
  });
  return { spec, asset: synthesizeTileForgeRegion(spec) };
}

function mutate(asset, mutateData) {
  const data = new Uint8ClampedArray(asset.data);
  mutateData(data, asset.form, asset);
  return { ...asset, data };
}

function writeHex(data, pixelIndex, hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  const offset = pixelIndex * 4;
  data[offset] = (value >> 16) & 255;
  data[offset + 1] = (value >> 8) & 255;
  data[offset + 2] = value & 255;
  data[offset + 3] = 255;
}

describe('Tile Forge region quality scorer', () => {
  it('accepts hard invariants without awarding automatic Grade S', () => {
    const { spec, asset } = fixture();
    const result = scoreTileForgeRegion({ asset, form: asset.form, spec });

    expect(result.hardFailures).toEqual([]);
    expect(result.grade).toBe('A');
    expect(result.metrics.paletteColorCount).toBeLessThanOrEqual(32);
    expect(result.metrics.transparentSeamPixels).toBe(0);
    expect(result.metrics.pathContinuityGaps).toBe(0);
  });

  it('rejects checkerboard water even when its colors are in-palette', () => {
    const { spec, asset } = fixture();
    const checkerboardWater = mutate(asset, (data, form, source) => {
      const [dark, light] = [source.paletteRoles.pond[0], source.paletteRoles.pond.at(-1)];
      for (let index = 0; index < form.alphaMask.length; index += 1) {
        if (form.materialMasks.water_pond[index] !== 1) continue;
        const x = index % form.width;
        const y = Math.floor(index / form.width);
        writeHex(data, index, (x + y) % 2 === 0 ? dark : light);
      }
    });

    const result = scoreTileForgeRegion({ asset: checkerboardWater, form: asset.form, spec });
    expect(result.grade).not.toBe('A');
    expect(result.metrics.waterNeighborChangeRatio).toBeGreaterThan(0.75);
  });

  it('rejects a repeated local crop pattern across adjacent cells', () => {
    const { spec, asset } = fixture();
    const repeatedTileCrops = mutate(asset, (data, form, source) => {
      for (let index = 0; index < form.alphaMask.length; index += 1) {
        if (form.alphaMask[index] !== 1) continue;
        const x = index % form.width;
        const y = Math.floor(index / form.width);
        const color = (x + y * 3) % 10 < 5
          ? source.paletteRoles.meadow[2]
          : source.paletteRoles.meadow[3];
        writeHex(data, index, color);
      }
    });

    const result = scoreTileForgeRegion({ asset: repeatedTileCrops, form: asset.form, spec });
    expect(result.grade).not.toBe('A');
    expect(result.metrics.repeatedAdjacentCropRatio).toBeGreaterThan(0.5);
  });

  it('hard-fails pixels cleared from the path form', () => {
    const { spec, asset } = fixture();
    const seamedPath = mutate(asset, (data, form) => {
      let cleared = 0;
      for (let index = 0; index < form.alphaMask.length && cleared < 2; index += 1) {
        if (form.materialMasks.path_flagstone[index] !== 1) continue;
        data[index * 4 + 3] = 0;
        cleared += 1;
      }
    });

    const result = scoreTileForgeRegion({ asset: seamedPath, form: asset.form, spec });
    expect(result.metrics.pathContinuityGaps).toBe(2);
    expect(result.hardFailures).toContain('path_continuity');
  });

  it('rejects meadow noise that erases quiet negative space', () => {
    const { spec, asset } = fixture();
    const noisyMeadow = mutate(asset, (data, form, source) => {
      let quietIndex = 0;
      for (let index = 0; index < form.alphaMask.length; index += 1) {
        if (form.materialMasks.grass_quiet[index] !== 1) continue;
        if (quietIndex % 2 === 0) writeHex(data, index, source.paletteRoles.magicCyan[0]);
        quietIndex += 1;
      }
    });

    const result = scoreTileForgeRegion({ asset: noisyMeadow, form: asset.form, spec });
    expect(result.grade).not.toBe('A');
    expect(result.metrics.quietMeadowAccentRatio).toBeGreaterThan(0.4);
  });

  it('rejects materials that collapse to the same grayscale value', () => {
    const { spec, asset } = fixture();
    const flatGrayscale = mutate(asset, (data, form) => {
      for (let index = 0; index < form.alphaMask.length; index += 1) {
        if (
          form.materialMasks.grass_quiet[index] !== 1
          && form.materialMasks.path_flagstone[index] !== 1
        ) continue;
        const offset = index * 4;
        data[offset] = 100;
        data[offset + 1] = 100;
        data[offset + 2] = 100;
      }
    });

    const result = scoreTileForgeRegion({ asset: flatGrayscale, form: asset.form, spec });
    expect(result.grade).not.toBe('A');
    expect(result.metrics.materialLuminanceSeparation).toBeLessThan(1);
  });
});

import { describe, expect, it } from 'vitest';

import { createTileForgeRegionSpec } from '../../../codex/core/pixelbrain/tile-forge/tile-forge.region-spec.js';
import {
  buildTileForgeRegionForm,
  projectRegionCell,
} from '../../../codex/core/pixelbrain/tile-forge/tile-forge.region-form.js';

function makeCells({ elevated = false } = {}) {
  const materials = [
    ['grass_quiet', 'path_flagstone', 'water_pond'],
    ['grass_edge', 'path_flagstone', 'water_pond'],
    ['soil_garden', 'sanctuary_stone', 'cliff_stone'],
  ];
  return materials.flatMap((row, ty) => row.map((material, tx) => ({
    tx,
    ty,
    elevation: elevated && tx === 2 && ty === 2 ? 1 : 0,
    material,
    tags: material === 'path_flagstone' ? ['path'] : [],
  })));
}

function makeSpec(paletteFamily = 'scholomance_sunlit_glade', options = {}) {
  return createTileForgeRegionSpec({
    id: 'form-fixture',
    seed: 77,
    gridWidth: 3,
    gridHeight: 3,
    paletteFamily,
    cells: makeCells(options),
  });
}

describe('Tile Forge region form', () => {
  it('catches incorrect 2:1 projection anchors', () => {
    expect(projectRegionCell(0, 0, 0, 3)).toEqual({ x: 80, y: 0, elevation: 0 });
    expect(projectRegionCell(2, 1, 1, 3)).toEqual({ x: 120, y: 44, elevation: 1 });
  });

  it('catches palettes leaking into form identity', () => {
    const sunlit = buildTileForgeRegionForm(makeSpec('scholomance_sunlit_glade'));
    const autumn = buildTileForgeRegionForm(makeSpec('autumnal_gold'));

    expect(sunlit.contract).toBe('PB-TILE-FORGE-REGION-FORM-v1');
    expect(sunlit.formHash).toBe(autumn.formHash);
    expect(sunlit.cellAnchors['0,0']).toEqual({ x: 80, y: 0, elevation: 0 });
  });

  it('catches missing material masks and semantic boundaries', () => {
    const form = buildTileForgeRegionForm(makeSpec('scholomance_sunlit_glade', { elevated: true }));

    expect(form.width).toBeLessThanOrEqual(2048);
    expect(form.height).toBeLessThanOrEqual(2048);
    expect(form.materialMasks.path_flagstone.some(Boolean)).toBe(true);
    expect(form.boundaries.map(({ kind }) => kind)).toEqual(expect.arrayContaining([
      'shore',
      'path_verge',
      'cliff_face',
      'material_transition',
    ]));
  });

  it('catches transparent cracks between flat adjacent diamonds', () => {
    const form = buildTileForgeRegionForm(makeSpec());

    for (let y = 0; y < form.height; y += 1) {
      const rowOffset = y * form.width;
      const opaqueXs = [];
      for (let x = 0; x < form.width; x += 1) {
        if (form.alphaMask[rowOffset + x] !== 0) opaqueXs.push(x);
      }
      if (opaqueXs.length === 0) continue;
      const first = opaqueXs[0];
      const last = opaqueXs.at(-1);
      for (let x = first; x <= last; x += 1) {
        expect(form.alphaMask[rowOffset + x], `transparent seam at ${x},${y}`).toBe(1);
      }
    }
  });
});

import { describe, expect, it } from 'vitest';

import {
  TILE_FORGE_REGION_CONTRACT,
  createTileForgeRegionSpec,
  validateTileForgeRegionSpec,
} from '../../../codex/core/pixelbrain/tile-forge/tile-forge.region-spec.js';

const COMPLETE_CELLS = Object.freeze([
  Object.freeze({ tx: 0, ty: 0, elevation: 0, material: 'grass_quiet', tags: [] }),
  Object.freeze({ tx: 1, ty: 0, elevation: 0, material: 'path_flagstone', tags: ['path'] }),
]);

function validInput(overrides = {}) {
  return {
    id: 'tutorial-forest',
    seed: 4242,
    gridWidth: 2,
    gridHeight: 1,
    paletteFamily: 'scholomance_sunlit_glade',
    cells: COMPLETE_CELLS,
    ...overrides,
  };
}

describe('Tile Forge region spec', () => {
  it('catches a nondeterministic or input-order-dependent region identity', () => {
    const forward = createTileForgeRegionSpec(validInput());
    const reverse = createTileForgeRegionSpec(validInput({ cells: [...COMPLETE_CELLS].reverse() }));

    expect(forward.contract).toBe(TILE_FORGE_REGION_CONTRACT);
    expect(forward.regionKey).toBe(reverse.regionKey);
    expect(forward.cells.map(({ tx }) => tx)).toEqual([0, 1]);
    expect(Object.isFrozen(forward)).toBe(true);
    expect(Object.isFrozen(forward.cells)).toBe(true);
    expect(Object.isFrozen(forward.cells[0])).toBe(true);
  });

  it('catches missing and duplicate cells before synthesis', () => {
    const missing = validateTileForgeRegionSpec(validInput({ cells: [COMPLETE_CELLS[0]] }));
    const duplicate = validateTileForgeRegionSpec(validInput({
      gridWidth: 1,
      cells: [COMPLETE_CELLS[0], COMPLETE_CELLS[0]],
    }));

    expect(missing.ok).toBe(false);
    expect(missing.diagnostics.map(({ code }) => code)).toContain('PB-TFR-007');
    expect(duplicate.ok).toBe(false);
    expect(duplicate.diagnostics.map(({ code }) => code)).toContain('PB-TFR-008');
  });

  it('catches out-of-bounds coordinates and unknown materials', () => {
    const result = validateTileForgeRegionSpec(validInput({
      cells: [
        { tx: -1, ty: 0, elevation: 0, material: 'grass_quiet', tags: [] },
        { tx: 1, ty: 0, elevation: 0, material: 'rainbow_mud', tags: [] },
      ],
    }));

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'PB-TFR-004',
      'PB-TFR-005',
    ]));
  });

  it('catches region inputs beyond deterministic resource limits', () => {
    const result = validateTileForgeRegionSpec(validInput({
      gridWidth: 52,
      gridHeight: 52,
      cells: [],
    }));

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toContain('PB-TFR-003');
  });

  it('throws diagnostics only at the constructor boundary', () => {
    expect(() => createTileForgeRegionSpec(validInput({ id: '', cells: [] })))
      .toThrow(/PB-TFR-001.*PB-TFR-007/);
  });
});

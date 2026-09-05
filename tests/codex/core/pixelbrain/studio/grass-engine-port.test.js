import { describe, expect, test } from 'vitest';

import {
  defaultParams as referenceDefaults,
  generateGrass as generateReferenceGrass,
} from '../../../../../Pixel-Art-Studio-Skeleton/src/lib/grass/engine.ts';
import { PALETTES as REFERENCE_PALETTES } from '../../../../../Pixel-Art-Studio-Skeleton/src/lib/grass/palettes.ts';
import {
  defaultParams,
  generateGrass,
} from '../../../../../codex/core/pixelbrain/grass-engine.js';
import { PALETTES } from '../../../../../codex/core/pixelbrain/grass-palettes.js';
import {
  GRASS_AMP_SEAM,
  GRASS_AMP_VERSION,
  GrassAMP,
} from '../../../../../codex/core/pixelbrain/grass-amp.js';

function plain(result) {
  return {
    field: [...result.field],
    ground: [...result.ground],
    blades: [...result.blades],
    palette: result.palette,
    rgb: result.rgb,
    width: result.width,
    height: result.height,
    diagnostics: result.diagnostics,
  };
}

describe('literal SWARD grass engine port', () => {
  test('preserves all eight authored biome palettes and defaults', () => {
    expect(PALETTES).toEqual(REFERENCE_PALETTES);
    expect(defaultParams()).toEqual(referenceDefaults());
    expect(PALETTES).toHaveLength(8);
  });

  test.each([
    { width: 16, height: 16, seed: 1, density: 0.1, wind: 'N', soil: 0.1, bladeScale: 0.2, paletteId: 'deep' },
    { width: 32, height: 32, seed: 0x5a17, density: 0.58, wind: 'NW', soil: 0.35, bladeScale: 0.62, paletteId: 'meadow' },
    { width: 64, height: 48, seed: 0xffffffff, density: 0.9, wind: 'SE', soil: 0.8, bladeScale: 0.9, paletteId: 'worn' },
  ])('is field-for-field identical to SWARD for seed $seed', (options) => {
    const palette = PALETTES.find((entry) => entry.id === options.paletteId).colors;
    const params = { ...options, palette };
    expect(plain(generateGrass(params))).toEqual(plain(generateReferenceGrass(params)));
  });

  test('keeps the AMP wrapper narrow while using SWARD defaults', () => {
    const direct = generateGrass({ ...defaultParams(), width: 24, height: 24, seed: 42 });
    const wrapped = GrassAMP({ width: 24, height: 24, seed: 42, density: 0.01, paletteId: 'worn' });

    expect(plain(wrapped)).toEqual(plain(direct));
    expect(GRASS_AMP_VERSION).toBe('5.0.0');
    expect(GRASS_AMP_SEAM).toMatchObject({
      id: 'grass-v3',
      emits: ['field', 'palette'],
      mergeContract: 'grass-tile-field-form-first-v3',
    });
  });

  test('replays one hundred times without output drift', () => {
    const expected = plain(GrassAMP({ width: 16, height: 16, seed: 98765 }));
    for (let i = 0; i < 100; i += 1) {
      expect(plain(GrassAMP({ width: 16, height: 16, seed: 98765 }))).toEqual(expected);
    }
  });
});

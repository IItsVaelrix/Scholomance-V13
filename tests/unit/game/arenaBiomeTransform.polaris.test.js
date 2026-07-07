import { describe, expect, it } from 'vitest';
import {
  POLARIS_SONIC_PALETTE_KEYS,
  resolveVoxelPaletteBand,
} from '../../../src/game/combat/arenaBiomeTransform.js';

describe('arenaBiomeTransform polaris_sonic', () => {
  it('uses sonic moss palette bands for forest terrain', () => {
    expect(resolveVoxelPaletteBand('polaris_sonic', { z: 4, isEdge: false }))
      .toBe(POLARIS_SONIC_PALETTE_KEYS.trench);
    expect(resolveVoxelPaletteBand('polaris_sonic', { z: 24, isEdge: false }))
      .toBe(POLARIS_SONIC_PALETTE_KEYS.peak);
  });
});
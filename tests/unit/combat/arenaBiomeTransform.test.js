import { describe, expect, it } from 'vitest';
import { ICE_BIOME_PALETTE_KEYS, resolveVoxelPaletteBand } from '../../../src/game/combat/arenaBiomeTransform.js';

describe('arenaBiomeTransform', () => {
  it('frozen biome favors void_ice bands', () => {
    expect(resolveVoxelPaletteBand('frozen', { z: 10, isEdge: false })).toBe(ICE_BIOME_PALETTE_KEYS.mid);
    expect(resolveVoxelPaletteBand('frozen', { z: 24, isEdge: false })).toBe(ICE_BIOME_PALETTE_KEYS.peak);
    expect(resolveVoxelPaletteBand('frozen', { z: 10, isEdge: true })).toBe(ICE_BIOME_PALETTE_KEYS.edge);
  });

  it('void biome keeps mixed rock/ice ramp', () => {
    expect(resolveVoxelPaletteBand('void', { z: 10, isEdge: false })).toBe('obsidian');
    expect(resolveVoxelPaletteBand('void', { z: 16, isEdge: false })).toBe('void_ice');
  });
});
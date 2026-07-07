import { describe, expect, it } from 'vitest';
import {
  ISO_GRASS_SHEET_KEY,
  ISO_TILE_SHEET_FRAMES,
  ISO_TILE_SHEET_PATHS,
  ISO_WATER_SHEET_KEY,
} from '../../../src/phaser/isoTileTextures.js';

describe('isoTileTextures', () => {
  it('defines grass and water sheet keys and paths', () => {
    expect(ISO_GRASS_SHEET_KEY).toBe('iso-grass-sheet');
    expect(ISO_WATER_SHEET_KEY).toBe('iso-water-sheet');
    expect(ISO_TILE_SHEET_PATHS[ISO_GRASS_SHEET_KEY]).toContain('grass-sheet.png');
    expect(ISO_TILE_SHEET_PATHS[ISO_WATER_SHEET_KEY]).toContain('water-sheet.png');
    expect(ISO_TILE_SHEET_FRAMES).toEqual({ frameWidth: 80, frameHeight: 45 });
  });
});
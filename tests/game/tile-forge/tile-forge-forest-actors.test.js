import { describe, expect, it } from 'vitest';

import { synthesizeTileForgeAsset } from '../../../codex/core/pixelbrain/tile-forge/tile-forge.synthesizer.js';
import {
  scoreTileForgeRegion,
  synthesizeTileForgeRegion,
} from '../../../src/lib/pixelbrain/tileForge.adapter.js';

const ACTOR_TYPES = Object.freeze([
  'canopy_oak',
  'canopy_maple',
  'canopy_pine',
  'young_sapling',
  'rustic_well',
  'sanctuary_ruin',
  'timber_fence',
  'sunflower_patch',
  'hollow_stump',
  'fallen_log',
  'lotus_cluster',
  'waymarker',
]);

function synthesize(semanticType, seed = 4242) {
  return synthesizeTileForgeAsset({
    semanticType,
    seed,
    paletteFamily: 'scholomance_sunlit_glade',
  });
}

function usedColorCount(asset) {
  const colors = new Set();
  for (let offset = 0; offset < asset.data.length; offset += 4) {
    if (asset.data[offset + 3] === 0) continue;
    colors.add(`${asset.data[offset]},${asset.data[offset + 1]},${asset.data[offset + 2]}`);
  }
  return colors.size;
}

describe('Tile Forge forest actor family', () => {
  it('catches tutorial-local or missing actor types at the public Forge boundary', () => {
    for (const semanticType of ACTOR_TYPES) {
      const actor = synthesize(semanticType);
      const opaquePixels = actor.data.filter((_, index) => index % 4 === 3 && actor.data[index] > 0).length;
      const transparentPixels = actor.width * actor.height - opaquePixels;

      expect(actor.contract, semanticType).toBe('PB-TILE-FORGE-FOREST-ACTOR-v1');
      expect(actor.semanticType).toBe(semanticType);
      expect(Number.isInteger(actor.width)).toBe(true);
      expect(Number.isInteger(actor.height)).toBe(true);
      expect(transparentPixels, semanticType).toBeGreaterThan(0);
      expect(opaquePixels / (actor.width * actor.height), semanticType).toBeGreaterThan(0.02);
      expect(opaquePixels / (actor.width * actor.height), semanticType).toBeLessThan(0.8);
      expect(actor.anchor).toEqual({ x: 0.5, y: 0.94 });
      expect(actor.contactPixelCount, semanticType).toBeGreaterThan(0);
      expect(actor.silhouetteHash).toMatch(/^tfa-[0-9a-f]{8}$/);
      expect(usedColorCount(actor), semanticType).toBeLessThanOrEqual(32);
      expect(actor.palette).toHaveLength(32);
    }
  });

  it('catches actor nondeterminism and seed-insensitive surface detail', () => {
    for (const semanticType of ACTOR_TYPES) {
      const first = synthesize(semanticType, 81);
      const repeat = synthesize(semanticType, 81);
      const alternate = synthesize(semanticType, 82);

      expect(Buffer.from(first.data).equals(Buffer.from(repeat.data)), semanticType).toBe(true);
      expect(first.realizationHash, semanticType).toBe(repeat.realizationHash);
      expect(first.realizationHash, semanticType).not.toBe(alternate.realizationHash);
    }
  });

  it('catches a tree family collapsing to one silhouette', () => {
    const hashes = ['canopy_oak', 'canopy_maple', 'canopy_pine', 'young_sapling']
      .map((semanticType) => synthesize(semanticType).silhouetteHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('keeps region synthesis and scoring browser-safe through the app adapter', () => {
    expect(typeof synthesizeTileForgeRegion).toBe('function');
    expect(typeof scoreTileForgeRegion).toBe('function');
  });
});

/**
 * Tile Forge — SCD128 Synthesizer Microprocessor
 *
 * Microprocessor step that binds procedural discrete 1x cell synthesis
 * and formal SCD128 dual-witness records to Tile Forge candidate layers.
 */

import { TileForgeMicroprocessor, stableLayerHash } from './tile-forge.microprocessor.js';
import {
  synthesizeTileForgeTile,
  synthesizeTileForgeProp,
} from './tile-forge.synthesizer.js';

export class TileForgeScd128Microprocessor extends TileForgeMicroprocessor {
  constructor() {
    super({ id: 'scd128Synthesizer', version: '1.0.0' });
  }

  run({ intent }) {
    const biome = intent.biomeId || 'void_forest';
    const seed = typeof intent.seed === 'number'
      ? intent.seed
      : (typeof intent.seed === 'string'
        ? Array.from(intent.seed).reduce((acc, ch) => acc + ch.charCodeAt(0), 4242)
        : 4242);

    const elevation = intent.elevation || 1;

    // Synthesize discrete 1x pixel art tile types
    const topTile = synthesizeTileForgeTile({ type: 'top', biome, seed, elevation });
    const groundTile = synthesizeTileForgeTile({ type: 'ground', biome, seed, elevation });
    const rimTile = synthesizeTileForgeTile({ type: 'rim', biome, seed, elevation });
    const cliffTile = synthesizeTileForgeTile({ type: 'cliff', biome, seed, elevation });

    // Synthesize biome props
    const crystalTree = synthesizeTileForgeProp({ propType: 'crystal_tree', biome, seed });
    const voidPine = synthesizeTileForgeProp({ propType: 'void_pine', biome, seed });
    const fern = synthesizeTileForgeProp({ propType: 'hologram_fern', biome, seed });
    const flowers = synthesizeTileForgeProp({ propType: 'void_flowers', biome, seed });

    const synthesizedTextures = {
      top: topTile,
      ground: groundTile,
      rim: rimTile,
      cliff: cliffTile,
      crystal_tree: crystalTree,
      void_pine: voidPine,
      hologram_fern: fern,
      void_flowers: flowers,
      // Key aliases matching candidate material strings
      void_ice_top: topTile,
      purple_void_grass: topTile,
      void_ice_ground: groundTile,
      purple_void_ground: groundTile,
      obsidian_side: cliffTile,
      obsidian_cliff_edge: cliffTile,
      purple_void_tree: crystalTree,
      void_spores: flowers,
    };

    const scd128Witnesses = {
      top: topTile.scd128Record,
      ground: groundTile.scd128Record,
      rim: rimTile.scd128Record,
      cliff: cliffTile.scd128Record,
      crystal_tree: crystalTree.scd128Record,
      void_pine: voidPine.scd128Record,
      hologram_fern: fern.scd128Record,
      void_flowers: flowers.scd128Record,
    };

    const allAmps = [
      ...(topTile.ampDescriptors || []),
      ...(groundTile.ampDescriptors || []),
      ...(rimTile.ampDescriptors || []),
      ...(cliffTile.ampDescriptors || []),
      ...(crystalTree.ampDescriptors || []),
      ...(voidPine.ampDescriptors || []),
    ];

    const output = {
      biome,
      seed,
      elevation,
      synthesizedTextures,
      scd128Witnesses,
      chunkWireHash: cliffTile.scd128Record.scd128Wire,
      ampDescriptors: allAmps,
      scdlPrograms: {
        top: topTile.scdlSource,
        ground: groundTile.scdlSource,
        rim: rimTile.scdlSource,
        cliff: cliffTile.scdlSource,
        crystal_tree: crystalTree.scdlSource,
        void_pine: voidPine.scdlSource,
      },
    };

    return {
      output,
      diagnostics: { warnings: [], errors: [], metrics: { tilesSynthesized: 4, propsSynthesized: 4 } },
      hash: stableLayerHash(output.chunkWireHash),
      processor: { id: this.id, version: this.version },
    };
  }
}

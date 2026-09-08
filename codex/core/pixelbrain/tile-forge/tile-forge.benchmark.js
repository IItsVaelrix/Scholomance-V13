/**
 * Tile Forge — Professional Visual Benchmark Suite
 *
 * Implements Phase 9:
 * 12 fixed-seed visual benchmark assets demonstrating professional production fidelity:
 * 1. quiet_meadow
 * 2. ancient_forest_floor
 * 3. grandfather_oak
 * 4. autumn_maple
 * 5. stone_well
 * 6. ancient_dolmen
 * 7. lotus_spring
 * 8. organic_road
 * 9. mossy_cliff
 * 10. timber_fence
 * 11. sunflower_patch
 * 12. ruined_structure
 */

import {
  synthesizeGrandfatherOak,
  synthesizeAutumnMaple,
  synthesizeRusticWell,
  synthesizeAncientDolmen,
  synthesizeTimberFence,
  synthesizeSunflowerPatch,
  synthesizeRuinedStructure,
} from './tile-forge.hero-synthesizer.js';
import {
  synthesizeGroundFabric,
  synthesizeContinuousPath,
  synthesizeWaterSpring,
  synthesizeStratifiedCliff,
} from './tile-forge.feature-synthesizer.js';
import { TileForgeQualityScorer } from './tile-forge.quality-scorer.js';

export const BENCHMARK_MANIFEST = Object.freeze([
  {
    id: 'quiet_meadow',
    name: 'Quiet Meadow Base Fabric',
    category: 'fabric',
    synthesize: (seed) => synthesizeGroundFabric({ seed, paletteFamily: 'verdant_dofus', detailDensity: 0.05 }),
  },
  {
    id: 'ancient_forest_floor',
    name: 'Ancient Forest Floor',
    category: 'fabric',
    synthesize: (seed) => synthesizeGroundFabric({ seed, paletteFamily: 'verdant_dofus', detailDensity: 0.28, hasClover: true, hasDaisy: true }),
  },
  {
    id: 'grandfather_oak',
    name: 'Grandfather Ancient Oak',
    category: 'hero_botanical',
    synthesize: (seed) => synthesizeGrandfatherOak({ seed, paletteFamily: 'verdant_dofus' }),
  },
  {
    id: 'autumn_maple',
    name: 'Autumn Gold Maple',
    category: 'hero_botanical',
    synthesize: (seed) => synthesizeAutumnMaple({ seed, paletteFamily: 'autumnal_gold' }),
  },
  {
    id: 'stone_well',
    name: 'Rustic Stone Well',
    category: 'hero_prop',
    synthesize: (seed) => synthesizeRusticWell({ seed, paletteFamily: 'verdant_dofus' }),
  },
  {
    id: 'ancient_dolmen',
    name: 'Ancient Moss Dolmen',
    category: 'hero_landmark',
    synthesize: (seed) => synthesizeAncientDolmen({ seed, paletteFamily: 'weathered_granite' }),
  },
  {
    id: 'lotus_spring',
    name: 'Sacred Lotus Spring',
    category: 'feature_water',
    synthesize: (seed) => synthesizeWaterSpring({ seed, paletteFamily: 'sacred_water' }),
  },
  {
    id: 'organic_road',
    name: 'Organic Flagstone Road',
    category: 'feature_path',
    synthesize: (seed) => synthesizeContinuousPath({ seed, paletteFamily: 'verdant_dofus' }),
  },
  {
    id: 'mossy_cliff',
    name: 'Mossy Stratified Cliff',
    category: 'feature_cliff',
    synthesize: (seed) => synthesizeStratifiedCliff({ seed, paletteFamily: 'weathered_granite' }),
  },
  {
    id: 'timber_fence',
    name: 'Timber Fence with Pitchfork',
    category: 'hero_prop',
    synthesize: (seed) => synthesizeTimberFence({ seed, paletteFamily: 'verdant_dofus' }),
  },
  {
    id: 'sunflower_patch',
    name: 'Sunlit Sunflower Patch',
    category: 'feature_botanical',
    synthesize: (seed) => synthesizeSunflowerPatch({ seed, paletteFamily: 'verdant_dofus' }),
  },
  {
    id: 'ruined_structure',
    name: 'Ruined Stone Structure',
    category: 'hero_landmark',
    synthesize: (seed) => synthesizeRuinedStructure({ seed, paletteFamily: 'weathered_granite' }),
  },
]);

/**
 * Runs the complete Tile Forge benchmark corpus with a fixed seed.
 * Evaluates each asset against the TileForgeQualityScorer.
 *
 * @param {number} [fixedSeed=4242]
 * @returns {Array<Object>} Evaluated benchmark entries
 */
export function runTileForgeBenchmarks(fixedSeed = 4242) {
  const scorer = new TileForgeQualityScorer();
  const results = [];

  for (const item of BENCHMARK_MANIFEST) {
    const asset = item.synthesize(fixedSeed);
    const evaluation = scorer.evaluate(asset);

    results.push({
      id: item.id,
      name: item.name,
      category: item.category,
      asset,
      evaluation,
      width: asset.width,
      height: asset.height,
      activeCellCount: asset.activeCellCount,
      scd128Wire: asset.scd128Record?.scd128Wire,
    });
  }

  return results;
}

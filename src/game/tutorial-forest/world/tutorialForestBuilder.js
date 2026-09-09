/**
 * Tutorial Forest — World Grid Compiler & Pathfinding Engine
 *
 * Compiles the 24x24 isometric world layout with elevations, SCD128 metadata,
 * storytelling landmarks, Tile Forge biome assets, and deterministic BFS pathfinding.
 */

import {
  evaluateCoordinateBiome,
  GRID_SIZE,
  PLAYER_SPAWN,
  SHRINE_POS,
  DOLMEN_POS,
  FAIRY_STUMP_POS,
  FALLEN_LOG_POS,
  LOTUS_BASIN_POS,
  STONE_WELL_POS,
  TIMBER_FENCE_POS,
  SUNFLOWER_PATCH_POS,
  TILE_W,
  TILE_H,
} from './forestBiomeModel.js';
import { createReforgedTileWitness } from '../generators/SCD128ReforgedTiles.js';
import { createTreeWitnessRecord } from '../scd128/treeFamilyWitness.js';
import { createLotusWitnessRecord } from '../scd128/lotusTileWitness.js';
import { createPropWitnessRecord } from '../scd128/forestPropWitness.js';

/**
 * Compiles the complete world scene state.
 */
export function buildTutorialForestWorld(_seed = 4242) {
  const tiles = [];
  const tileMap = new Map();
  const trees = [];
  const props = [];
  const waterTiles = [];

  for (let ty = 0; ty < GRID_SIZE; ty += 1) {
    for (let tx = 0; tx < GRID_SIZE; tx += 1) {
      const biome = evaluateCoordinateBiome(tx, ty);
      let textureKey = biome.terrain;
      let scd128Record = null;

      if (biome.hasCliff) {
        textureKey = biome.cliffVariant || 'cliff_mossy_granite';
        scd128Record = createReforgedTileWitness(textureKey, 80, 56, 3200);
      } else if (biome.terrain.startsWith('water_')) {
        textureKey = biome.terrain;
        scd128Record = createLotusWitnessRecord(biome.terrain);
      } else {
        textureKey = biome.terrain;
        scd128Record = createReforgedTileWitness(biome.terrain, 80, 40, 1600);
      }

      const tileEntry = {
        tx,
        ty,
        key: `${tx},${ty}`,
        zone: biome.zone,
        terrain: biome.terrain,
        textureKey,
        elevation: biome.elevation,
        walkable: biome.walkable,
        scd128Record,
      };

      tiles.push(tileEntry);
      tileMap.set(tileEntry.key, tileEntry);

      // Water details
      if (biome.terrain.startsWith('water_')) {
        waterTiles.push({
          tx,
          ty,
          terrain: biome.terrain,
          hasLotus: biome.hasLotus,
          hasLilypad: biome.hasLilypad,
        });
      }

      // ── Storytelling Landmarks & Props ────────────────────────────────────
      if (tx === SHRINE_POS.tx && ty === SHRINE_POS.ty) {
        props.push({
          tx,
          ty,
          type: 'ancient_waymarker',
          textureKey: 'prop_ancient_waymarker',
          elevation: 1,
          name: 'Ancient Waymarker Shrine',
          scd128Record: createPropWitnessRecord('ancient_shrine'),
          description: 'Carved obelisk standing upon the sanctuary plateau, humming with crystalline resonant power.',
        });
      } else if (tx === DOLMEN_POS.tx && ty === DOLMEN_POS.ty) {
        props.push({
          tx,
          ty,
          type: 'ancient_moss_dolmen',
          textureKey: 'ancient_moss_dolmen',
          elevation: 1,
          name: 'Ancient Moss Dolmen',
          scd128Record: createPropWitnessRecord('ancient_moss_dolmen'),
          description: 'Megalithic stone portal marking the sacred grove entrance. Carved spiral petroglyphs glow with celestial cyan mana.',
        });
        tileEntry.walkable = false;
      } else if (tx === FAIRY_STUMP_POS.tx && ty === FAIRY_STUMP_POS.ty) {
        props.push({
          tx,
          ty,
          type: 'hollow_fairy_stump',
          textureKey: 'hollow_fairy_stump',
          elevation: 0,
          name: 'Hollow Fairy Stump',
          scd128Record: createPropWitnessRecord('hollow_fairy_stump'),
          description: 'Massive weathered hollow tree trunk sheltering a colony of bioluminescent fairy mushrooms.',
        });
        tileEntry.walkable = false;
      } else if (tx === FALLEN_LOG_POS.tx && ty === FALLEN_LOG_POS.ty) {
        props.push({
          tx,
          ty,
          type: 'fallen_mossy_log',
          textureKey: 'fallen_mossy_log',
          elevation: 0,
          name: 'Fallen Mossy Log',
          scd128Record: createPropWitnessRecord('fallen_mossy_log'),
          description: 'Ancient fallen timber trunk blanketed in rich moss and amber bracket fungi, nurturing a young sprouting fern.',
        });
        tileEntry.walkable = false;
      } else if (tx === LOTUS_BASIN_POS.tx && ty === LOTUS_BASIN_POS.ty) {
        props.push({
          tx,
          ty,
          type: 'lotus_stone_basin',
          textureKey: 'lotus_stone_basin',
          elevation: 0,
          name: 'Lotus Stone Basin',
          scd128Record: createPropWitnessRecord('lotus_stone_basin'),
          description: 'Ritual holy font carved from granite, filled with sacred spring water and floating lotus buds.',
        });
        tileEntry.walkable = false;
      } else if (tx === STONE_WELL_POS.tx && ty === STONE_WELL_POS.ty) {
        props.push({
          tx,
          ty,
          type: 'rustic_stone_well',
          textureKey: 'rustic_stone_well',
          elevation: 0,
          name: 'Rustic Stone Well',
          scd128Record: createPropWitnessRecord('rustic_stone_well'),
          description: 'Weathered circular stone well with wooden roof, winch, bucket, and cool reflective spring water.',
        });
        tileEntry.walkable = false;
      } else if (tx === TIMBER_FENCE_POS.tx && ty === TIMBER_FENCE_POS.ty) {
        props.push({
          tx,
          ty,
          type: 'timber_fence_pitchfork',
          textureKey: 'timber_fence_pitchfork',
          elevation: 0,
          name: 'Timber Fence & Pitchfork',
          scd128Record: createPropWitnessRecord('timber_fence_pitchfork'),
          description: 'Rustic split-rail timber enclosure with an iron pitchfork resting against the weathered cedar post.',
        });
        tileEntry.walkable = false;
      } else if (tx === SUNFLOWER_PATCH_POS.tx && ty === SUNFLOWER_PATCH_POS.ty) {
        props.push({
          tx,
          ty,
          type: 'sunflower_patch',
          textureKey: 'sunflower_patch',
          elevation: 0,
          name: 'Sunlit Sunflower Patch',
          scd128Record: createPropWitnessRecord('sunflower_patch'),
          description: 'Lush patch of blooming golden sunflowers with dark textured seed centers turning toward the upper sun.',
        });
        tileEntry.walkable = false;
      } else if ((tx === 8 && ty === 12) || (tx === 17 && ty === 12) || (tx === 18 && ty === 4)) {
        props.push({
          tx,
          ty,
          type: 'mossy_boulder',
          textureKey: 'prop_mossy_boulder',
          elevation: tileEntry.elevation,
          name: 'Mossy Granite Boulder',
          scd128Record: createPropWitnessRecord('mossy_boulder'),
          description: 'Weathered granite boulder encrusted with stratified lichen.',
        });
        tileEntry.walkable = false;
      }

      // ── Tile Forge Biome Props ────────────────────────────────────────────
      if (tx === 20 && ty === 4) {
        props.push({
          tx,
          ty,
          type: 'tileforge_crystal_tree',
          textureKey: 'tileforge_crystal_tree',
          elevation: 1,
          name: 'Tile Forge Crystal Tree',
          scd128Record: createPropWitnessRecord('crystal_tree'),
          description: 'Prismatic crystal spire tree synthesized by Tile Forge with void forest palettes and 2x2 Bayer dithering.',
        });
        tileEntry.walkable = false;
      } else if ((tx === 15 && ty === 2) || (tx === 21 && ty === 2)) {
        props.push({
          tx,
          ty,
          type: 'tileforge_void_pine',
          textureKey: 'tileforge_void_pine',
          elevation: 0,
          name: 'Tile Forge Void Pine',
          scd128Record: createPropWitnessRecord('void_pine'),
          description: 'Crystalline void pine spire synthesized by Tile Forge standing as northern sentinel.',
        });
        tileEntry.walkable = false;
      } else if ((tx === 10 && ty === 8) || (tx === 17 && ty === 6)) {
        props.push({
          tx,
          ty,
          type: 'tileforge_hologram_fern',
          textureKey: 'tileforge_hologram_fern',
          elevation: 0,
          name: 'Tile Forge Hologram Fern',
          scd128Record: createPropWitnessRecord('hologram_fern'),
          description: 'Radiating luminescent fern fronds synthesized by Tile Forge in the humid spring hollow.',
        });
      } else if ((tx === 17 && ty === 9) || (tx === 18 && ty === 8)) {
        props.push({
          tx,
          ty,
          type: 'tileforge_void_flowers',
          textureKey: 'tileforge_void_flowers',
          elevation: 0,
          name: 'Tile Forge Void Flowers',
          scd128Record: createPropWitnessRecord('void_flowers'),
          description: 'Rare luminescent floral cluster synthesized by Tile Forge edging the runic pathway.',
        });
      }

      // ── Heroic Botanical Framing Trees (Dofus-Scale Composition) ──────────
      const HEROIC_TREE_PLACEMENTS = [
        // Framing Heroic Grandfather Oaks & Autumn Maples
        { tx: 3, ty: 18, speciesKey: 'grandfather_oak' },
        { tx: 2, ty: 12, speciesKey: 'autumn_gold_maple' },
        { tx: 3, ty: 4, speciesKey: 'grandfather_oak' },
        { tx: 12, ty: 2, speciesKey: 'autumn_gold_maple' },
        { tx: 21, ty: 4, speciesKey: 'grandfather_oak' },
        { tx: 20, ty: 16, speciesKey: 'autumn_gold_maple' },
        { tx: 15, ty: 12, speciesKey: 'sacred_lotus_cedar' },
        { tx: 10, ty: 4, speciesKey: 'sacred_lotus_cedar' },
        // Sunlit glade saplings
        { tx: 5, ty: 14, speciesKey: 'sunlit_young_sapling' },
        { tx: 14, ty: 15, speciesKey: 'sunlit_young_sapling' },
        { tx: 4, ty: 19, speciesKey: 'sunlit_young_sapling' },
        { tx: 13, ty: 17, speciesKey: 'sunlit_young_sapling' },
        // Perimeter border sentinels
        { tx: 1, ty: 1, speciesKey: 'sentinel_frostpine' },
        { tx: 1, ty: 8, speciesKey: 'ancient_moss_oak' },
        { tx: 1, ty: 15, speciesKey: 'ancient_moss_oak' },
        { tx: 1, ty: 22, speciesKey: 'sentinel_frostpine' },
        { tx: 8, ty: 1, speciesKey: 'sentinel_frostpine' },
        { tx: 15, ty: 1, speciesKey: 'ancient_moss_oak' },
        { tx: 22, ty: 1, speciesKey: 'sentinel_frostpine' },
        { tx: 22, ty: 8, speciesKey: 'ancient_moss_oak' },
        { tx: 22, ty: 15, speciesKey: 'ancient_moss_oak' },
        { tx: 22, ty: 22, speciesKey: 'sentinel_frostpine' },
        { tx: 8, ty: 22, speciesKey: 'ancient_moss_oak' },
        { tx: 15, ty: 22, speciesKey: 'ancient_moss_oak' },
      ];

      const heroicTree = HEROIC_TREE_PLACEMENTS.find(t => t.tx === tx && t.ty === ty);
      const hasLandmark = props.some(p => p.tx === tx && p.ty === ty);
      if (heroicTree && !hasLandmark) {
        trees.push({
          tx,
          ty,
          speciesKey: heroicTree.speciesKey,
          textureKey: `tree_${heroicTree.speciesKey}`,
          elevation: biome.elevation,
          scd128Record: createTreeWitnessRecord(heroicTree.speciesKey),
        });
        tileEntry.walkable = false;
      }

      // ── Decor Boulder Collision Blocking ──────────────────────────────────
      // Decor boulders from forestComposition are visual-only actors, but
      // their visible rock mass warrants collision so the player slides
      // around them instead of phasing through.  Water-shore boulders at
      // (11,5) and (16,5) are already non-walkable via the pond zone.
      if (tileEntry.walkable && (
        (tx === 4 && ty === 10) ||
        (tx === 19 && ty === 14) ||
        (tx === 13 && ty === 15)
      )) {
        tileEntry.walkable = false;
      }
    }
  }

  return {
    seed: _seed >>> 0,
    gridSize: GRID_SIZE,
    tileW: TILE_W,
    tileH: TILE_H,
    playerSpawn: PLAYER_SPAWN,
    shrinePos: SHRINE_POS,
    tiles,
    tileMap,
    trees,
    props,
    waterTiles,
  };
}

/**
 * Deterministic BFS Pathfinding across the isometric grid.
 */
export function findGridPath(start, goal, tileMap) {
  if (start.tx === goal.tx && start.ty === goal.ty) return [];

  const goalTile = tileMap.get(`${goal.tx},${goal.ty}`);
  if (!goalTile || !goalTile.walkable) return [];

  const queue = [{ tx: start.tx, ty: start.ty, path: [] }];
  const visited = new Set([`${start.tx},${start.ty}`]);

  const neighbors = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  while (queue.length > 0) {
    const { tx, ty, path } = queue.shift();

    if (tx === goal.tx && ty === goal.ty) {
      return path;
    }

    for (const { dx, dy } of neighbors) {
      const nx = tx + dx;
      const ny = ty + dy;
      const nKey = `${nx},${ny}`;

      if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE && !visited.has(nKey)) {
        visited.add(nKey);
        const nextTile = tileMap.get(nKey);
        if (nextTile && nextTile.walkable) {
          queue.push({
            tx: nx,
            ty: ny,
            path: [...path, { tx: nx, ty: ny }],
          });
        }
      }
    }
  }

  return [];
}

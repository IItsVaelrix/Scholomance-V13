/**
 * Tutorial Forest → Tile Forge semantic adapter.
 *
 * Gameplay owns tiles, walkability, interactions, and coordinates. This module
 * translates that state into game-agnostic Forge inputs and visual actors.
 */

import {
  createTileForgeRegionSpec,
  scoreTileForgeRegion,
  synthesizeTileForgeAsset,
  synthesizeTileForgeRegion,
} from '../../../lib/pixelbrain/tileForge.adapter.js';

export const TUTORIAL_FOREST_FORGE_PLAN_CONTRACT = 'PB-TUTORIAL-FOREST-FORGE-PLAN-v1';

const PALETTE_FAMILY = 'scholomance_sunlit_glade';

const TREE_ACTOR_TYPES = Object.freeze({
  grandfather_oak: 'canopy_oak',
  ancient_moss_oak: 'canopy_oak',
  autumn_gold_maple: 'canopy_maple',
  sacred_lotus_cedar: 'canopy_pine',
  sentinel_frostpine: 'canopy_pine',
  sunlit_young_sapling: 'young_sapling',
});

const PROP_ACTOR_TYPES = Object.freeze({
  ancient_waymarker: 'waymarker',
  ancient_moss_dolmen: 'sanctuary_ruin',
  hollow_fairy_stump: 'hollow_stump',
  fallen_mossy_log: 'fallen_log',
  lotus_stone_basin: 'lotus_cluster',
  rustic_stone_well: 'rustic_well',
  timber_fence_pitchfork: 'timber_fence',
  sunflower_patch: 'sunflower_patch',
  tileforge_crystal_tree: 'canopy_pine',
  tileforge_void_pine: 'canopy_pine',
});

function stableSeed(value) {
  let hash = 0x811C9DC5;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function projectCenter(tx, ty, elevation = 0) {
  return Object.freeze({
    x: (tx - ty) * 40,
    y: (tx + ty) * 20 - elevation * 16,
  });
}

function boundsFor(cells) {
  const txs = cells.map(({ tx }) => tx);
  const tys = cells.map(({ ty }) => ty);
  return Object.freeze({
    minTx: Math.min(...txs),
    maxTx: Math.max(...txs),
    minTy: Math.min(...tys),
    maxTy: Math.max(...tys),
  });
}

function centroidFor(cells) {
  const count = Math.max(1, cells.length);
  const totals = cells.reduce((sum, cell) => ({
    tx: sum.tx + cell.tx,
    ty: sum.ty + cell.ty,
    elevation: sum.elevation + cell.elevation,
  }), { tx: 0, ty: 0, elevation: 0 });
  const tx = totals.tx / count;
  const ty = totals.ty / count;
  const elevation = totals.elevation / count;
  return Object.freeze({ tx, ty, elevation, projected: projectCenter(tx, ty, elevation) });
}

function materialForTile(tile) {
  if (tile.terrain.startsWith('water_')) return 'water_pond';
  if (tile.terrain.startsWith('path_')) return 'path_flagstone';
  if (tile.hasCliff || tile.textureKey.startsWith('cliff_')) return 'cliff_stone';
  if (tile.zone === 'sanctuary_plateau') return 'sanctuary_stone';
  if (
    tile.zone === 'rustic_farmstead_grove'
    && tile.tx >= 5 && tile.tx <= 9
    && tile.ty >= 4 && tile.ty <= 8
  ) return 'soil_garden';
  if (tile.zone === 'perimeter_canopy' || tile.zone === 'rustic_farmstead_grove') return 'grass_edge';
  return 'grass_quiet';
}

function actorDescriptor(source, semanticType, kind, index, seed) {
  const id = `${kind}-${index}-${source.tx},${source.ty}-${semanticType}`;
  return Object.freeze({
    id,
    semanticType,
    tx: source.tx,
    ty: source.ty,
    elevation: source.elevation ?? 0,
    name: source.name ?? semanticType,
    sourceType: source.type ?? source.speciesKey,
    description: source.description,
    scd128Record: source.scd128Record,
    seed: stableSeed(`${seed}:${id}`),
  });
}

function compileActors(world, seed) {
  const actors = [];
  world.trees.forEach((tree, index) => {
    const semanticType = TREE_ACTOR_TYPES[tree.speciesKey];
    if (semanticType) actors.push(actorDescriptor(tree, semanticType, 'tree', index, seed));
  });
  world.props.forEach((prop, index) => {
    const semanticType = PROP_ACTOR_TYPES[prop.type];
    if (semanticType) actors.push(actorDescriptor(prop, semanticType, 'prop', index, seed));
  });
  world.waterTiles
    .filter(({ hasLotus }) => hasLotus)
    .forEach((water, index) => {
      actors.push(actorDescriptor(water, 'lotus_cluster', 'pond', index, seed));
    });
  return Object.freeze(actors);
}

function compileComposition(world, regionCells, actors) {
  const quietCells = regionCells.filter(({ material }) => material === 'grass_quiet');
  const pathCells = regionCells.filter(({ material }) => material === 'path_flagstone');
  const pondCells = regionCells.filter(({ material }) => material === 'water_pond');
  const sanctuaryCells = world.tiles.filter(({ zone }) => zone === 'sanctuary_plateau');
  const farmsteadCells = world.tiles.filter(({ zone }) => zone === 'rustic_farmstead_grove');
  const centralCells = world.tiles.filter(({ tx, ty }) => tx >= 4 && tx <= 19 && ty >= 4 && ty <= 19);
  const centralTreeKeys = new Set(world.trees
    .filter(({ tx, ty }) => tx >= 4 && tx <= 19 && ty >= 4 && ty <= 19)
    .map(({ tx, ty }) => `${tx},${ty}`));
  const quietCentroid = centroidFor(quietCells);
  const pondCentroid = centroidFor(pondCells);

  return Object.freeze({
    quietMeadow: Object.freeze({
      cellCount: quietCells.length,
      bounds: boundsFor(quietCells),
      centroid: quietCentroid,
      maximumElevation: Math.max(...quietCells.map(({ elevation }) => elevation)),
    }),
    path: Object.freeze({
      cellCount: pathCells.length,
      bounds: boundsFor(pathCells),
      crossesCenter: pathCells.some(({ tx, ty }) => Math.abs(tx - 11.5) + Math.abs(ty - 11.5) <= 2),
    }),
    pond: Object.freeze({
      cellCount: pondCells.length,
      bounds: boundsFor(pondCells),
      centroid: pondCentroid,
      side: pondCentroid.projected.x > quietCentroid.projected.x ? 'right' : 'left',
      overlapsSpawn: pondCells.some(({ tx, ty }) => tx === world.playerSpawn.tx && ty === world.playerSpawn.ty),
    }),
    sanctuary: Object.freeze({
      cellCount: sanctuaryCells.length,
      bounds: boundsFor(sanctuaryCells),
      quadrant: 'upper-right',
      maximumElevation: Math.max(...sanctuaryCells.map(({ elevation }) => elevation), 0),
    }),
    farmstead: Object.freeze({
      cellCount: farmsteadCells.length,
      bounds: boundsFor(farmsteadCells),
      quadrant: 'upper-left',
    }),
    foreground: Object.freeze({
      types: Object.freeze(actors
        .filter(({ semanticType }) => semanticType === 'fallen_log' || semanticType === 'hollow_stump')
        .map(({ semanticType }) => semanticType)),
    }),
    canopyRing: Object.freeze({
      actorCount: world.trees.length,
      openCenterRatio: (centralCells.length - centralTreeKeys.size) / centralCells.length,
    }),
  });
}

/**
 * Translate the gameplay world into one immutable Forge plan.
 */
export function compileTutorialForestForgePlan(world, { seed = world.seed ?? 4242 } = {}) {
  if (!world || world.gridSize !== 24 || world.tiles?.length !== 576) {
    throw new TypeError('PB-TUTORIAL-FORGE-001 expected the canonical 24x24 tutorial world');
  }

  const regionCells = world.tiles.map((tile) => Object.freeze({
    tx: tile.tx,
    ty: tile.ty,
    elevation: tile.elevation,
    material: materialForTile(tile),
    tags: Object.freeze([tile.zone, tile.walkable ? 'walkable' : 'blocked']),
  }));
  const actors = compileActors(world, seed);
  const composition = compileComposition(world, regionCells, actors);
  const regionSpec = createTileForgeRegionSpec({
    id: 'tutorial-forest-sunlit-glade',
    seed: seed >>> 0,
    gridWidth: world.gridSize,
    gridHeight: world.gridSize,
    paletteFamily: PALETTE_FAMILY,
    cells: regionCells,
    regions: composition,
  });

  return Object.freeze({
    contract: TUTORIAL_FOREST_FORGE_PLAN_CONTRACT,
    seed: seed >>> 0,
    paletteFamily: PALETTE_FAMILY,
    regionSpec,
    actors,
    composition,
  });
}

/**
 * Execute a compiled plan and return runtime-ready RGBA assets.
 */
export function forgeTutorialForestEnvironment(world, options = {}) {
  const plan = compileTutorialForestForgePlan(world, options);
  const ground = synthesizeTileForgeRegion(plan.regionSpec);
  const quality = scoreTileForgeRegion({ asset: ground, form: ground.form, spec: plan.regionSpec });
  const actors = Object.freeze(plan.actors.map((descriptor) => Object.freeze({
    ...descriptor,
    asset: synthesizeTileForgeAsset({
      semanticType: descriptor.semanticType,
      seed: descriptor.seed,
      paletteFamily: plan.paletteFamily,
    }),
  })));

  return Object.freeze({
    contract: 'PB-TUTORIAL-FOREST-FORGE-ENVIRONMENT-v1',
    plan,
    ground,
    actors,
    quality,
  });
}

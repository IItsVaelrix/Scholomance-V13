/**
 * Tutorial Forest — Authored Decor Composition
 *
 * Gameplay owns tiles, walkability, and interactions. This module owns the
 * *illustration*: a hand-composed placement table of Tile Forge decor actors
 * (reeds, tufts, flowers, pebbles, roots, litter, shrubs, overhanging fronds)
 * plus a deterministic clustered filler, so the rendered scene reads as a
 * forest drawn from tiles rather than a grid populated with tiles.
 *
 * Placements are authored at sub-tile pixel offsets; nothing here changes
 * traversal, collision, or inspectability.
 */

export const TUTORIAL_FOREST_COMPOSITION_CONTRACT = 'PB-TUTORIAL-FOREST-COMPOSITION-v1';

function stableSeed(value) {
  let hash = 0x811C9DC5;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function place(tx, ty, decorType, offsetX = 0, offsetY = 0) {
  return Object.freeze({ tx, ty, decorType, offsetX, offsetY });
}

/**
 * Hand-composed hero decor: shoreline breakup, moist hollows, storytelling
 * traces, edge framing masses, and foreground overhang.
 */
const AUTHORED_DECOR = Object.freeze([
  // Sacred pond shoreline: reeds break the hard water edge (inlets & protrusions).
  place(11, 5, 'decor_reed_clump', -14, -4),
  place(13, 5, 'decor_reed_clump', 10, -6),
  place(16, 6, 'decor_reed_clump', 16, 0),
  place(16, 9, 'decor_reed_clump', 14, 6),
  place(14, 10, 'decor_reed_clump', 6, 8),
  place(12, 10, 'decor_reed_clump', -10, 8),
  place(11, 8, 'decor_reed_clump', -16, 2),
  place(17, 6, 'decor_reed_clump', -6, 4),
  place(12, 5, 'decor_reed_clump', 4, -2),
  place(15, 5, 'decor_reed_clump', -6, -4),
  place(16, 7, 'decor_reed_clump', 12, 2),
  place(16, 8, 'decor_reed_clump', 10, 6),
  place(15, 10, 'decor_reed_clump', -4, 6),
  place(13, 10, 'decor_reed_clump', 8, 4),
  place(11, 6, 'decor_reed_clump', -12, -2),
  place(11, 9, 'decor_reed_clump', -14, 4),
  // Shoreline breakup: stones and a mossy boulder interrupt the water outline.
  place(12, 10, 'decor_pebble_cluster', 10, 4),
  place(16, 10, 'decor_pebble_cluster', -8, 2),
  place(11, 5, 'decor_boulder_mossy', 10, 2),
  place(16, 5, 'decor_boulder_mossy', -10, 4),

  // Moist hollows: ferns south of the spring and in the grove shade.
  place(12, 11, 'decor_fern_clump', -6, 2),
  place(14, 11, 'decor_fern_clump', 8, -2),
  place(4, 9, 'decor_mushroom_cluster', -8, 4),
  place(6, 9, 'decor_mushroom_cluster', 10, 2),
  place(5, 7, 'decor_fern_clump', 12, 6),

  // Environmental storytelling: leaf drift behind obstacles, dropped branches.
  place(9, 17, 'decor_leaf_litter', 4, 6),
  place(10, 16, 'decor_leaf_litter', -8, 2),
  place(3, 5, 'decor_leaf_litter', 6, 4),
  place(13, 3, 'decor_leaf_litter', -4, 6),
  place(11, 16, 'decor_fallen_branch', 2, 4),
  place(7, 11, 'decor_fallen_branch', -6, 2),

  // Exposed roots wrapping out from the hero tree bases.
  place(3, 18, 'decor_root_snake', 6, 8),
  place(2, 12, 'decor_root_snake', 10, 6),
  place(3, 4, 'decor_root_snake', 4, 8),
  place(21, 4, 'decor_root_snake', -6, 8),
  place(20, 16, 'decor_root_snake', 2, 8),
  place(15, 12, 'decor_root_snake', -8, 6),

  // Stones: path verges and open ground landmarks.
  place(7, 16, 'decor_pebble_cluster', 18, 2),
  place(9, 14, 'decor_pebble_cluster', -16, 4),
  place(11, 12, 'decor_pebble_cluster', 16, -2),
  place(14, 11, 'decor_pebble_cluster', -14, 6),
  place(17, 9, 'decor_pebble_cluster', 14, 2),
  place(4, 10, 'decor_boulder_mossy', 6, 4),
  place(19, 14, 'decor_boulder_mossy', -8, 6),
  place(13, 15, 'decor_boulder_mossy', 10, 2),

  // Sunlit glade: flower clusters turn toward the light near spawn.
  place(5, 16, 'decor_flower_cluster', -6, 2),
  place(7, 18, 'decor_flower_cluster', 8, 4),
  place(6, 15, 'decor_flower_cluster', 2, -4),
  place(8, 17, 'decor_flower_cluster', -10, 6),
  place(4, 17, 'decor_flower_cluster', 12, 0),
  place(18, 5, 'decor_flower_cluster', -8, 6),

  // Perimeter framing: dark shrub masses imply forest continuing beyond bounds.
  place(1, 3, 'decor_dark_shrub', 8, 4),
  place(1, 11, 'decor_dark_shrub', 10, 2),
  place(1, 19, 'decor_dark_shrub', 8, 6),
  place(22, 3, 'decor_dark_shrub', -8, 4),
  place(22, 11, 'decor_dark_shrub', -10, 2),
  place(22, 19, 'decor_dark_shrub', -8, 6),
  place(3, 1, 'decor_dark_shrub', 4, 8),
  place(11, 1, 'decor_dark_shrub', -4, 8),
  place(19, 1, 'decor_dark_shrub', 6, 8),
  place(3, 22, 'decor_dark_shrub', 4, -6),
  place(11, 22, 'decor_dark_shrub', -6, -6),
  place(19, 22, 'decor_dark_shrub', 6, -6),

  // Foreground overhang: canopy fronds intrude from the near map boundary.
  place(8, 22, 'decor_canopy_frond', -6, -10),
  place(15, 22, 'decor_canopy_frond', 4, -12),
  place(22, 10, 'decor_canopy_frond', -10, -8),
  place(22, 17, 'decor_canopy_frond', -4, -10),

  // Sanctuary plateau: worn paving accents keep the stone tier from reading flat.
  place(18, 4, 'decor_pebble_cluster', 6, 4),
  place(20, 6, 'decor_flower_cluster', -8, 2),
  place(19, 4, 'decor_grass_tuft_tall', 10, 6),
  place(21, 5, 'decor_grass_tuft', -10, 4),

  // Open meadow interest: ferns and litter tie the quiet ground to its trees.
  place(10, 15, 'decor_fern_clump', -6, 4),
  place(12, 14, 'decor_fern_clump', 8, 2),
  place(6, 13, 'decor_leaf_litter', 2, 4),
  place(15, 16, 'decor_leaf_litter', -6, 2),

  // Path tie-in: tufts and pebbles stitch the isolated flagstones into the sward.
  place(8, 9, 'decor_grass_tuft', -14, 6),
  place(8, 10, 'decor_pebble_cluster', 12, 4),
  place(9, 11, 'decor_grass_tuft_tall', -12, 6),
  place(10, 12, 'decor_grass_tuft', 14, 4),

  // Glade bloom accents near spawn.
  place(5, 18, 'decor_flower_cluster', 6, 2),
  place(7, 16, 'decor_flower_cluster', -8, 4),

  // Tall tufts anchoring tree bases and path corners.
  place(6, 17, 'decor_grass_tuft_tall', -18, 6),
  place(10, 13, 'decor_grass_tuft_tall', 16, 6),
  place(16, 10, 'decor_grass_tuft_tall', -14, 8),
  place(19, 6, 'decor_grass_tuft_tall', 12, 6),
  place(5, 14, 'decor_grass_tuft_tall', -12, 8),
  place(14, 15, 'decor_grass_tuft_tall', 14, 6),
]);

function isBlockedCell(world, tx, ty) {
  const tile = world.tileMap.get(`${tx},${ty}`);
  if (!tile) return true;
  // Deep spring stays clear, but the shoreline accepts reeds, stones, and mud
  // decor so the water edge never reads as a clean outlined pond.
  if (tile.terrain === 'water_deep_spring') return true;
  if (world.props.some((p) => p.tx === tx && p.ty === ty)) return true;
  if (world.trees.some((t) => t.tx === tx && t.ty === ty)) return true;
  return false;
}

/**
 * Deterministic clustered tuft filler: patchy 2x2 region gates keep grass
 * clumps in families instead of a uniform sprinkle.
 */
function composeTuftFiller(world) {
  const placements = [];
  for (const tile of world.tiles) {
    if (!tile.walkable) continue;
    if (tile.zone === 'sanctuary_plateau') continue;
    const regionGate = stableSeed(`${tile.tx >> 1},${tile.ty >> 1}`) % 4;
    if (regionGate === 0) continue;
    const h = stableSeed(`${tile.tx},${tile.ty}`);
    if (h % 6 === 0) {
      placements.push(place(
        tile.tx,
        tile.ty,
        'decor_grass_tuft',
        ((h >>> 3) % 41) - 20,
        ((h >>> 7) % 21) - 10,
      ));
    } else if (h % 19 === 0) {
      placements.push(place(
        tile.tx,
        tile.ty,
        'decor_grass_tuft_tall',
        ((h >>> 5) % 37) - 18,
        ((h >>> 9) % 17) - 8,
      ));
    }
  }
  return placements;
}

/**
 * Compose the full decor placement list for one world seed.
 */
export function composeTutorialForestDecor(world, { seed = world?.seed ?? 4242 } = {}) {
  const authored = AUTHORED_DECOR.filter((entry) => !isBlockedCell(world, entry.tx, entry.ty));
  const filler = composeTuftFiller(world).filter((entry) => (
    !isBlockedCell(world, entry.tx, entry.ty)
  ));
  const all = [...authored, ...filler];

  return Object.freeze(all.map((entry, index) => Object.freeze({
    id: `decor-${index}-${entry.tx},${entry.ty}-${entry.decorType}`,
    decorType: entry.decorType,
    semanticType: entry.decorType,
    tx: entry.tx,
    ty: entry.ty,
    offsetX: entry.offsetX,
    offsetY: entry.offsetY,
    elevation: world.tileMap.get(`${entry.tx},${entry.ty}`)?.elevation ?? 0,
    interactive: false,
    seed: stableSeed(`${seed}:${entry.decorType}:${entry.tx},${entry.ty}`),
  })));
}

export const TUTORIAL_FOREST_COMPOSITION_STATS_CONTRACT = TUTORIAL_FOREST_COMPOSITION_CONTRACT;

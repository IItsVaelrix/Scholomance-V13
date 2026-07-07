/**
 * tactical-board.compiler.js
 *
 * Battle Board Compiler per PDR §7. Converts an exploration map state
 * into a deterministic BattleBoardState. Uses seeded PRNG for tile
 * assignment following the 70/20/10 distribution rule.
 *
 * Pure logic — no DOM, no side effects.
 * All functions return new values; inputs are never mutated.
 *
 * @module tactical-board.compiler
 */

import { stableHash, createSeededRandom } from '../leyline.engine.js';
import {
  BATTLE_TERRAIN_TYPES,
  TILE_DISTRIBUTION,
  SCHOOL_TERRAIN_TYPES,
  PREMIUM_TERRAIN_TYPES,
  createBattleTile,
} from './tactical-board.tiles.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPILER_VERSION = 'TACTICAL-LATTICE-v1';
const DEFAULT_BOARD_SIZE = 8;
const LARGE_BOARD_SIZE = 10;
const LARGE_BOARD_ENTITY_THRESHOLD = 4;

// ---------------------------------------------------------------------------
// JSDoc Type Definitions
// ---------------------------------------------------------------------------

/**
 * Seed data for deterministic board generation per PDR §19.1.
 * @typedef {Object} BattleBoardSeed
 * @property {string} sourceSceneId
 * @property {string} encounterId
 * @property {string} mapHash
 * @property {{ x: number, y: number, z?: number }} playerPosition
 * @property {string[]} enemySet
 * @property {string} [timestampBucket]
 */

/**
 * Map cell from the exploration layer (input to compiler).
 * @typedef {Object} MapCell
 * @property {number} x
 * @property {number} y
 * @property {number} [z] - Elevation
 * @property {string} terrainType - Exploration terrain identifier
 * @property {boolean} [walkable]
 * @property {boolean} [blocksLineOfSight]
 * @property {string|null} [objectId] - ID of object placed on this cell
 * @property {string} [objectType] - 'building'|'clutter'|'landmark'|'machine'|'hazard'|'decor'
 */

/**
 * Exploration map state (input to compiler).
 * @typedef {Object} MapState
 * @property {string} sceneId
 * @property {number} width
 * @property {number} height
 * @property {MapCell[][]} cells - 2D grid [y][x]
 * @property {{ id: string, type: string, x: number, y: number }[]} [objects]
 */

/**
 * Preserved object in the battle board.
 * @typedef {Object} BattleObject
 * @property {string} id
 * @property {string} type
 * @property {number} x
 * @property {number} y
 * @property {boolean} interactable
 */

/**
 * Unit placement on the battle board.
 * @typedef {Object} BattleUnitPlacement
 * @property {string} entityId
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {'player'|'enemy'} side
 */

/**
 * Full compiled battle board state per PDR §7.3.
 * @typedef {Object} BattleBoardState
 * @property {string} boardId
 * @property {string} sourceSceneId
 * @property {string} encounterSeed
 * @property {'TACTICAL-LATTICE-v1'} compilerVersion
 * @property {number} width
 * @property {number} height
 * @property {import('./tactical-board.tiles.js').BattleTile[]} tiles - Flat array, index = y * width + x
 * @property {BattleUnitPlacement[]} units
 * @property {BattleObject[]} preservedObjects
 * @property {Array<{ id: string, reason: 'clutter'|'building_projection_removed'|'noncombat_decor' }>} removedObjects
 * @property {{ movementMode: 'turn_based_grid', lineOfSight: 'iso_lattice', elevationEnabled: boolean, tileModifiersEnabled: boolean }} rules
 */

// ---------------------------------------------------------------------------
// Terrain Mapping (exploration → battle)
// ---------------------------------------------------------------------------

/**
 * Maps exploration terrain types to battle terrain types.
 * Unknown types fall back to 'normal'.
 * @type {Record<string, import('./tactical-board.tiles.js').BattleTerrainType>}
 */
const TERRAIN_MAP = Object.freeze({
  // Existing tactical.engine.js types
  ice: 'ice',
  voidStone: 'void',
  frozenRuins: 'high_ground',
  manaCrystal: 'rune',
  abyss: 'void',
  snow: 'normal',
  runeTile: 'rune',
  stone: 'normal',
  // PDR native types pass through
  normal: 'normal',
  high_ground: 'high_ground',
  low_ground: 'low_ground',
  blocked: 'blocked',
  hazard: 'hazard',
  void: 'void',
  fire: 'fire',
  sonic: 'sonic',
  holy: 'holy',
  null: 'null',
  rune: 'rune',
  anchor: 'anchor',
});

/**
 * Object types preserved in battle projection.
 * @type {ReadonlySet<string>}
 */
const PRESERVED_OBJECT_TYPES = new Set([
  'landmark', 'machine', 'hazard', 'obelisk', 'pillar',
  'wall', 'crystal', 'spire', 'ritual_stone',
]);

/**
 * Object types removed during battle compilation.
 * @type {Record<string, 'clutter'|'building_projection_removed'|'noncombat_decor'>}
 */
const REMOVAL_REASONS = Object.freeze({
  building: 'building_projection_removed',
  clutter: 'clutter',
  decor: 'noncombat_decor',
  furniture: 'clutter',
  sign: 'noncombat_decor',
});

// ---------------------------------------------------------------------------
// Board Dimensions (PDR §24.3)
// ---------------------------------------------------------------------------

/**
 * Computes battle board dimensions from map state.
 * 8×8 for small encounters, 10×10 when entity count exceeds threshold.
 *
 * @param {MapState} mapState
 * @param {BattleBoardSeed} [seed]
 * @returns {{ width: number, height: number }}
 */
export function getBoardDimensions(mapState, seed) {
  const entityCount = (seed?.enemySet?.length || 0) + 1; // +1 for player
  const base = entityCount > LARGE_BOARD_ENTITY_THRESHOLD
    ? LARGE_BOARD_SIZE
    : DEFAULT_BOARD_SIZE;

  // Clamp to map dimensions if map is smaller
  const width = Math.min(base, mapState?.width || base);
  const height = Math.min(base, mapState?.height || base);

  return { width, height };
}

// ---------------------------------------------------------------------------
// Core Compiler
// ---------------------------------------------------------------------------

/**
 * Compiles a BattleBoardState from an exploration map and encounter seed.
 * Deterministic: same inputs always produce the same output.
 *
 * @param {BattleBoardSeed} seed
 * @param {MapState} mapState
 * @returns {BattleBoardState}
 */
export function compileBattleBoard(seed, mapState) {
  const { width, height } = getBoardDimensions(mapState, seed);

  // Deterministic seed from encounter identity
  const seedString = `${seed.sourceSceneId}:${seed.encounterId}:${seed.mapHash}:${COMPILER_VERSION}`;
  const hashValue = stableHash(seedString);
  const rng = createSeededRandom(hashValue);

  // Build board ID
  const boardId = `board-${hashValue.toString(36)}`;

  // Compute tile budgets per PDR §10 (70/20/10)
  const totalTiles = width * height;
  const schoolBudget = Math.round(totalTiles * TILE_DISTRIBUTION.school);
  const premiumBudget = Math.round(totalTiles * TILE_DISTRIBUTION.premium);

  // Distribute school and premium tiles via seeded assignment
  const offsetX = Math.max(0, Math.min(
    (mapState?.width || width) - width,
    Math.round((seed.playerPosition?.x || 0) - width / 2)
  ));
  const offsetY = Math.max(0, Math.min(
    (mapState?.height || height) - height,
    Math.round((seed.playerPosition?.y || 0) - height / 2)
  ));

  const specialAssignments = buildSpecialAssignments(
    width, height, schoolBudget, premiumBudget, rng, seed, mapState, offsetX, offsetY
  );

  // Build tiles
  const tiles = [];
  const preservedObjects = [];
  const removedObjects = [];

  for (let by = 0; by < height; by++) {
    for (let bx = 0; bx < width; bx++) {
      const mapX = bx + offsetX;
      const mapY = by + offsetY;
      const cell = getMapCell(mapState, mapX, mapY);

      // Process objects on this cell
      if (cell && cell.objectId) {
        const objType = cell.objectType || 'clutter';
        if (PRESERVED_OBJECT_TYPES.has(objType)) {
          preservedObjects.push({
            id: cell.objectId,
            type: objType,
            x: bx,
            y: by,
            interactable: true,
          });
        } else {
          removedObjects.push({
            id: cell.objectId,
            reason: REMOVAL_REASONS[objType] || 'clutter',
          });
        }
      }

      // Determine terrain
      const coordKey = `${bx},${by}`;
      let terrain = specialAssignments[coordKey] || mapTerrainToBattle(cell);
      const elevation = computeElevation(cell, terrain);

      // Override terrain to blocked if preserved object is a wall/pillar
      const preservedHere = preservedObjects.find(
        (o) => o.x === bx && o.y === by && (o.type === 'wall' || o.type === 'pillar')
      );
      if (preservedHere) {
        terrain = 'blocked';
      }

      tiles.push(createBattleTile(bx, by, elevation, terrain));
    }
  }

  // Place units on valid cells
  const units = placeUnits(seed, tiles, width, height, rng);

  return {
    boardId,
    sourceSceneId: seed.sourceSceneId,
    encounterSeed: `${seed.encounterId}:${seed.mapHash}`,
    compilerVersion: COMPILER_VERSION,
    width,
    height,
    tiles,
    units,
    preservedObjects,
    removedObjects,
    rules: {
      movementMode: 'turn_based_grid',
      lineOfSight: 'iso_lattice',
      elevationEnabled: true,
      tileModifiersEnabled: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a map of (x,y) → special terrain assignments respecting budgets.
 * @param {number} width
 * @param {number} height
 * @param {number} schoolBudget
 * @param {number} premiumBudget
 * @param {function(): number} rng
 * @param {BattleBoardSeed} seed
 * @returns {Record<string, import('./tactical-board.tiles.js').BattleTerrainType>}
 */
const LANDMARK_SCHOOL_BIAS = Object.freeze({
  fire: ['fire'],
  void: ['void'],
  voidStone: ['void'],
  abyss: ['void'],
  ice: ['ice'],
  snow: ['ice'],
  sonic: ['sonic'],
  rune: ['rune'],
  runeTile: ['rune'],
  anchor: ['anchor'],
  holy: ['holy'],
  stone: ['sonic', 'rune'],
  frozenRuins: ['ice'],
  manaCrystal: ['rune'],
});

const LANDMARK_PREMIUM_BIAS = Object.freeze({
  obelisk: ['anchor', 'rune'],
  landmark: ['anchor', 'rune'],
  machine: ['rune', 'null'],
  ritual_stone: ['anchor', 'rune'],
  spire: ['rune', 'null'],
});

function pickBiasedTerrain(pool, rng, allowed) {
  if (!pool?.length || !allowed?.length) return null;
  const filtered = pool.filter((terrain) => allowed.includes(terrain));
  if (!filtered.length) return null;
  return filtered[Math.floor(rng() * filtered.length)];
}

function getLandmarkBiasForCell(cell) {
  if (!cell) return { school: null, premium: null };

  const terrainPool = LANDMARK_SCHOOL_BIAS[cell.terrainType];
  const objectPool = cell.objectType ? LANDMARK_PREMIUM_BIAS[cell.objectType] : null;

  return {
    school: terrainPool || null,
    premium: objectPool || terrainPool || null,
  };
}

function buildSpecialAssignments(width, height, schoolBudget, premiumBudget, rng, seed, mapState, offsetX, offsetY) {
  const assignments = {};
  const allCoords = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      allCoords.push(`${x},${y}`);
    }
  }

  for (let i = allCoords.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = allCoords[i];
    allCoords[i] = allCoords[j];
    allCoords[j] = tmp;
  }

  let schoolCount = 0;
  let premiumCount = 0;
  let coordIndex = 0;

  while (schoolCount < schoolBudget && coordIndex < allCoords.length) {
    const coord = allCoords[coordIndex];
    coordIndex++;
    const [bx, by] = coord.split(',').map(Number);
    const cell = getMapCell(mapState, bx + offsetX, by + offsetY);
    const bias = getLandmarkBiasForCell(cell);
    const biased = pickBiasedTerrain(bias.school, rng, SCHOOL_TERRAIN_TYPES);
    assignments[coord] = biased || SCHOOL_TERRAIN_TYPES[Math.floor(rng() * SCHOOL_TERRAIN_TYPES.length)];
    schoolCount++;
  }

  while (premiumCount < premiumBudget && coordIndex < allCoords.length) {
    const coord = allCoords[coordIndex];
    coordIndex++;
    const [bx, by] = coord.split(',').map(Number);
    const cell = getMapCell(mapState, bx + offsetX, by + offsetY);
    const bias = getLandmarkBiasForCell(cell);
    const biased = pickBiasedTerrain(bias.premium, rng, PREMIUM_TERRAIN_TYPES);
    assignments[coord] = biased || PREMIUM_TERRAIN_TYPES[Math.floor(rng() * PREMIUM_TERRAIN_TYPES.length)];
    premiumCount++;
  }

  return assignments;
}

/**
 * Maps an exploration terrain type to a battle terrain type.
 * @param {MapCell|null} cell
 * @returns {import('./tactical-board.tiles.js').BattleTerrainType}
 */
function mapTerrainToBattle(cell) {
  if (!cell) return 'normal';
  return TERRAIN_MAP[cell.terrainType] || 'normal';
}

/**
 * Computes elevation from map cell and battle terrain.
 * @param {MapCell|null} cell
 * @param {import('./tactical-board.tiles.js').BattleTerrainType} terrain
 * @returns {number}
 */
function computeElevation(cell, terrain) {
  if (cell?.z !== undefined && cell.z !== null) return cell.z;
  if (terrain === 'high_ground') return 3;
  if (terrain === 'low_ground') return 0;
  return 1;
}

/**
 * Retrieves a cell from the map state, with bounds checking.
 * @param {MapState|null} mapState
 * @param {number} x
 * @param {number} y
 * @returns {MapCell|null}
 */
function getMapCell(mapState, x, y) {
  if (!mapState?.cells) return null;
  if (y < 0 || y >= mapState.cells.length) return null;
  const row = mapState.cells[y];
  if (!row || x < 0 || x >= row.length) return null;
  return row[x];
}

/**
 * Places units on valid (walkable, unoccupied) tiles.
 * Player placed near their original position; enemies on opposite side.
 *
 * @param {BattleBoardSeed} seed
 * @param {import('./tactical-board.tiles.js').BattleTile[]} tiles
 * @param {number} width
 * @param {number} height
 * @param {function(): number} rng
 * @returns {BattleUnitPlacement[]}
 */
function placeUnits(seed, tiles, width, height, rng) {
  const units = [];
  const occupied = new Set();

  /**
   * @param {number} x
   * @param {number} y
   * @returns {import('./tactical-board.tiles.js').BattleTile|null}
   */
  const getTile = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return null;
    return tiles[y * width + x] || null;
  };

  /**
   * Finds the nearest valid spawn tile to target coords.
   * @param {number} targetX
   * @param {number} targetY
   * @returns {{ x: number, y: number, z: number }|null}
   */
  const findSpawn = (targetX, targetY) => {
    // BFS outward from target
    const queue = [{ x: targetX, y: targetY }];
    const visited = new Set();
    visited.add(`${targetX},${targetY}`);

    while (queue.length > 0) {
      const { x, y } = queue.shift();
      const key = `${x},${y}`;
      const tile = getTile(x, y);

      if (tile && tile.walkable && !occupied.has(key)) {
        occupied.add(key);
        return { x, y, z: tile.z };
      }

      // Expand neighbors
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        const nk = `${nx},${ny}`;
        if (!visited.has(nk) && nx >= 0 && nx < width && ny >= 0 && ny < height) {
          visited.add(nk);
          queue.push({ x: nx, y: ny });
        }
      }
    }
    return null;
  };

  // Place player near bottom-center
  const playerTargetX = Math.min(width - 1, Math.max(0, Math.round(width / 2)));
  const playerTargetY = Math.min(height - 1, Math.max(0, height - 2));
  const playerSpawn = findSpawn(playerTargetX, playerTargetY);
  if (playerSpawn) {
    units.push({
      entityId: 'player',
      x: playerSpawn.x,
      y: playerSpawn.y,
      z: playerSpawn.z,
      side: 'player',
    });
  }

  // Place enemies near top
  const enemies = seed.enemySet || [];
  for (let i = 0; i < enemies.length; i++) {
    const ex = Math.min(width - 1, Math.max(0, Math.round((i + 1) * width / (enemies.length + 1))));
    const ey = Math.min(height - 1, Math.max(0, 1 + Math.floor(rng() * 2)));
    const spawn = findSpawn(ex, ey);
    if (spawn) {
      units.push({
        entityId: enemies[i],
        x: spawn.x,
        y: spawn.y,
        z: spawn.z,
        side: 'enemy',
      });
    }
  }

  return units;
}

// ---------------------------------------------------------------------------
// Board Hash (deterministic verification)
// ---------------------------------------------------------------------------

/**
 * Computes a deterministic hash of a BattleBoardState for testing.
 * Same board always produces the same hash.
 *
 * @param {BattleBoardState} boardState
 * @returns {number}
 */
export function computeBoardHash(boardState) {
  const parts = [
    boardState.compilerVersion,
    String(boardState.width),
    String(boardState.height),
    boardState.sourceSceneId,
    boardState.encounterSeed,
  ];

  // Include every tile's terrain and position
  for (const tile of boardState.tiles) {
    parts.push(`${tile.x}:${tile.y}:${tile.z}:${tile.terrain}`);
  }

  // Include unit placements
  for (const unit of boardState.units) {
    parts.push(`${unit.entityId}@${unit.x},${unit.y},${unit.z}:${unit.side}`);
  }

  return stableHash(parts.join('|'));
}

// ---------------------------------------------------------------------------
// Default Export Bundle
// ---------------------------------------------------------------------------

export default {
  compileBattleBoard,
  computeBoardHash,
  getBoardDimensions,
};

/**
 * tactical-board.threat-map.js
 *
 * Threat zone computation per PDR §11.2. Computes threat maps, control
 * maps, movement ranges (BFS with movement costs), spell ranges with
 * line-of-sight, and per-tile danger scores.
 *
 * Pure logic — no DOM, no side effects, no randomness.
 * All functions return new values; inputs are never mutated.
 *
 * @module tactical-board.threat-map
 */

import { hasLineOfSight } from '../tactical.engine.js';
import { BATTLE_TERRAIN_TYPES } from './tactical-board.tiles.js';

// ---------------------------------------------------------------------------
// JSDoc Type Definitions (PDR §11.2)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ThreatEntry
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {string[]} controlledBy - Entity IDs that threaten this tile
 * @property {'melee'|'spell'|'ranged'|'hazard'|'aura'} threatType
 * @property {number} dangerScore - Composite danger value (higher = more dangerous)
 */

/**
 * Full threat map per PDR §11.2.
 * @typedef {Object} ThreatMap
 * @property {ThreatEntry[]} controlledTiles
 */

/**
 * Control map entry for a single tile.
 * @typedef {Object} ControlEntry
 * @property {number} x
 * @property {number} y
 * @property {'player'|'enemy'|'contested'|'neutral'} control
 * @property {string[]} playerEntities - Player entity IDs that influence this tile
 * @property {string[]} enemyEntities - Enemy entity IDs that influence this tile
 */

/**
 * A battle entity with the fields needed for threat computation.
 * @typedef {Object} ThreatEntity
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} [z]
 * @property {'player'|'enemy'} side
 * @property {number} [movementRange] - Movement budget (tiles)
 * @property {number} [spellRange] - Spell reach (tiles)
 * @property {number} [meleeRange] - Melee reach (default 1)
 * @property {number} [attack] - Attack power for danger weighting
 * @property {number} [spellPower] - Spell power for danger weighting
 * @property {string} [threatType] - Primary threat type override
 */

/**
 * Reachable tile from BFS movement.
 * @typedef {Object} ReachableTile
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} costToReach - Total movement cost to reach this tile
 */

// ---------------------------------------------------------------------------
// Tile Lookup Helper
// ---------------------------------------------------------------------------

/**
 * Creates a tile lookup function from a board state.
 * @param {import('./tactical-board.compiler.js').BattleBoardState} boardState
 * @returns {function({ x: number, y: number }): import('./tactical-board.tiles.js').BattleTile|null}
 */
function makeTileLookup(boardState) {
  const { width, height, tiles } = boardState;
  return ({ x, y }) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return null;
    return tiles[y * width + x] || null;
  };
}

function makeLosTileLookup(boardState) {
  const getTile = makeTileLookup(boardState);
  return (coord) => {
    const tile = getTile(coord);
    if (!tile) return null;
    return { lineOfSightBlock: tile.blocksLineOfSight };
  };
}

// ---------------------------------------------------------------------------
// Movement Range (BFS with movement costs)
// ---------------------------------------------------------------------------

/**
 * Computes all tiles reachable by an entity within its movement budget.
 * Uses BFS with per-tile movement costs from the terrain definition.
 *
 * @param {ThreatEntity} entity
 * @param {import('./tactical-board.compiler.js').BattleBoardState} boardState
 * @returns {ReachableTile[]}
 */
export function getMovementRange(entity, boardState) {
  const budget = entity.movementRange || 3;
  const getTile = makeTileLookup(boardState);
  const startTile = getTile({ x: entity.x, y: entity.y });
  if (!startTile) return [];

  /** @type {Map<string, number>} */
  const bestCost = new Map();
  const startKey = `${entity.x},${entity.y}`;
  bestCost.set(startKey, 0);

  /** @type {Array<{ x: number, y: number, cost: number }>} */
  const queue = [{ x: entity.x, y: entity.y, cost: 0 }];

  /** @type {ReachableTile[]} */
  const result = [];

  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (queue.length > 0) {
    // Simple priority: sort by cost ascending (small boards make this fine)
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();

    for (const [dx, dy] of dirs) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const tile = getTile({ x: nx, y: ny });
      if (!tile || !tile.walkable) continue;

      const moveCost = tile.movementCost || 1;
      const totalCost = current.cost + moveCost;
      if (totalCost > budget) continue;

      const key = `${nx},${ny}`;
      const prev = bestCost.get(key);
      if (prev !== undefined && prev <= totalCost) continue;

      bestCost.set(key, totalCost);
      queue.push({ x: nx, y: ny, cost: totalCost });
      result.push({ x: nx, y: ny, z: tile.z, costToReach: totalCost });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Spell Range (with LOS)
// ---------------------------------------------------------------------------

/**
 * Computes all tiles targetable by a spell from the entity's position,
 * considering range and line-of-sight.
 *
 * @param {ThreatEntity} entity
 * @param {number} spellRange - Maximum spell range in tiles
 * @param {import('./tactical-board.compiler.js').BattleBoardState} boardState
 * @returns {Array<{ x: number, y: number, z: number }>}
 */
export function getSpellRange(entity, spellRange, boardState) {
  const range = spellRange || entity.spellRange || 3;
  const getTile = makeTileLookup(boardState);
  const getLosTile = makeLosTileLookup(boardState);
  const origin = { x: entity.x, y: entity.y };
  const result = [];

  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      if (dx === 0 && dy === 0) continue;

      const dist = Math.abs(dx) + Math.abs(dy); // Manhattan distance
      if (dist > range) continue;

      const tx = entity.x + dx;
      const ty = entity.y + dy;
      const tile = getTile({ x: tx, y: ty });
      if (!tile) continue;

      const target = { x: tx, y: ty };
      if (hasLineOfSight(origin, target, getLosTile)) {
        result.push({ x: tx, y: ty, z: tile.z });
      }
    }
  }

  return result;
}

/**
 * Returns tiles visible from an entity position (line-of-sight overlay).
 *
 * @param {ThreatEntity} entity
 * @param {number} sightRange
 * @param {import('./tactical-board.compiler.js').BattleBoardState} boardState
 * @returns {Array<{ x: number, y: number, z: number }>}
 */
export function getVisibleTiles(entity, sightRange, boardState) {
  return getSpellRange(entity, sightRange, boardState);
}

// ---------------------------------------------------------------------------
// Threat Zone for a Single Entity
// ---------------------------------------------------------------------------

/**
 * Computes the threat zone for a single entity — all tiles it can
 * attack from its current position (melee) or spell reach (ranged).
 *
 * @param {ThreatEntity} entity
 * @param {import('./tactical-board.compiler.js').BattleBoardState} boardState
 * @returns {ThreatEntry[]}
 */
export function computeEntityThreatZone(entity, boardState) {
  const getTile = makeTileLookup(boardState);
  const entries = [];
  const seen = new Set();

  const meleeRange = entity.meleeRange || 1;
  const power = entity.attack || entity.spellPower || 5;
  const primaryType = entity.threatType || (entity.spellRange > 1 ? 'spell' : 'melee');

  // Melee threat: adjacent tiles within melee range
  for (let dy = -meleeRange; dy <= meleeRange; dy++) {
    for (let dx = -meleeRange; dx <= meleeRange; dx++) {
      if (dx === 0 && dy === 0) continue;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > meleeRange) continue;

      const tx = entity.x + dx;
      const ty = entity.y + dy;
      const tile = getTile({ x: tx, y: ty });
      if (!tile) continue;

      const key = `${tx},${ty}`;
      if (seen.has(key)) continue;
      seen.add(key);

      entries.push({
        x: tx,
        y: ty,
        z: tile.z,
        controlledBy: [entity.id],
        threatType: 'melee',
        dangerScore: power * (1 / Math.max(1, dist)),
      });
    }
  }

  // Spell/ranged threat
  if (entity.spellRange && entity.spellRange > 0) {
    const spellTiles = getSpellRange(entity, entity.spellRange, boardState);
    for (const st of spellTiles) {
      const key = `${st.x},${st.y}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const dist = Math.abs(st.x - entity.x) + Math.abs(st.y - entity.y);
      entries.push({
        x: st.x,
        y: st.y,
        z: st.z,
        controlledBy: [entity.id],
        threatType: primaryType,
        dangerScore: (entity.spellPower || power) * (1 / Math.max(1, dist)),
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Full Threat Map
// ---------------------------------------------------------------------------

/**
 * Computes the full threat map for all entities on the board.
 * Merges per-entity threat zones into a unified map.
 *
 * @param {import('./tactical-board.compiler.js').BattleBoardState} boardState
 * @param {ThreatEntity[]} entities
 * @returns {ThreatMap}
 */
export function computeThreatMap(boardState, entities) {
  /** @type {Map<string, ThreatEntry>} */
  const merged = new Map();

  for (const entity of entities) {
    const zone = computeEntityThreatZone(entity, boardState);
    for (const entry of zone) {
      const key = `${entry.x},${entry.y}`;
      const existing = merged.get(key);
      if (existing) {
        // Merge: add entity to controlledBy, keep highest danger and most aggressive type
        const mergedControlled = [...existing.controlledBy];
        for (const id of entry.controlledBy) {
          if (!mergedControlled.includes(id)) mergedControlled.push(id);
        }
        merged.set(key, {
          ...existing,
          controlledBy: mergedControlled,
          dangerScore: existing.dangerScore + entry.dangerScore,
          threatType: compareThreatPriority(existing.threatType, entry.threatType),
        });
      } else {
        merged.set(key, { ...entry });
      }
    }
  }

  return { controlledTiles: Array.from(merged.values()) };
}

/**
 * Returns the higher-priority threat type.
 * @param {'melee'|'spell'|'ranged'|'hazard'|'aura'} a
 * @param {'melee'|'spell'|'ranged'|'hazard'|'aura'} b
 * @returns {'melee'|'spell'|'ranged'|'hazard'|'aura'}
 */
const THREAT_PRIORITY = { hazard: 4, spell: 3, ranged: 2, melee: 1, aura: 0 };

function compareThreatPriority(a, b) {
  return (THREAT_PRIORITY[a] || 0) >= (THREAT_PRIORITY[b] || 0) ? a : b;
}

// ---------------------------------------------------------------------------
// Control Map
// ---------------------------------------------------------------------------

/**
 * Computes a per-tile control map: which side controls each tile.
 * A tile is 'contested' if threatened by both sides.
 *
 * @param {import('./tactical-board.compiler.js').BattleBoardState} boardState
 * @param {ThreatEntity[]} entities
 * @returns {ControlEntry[]}
 */
export function computeControlMap(boardState, entities) {
  /** @type {Map<string, { playerEntities: string[], enemyEntities: string[] }>} */
  const influence = new Map();

  for (const entity of entities) {
    const zone = computeEntityThreatZone(entity, boardState);
    for (const entry of zone) {
      const key = `${entry.x},${entry.y}`;
      const current = influence.get(key) || { playerEntities: [], enemyEntities: [] };

      if (entity.side === 'player') {
        if (!current.playerEntities.includes(entity.id)) {
          current.playerEntities.push(entity.id);
        }
      } else {
        if (!current.enemyEntities.includes(entity.id)) {
          current.enemyEntities.push(entity.id);
        }
      }

      influence.set(key, current);
    }
  }

  const result = [];
  for (const [key, inf] of influence.entries()) {
    const [xStr, yStr] = key.split(',');
    const x = Number(xStr);
    const y = Number(yStr);

    let control = 'neutral';
    if (inf.playerEntities.length > 0 && inf.enemyEntities.length > 0) {
      control = 'contested';
    } else if (inf.playerEntities.length > 0) {
      control = 'player';
    } else if (inf.enemyEntities.length > 0) {
      control = 'enemy';
    }

    result.push({
      x,
      y,
      control,
      playerEntities: inf.playerEntities,
      enemyEntities: inf.enemyEntities,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Danger Score
// ---------------------------------------------------------------------------

/**
 * Computes how dangerous a specific tile is based on the threat map.
 * Returns 0 if the tile is not threatened.
 *
 * @param {{ x: number, y: number }} tile
 * @param {ThreatMap} threatMap
 * @returns {number}
 */
export function computeDangerScore(tile, threatMap) {
  const entry = threatMap.controlledTiles.find(
    (e) => e.x === tile.x && e.y === tile.y
  );
  return entry ? entry.dangerScore : 0;
}

// ---------------------------------------------------------------------------
// Default Export Bundle
// ---------------------------------------------------------------------------

export default {
  computeThreatMap,
  computeEntityThreatZone,
  computeControlMap,
  getMovementRange,
  getSpellRange,
  getVisibleTiles,
  computeDangerScore,
};

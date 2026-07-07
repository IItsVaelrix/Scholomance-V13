/**
 * tactical-board.ai.js
 *
 * Enemy AI tile awareness for the Tactical Lattice Battle Board.
 * Implements PDR §16 (Enemy AI) — tile scoring, personality, threat evaluation,
 * flanking, premium tile contesting, and top-level action selection.
 *
 * Pure, deterministic, no DOM/GSAP/audio. JSDoc schemas, immutable returns.
 * Same input → same output. Never mutates inputs.
 */

import { getSchoolTileBonus, resolveTileModifier, computeTileMultiplier } from './tactical-board.modifiers.js';
import { getMovementRange } from './tactical-board.threat-map.js';

// ---------------------------------------------------------------------------
// Type Definitions (JSDoc)
// ---------------------------------------------------------------------------

/**
 * AI tile scoring result per PDR §16.1.
 * @typedef {Object} TileAIScore
 * @property {string} tileId - Tile coordinate id (e.g. "3,4").
 * @property {number} distanceCost - Movement cost penalty (negative).
 * @property {number} offensiveValue - How good for attacking from here.
 * @property {number} defensiveValue - How safe/covered this tile is.
 * @property {number} hazardRisk - Danger of standing here (negative).
 * @property {number} playerDenialValue - Value of denying this tile to the player.
 * @property {number} objectiveValue - Bonus for objective/anchor tiles.
 * @property {number} total - Weighted sum of all factors.
 */

/**
 * AI personality type identifiers.
 * @typedef {'FIRE_CASTER'|'VOID_CULTIST'|'KNIGHT'|'WRAITH'|'HEALER'|'CONSTRUCT'} AIPersonalityType
 */

/**
 * Weight profile for AI tile scoring.
 * @typedef {Object} AIPersonalityWeights
 * @property {number} offensive - Weight for offensive value.
 * @property {number} defensive - Weight for defensive value.
 * @property {number} hazardAversion - Weight for hazard avoidance.
 * @property {number} denialPriority - Weight for player denial.
 * @property {number} objectiveFocus - Weight for objective tiles.
 * @property {number} distanceSensitivity - Weight for movement cost.
 * @property {string[]} preferredTerrains - Terrain types this AI prefers.
 * @property {string[]} preferredSchools - Schools this AI values.
 * @property {boolean} avoidsNull - Whether this AI avoids null tiles.
 * @property {boolean} prefersHighGround - Whether to prioritize elevation.
 * @property {boolean} prefersFlank - Whether to seek flanking positions.
 */

/**
 * @typedef {Object} AIActionDecision
 * @property {'move'|'attack'|'cast'|'wait'} action - Chosen action.
 * @property {string} [targetTileId] - Target tile for move.
 * @property {string} [targetEntityId] - Target entity for attack/cast.
 * @property {string} reason - Human-readable decision rationale.
 * @property {number} confidence - 0-1 confidence in this decision.
 */

/**
 * Minimal board state shape expected by AI functions.
 * @typedef {Object} AIBoardState
 * @property {number} width - Board width.
 * @property {number} height - Board height.
 * @property {Array<Object>} tiles - Flat or nested tile array.
 * @property {Array<Object>} entities - All battle entities.
 * @property {number} turnCount - Current turn number.
 * @property {function(number, number): Object} [getTile] - Tile accessor.
 */

// ---------------------------------------------------------------------------
// AI Personality Weights — PDR §16.3
// ---------------------------------------------------------------------------

/**
 * Personality weight profiles for each enemy type per PDR §16.3.
 * @type {Record<AIPersonalityType, AIPersonalityWeights>}
 */
export const AI_PERSONALITY_WEIGHTS = Object.freeze({
  FIRE_CASTER: Object.freeze({
    offensive: 1.5,
    defensive: 0.6,
    hazardAversion: 0.4,
    denialPriority: 0.8,
    objectiveFocus: 0.7,
    distanceSensitivity: 0.8,
    preferredTerrains: ['fire', 'rune', 'high_ground'],
    preferredSchools: ['FIRE'],
    avoidsNull: true,
    prefersHighGround: true,
    prefersFlank: false,
  }),
  VOID_CULTIST: Object.freeze({
    offensive: 1.2,
    defensive: 0.8,
    hazardAversion: 0.3,
    denialPriority: 1.0,
    objectiveFocus: 1.2,
    distanceSensitivity: 0.6,
    preferredTerrains: ['void', 'anchor', 'null'],
    preferredSchools: ['VOID'],
    avoidsNull: false,
    prefersHighGround: false,
    prefersFlank: false,
  }),
  KNIGHT: Object.freeze({
    offensive: 1.0,
    defensive: 1.4,
    hazardAversion: 0.8,
    denialPriority: 0.6,
    objectiveFocus: 0.8,
    distanceSensitivity: 1.0,
    preferredTerrains: ['high_ground', 'stone', 'normal'],
    preferredSchools: [],
    avoidsNull: false,
    prefersHighGround: true,
    prefersFlank: false,
  }),
  WRAITH: Object.freeze({
    offensive: 1.3,
    defensive: 0.5,
    hazardAversion: 0.2,
    denialPriority: 0.4,
    objectiveFocus: 0.3,
    distanceSensitivity: 0.4,
    preferredTerrains: ['void', 'hazard'],
    preferredSchools: ['VOID'],
    avoidsNull: true,
    prefersHighGround: false,
    prefersFlank: true,
  }),
  HEALER: Object.freeze({
    offensive: 0.3,
    defensive: 1.6,
    hazardAversion: 1.2,
    denialPriority: 0.5,
    objectiveFocus: 0.9,
    distanceSensitivity: 1.2,
    preferredTerrains: ['holy', 'rune'],
    preferredSchools: ['HOLY'],
    avoidsNull: true,
    prefersHighGround: false,
    prefersFlank: false,
  }),
  CONSTRUCT: Object.freeze({
    offensive: 1.1,
    defensive: 1.2,
    hazardAversion: 0.6,
    denialPriority: 0.7,
    objectiveFocus: 1.0,
    distanceSensitivity: 1.3,
    preferredTerrains: ['sonic', 'stone', 'anchor'],
    preferredSchools: ['SONIC'],
    avoidsNull: false,
    prefersHighGround: false,
    prefersFlank: false,
  }),
});

// ---------------------------------------------------------------------------
// Terrain Classification Constants
// ---------------------------------------------------------------------------

/** Terrain types considered hazardous. */
const HAZARD_TERRAINS = Object.freeze(['hazard', 'abyss']);

/** Terrain types considered premium (worth contesting). */
const PREMIUM_TERRAINS = Object.freeze(['rune', 'runeTile', 'anchor', 'fire', 'void', 'holy', 'sonic', 'ice']);

/** Terrain types considered null/denial. */
const NULL_TERRAINS = Object.freeze(['null']);

/** Terrain types that grant elevation advantage. */
const HIGH_GROUND_TERRAINS = Object.freeze(['high_ground', 'frozenRuins']);

// ---------------------------------------------------------------------------
// Geometry Utilities
// ---------------------------------------------------------------------------

/**
 * Manhattan distance between two points.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @returns {number}
 */
function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Chebyshev (king-move) distance between two points.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @returns {number}
 */
function chebyshevDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Returns tile id string from coordinates.
 * @param {number} x
 * @param {number} y
 * @returns {string}
 */
function toBattleBoardState(boardState) {
  if (!boardState?.width || !boardState?.height) return null;
  return {
    width: boardState.width,
    height: boardState.height,
    tiles: boardState.tiles,
    units: boardState.units || boardState.entities || [],
  };
}

function getReachableTilesForEntity(entity, boardState) {
  const battleBoard = toBattleBoardState(boardState);
  if (!battleBoard) return [];

  const movementRange = entity.stats?.movement || entity.movement || 3;
  const ex = entity.x ?? entity.position?.x ?? 0;
  const ey = entity.y ?? entity.position?.y ?? 0;
  const reachable = getMovementRange({
    id: entity.id || 'ai',
    x: ex,
    y: ey,
    movementRange,
  }, battleBoard);

  const getTile = boardState.getTile
    || ((x, y) => battleBoard.tiles[y * battleBoard.width + x]);

  return reachable
    .map((coord) => getTile(coord.x, coord.y))
    .filter(Boolean);
}

function tileId(x, y) {
  return `${x},${y}`;
}

// ---------------------------------------------------------------------------
// Core AI Scoring Functions
// ---------------------------------------------------------------------------

/**
 * Scores a tile for AI decision-making.
 * Main AI tile scoring function per PDR §16.1.
 *
 * @param {Object} tile - The tile to score.
 * @param {Object} entity - The AI entity evaluating the tile.
 * @param {AIBoardState} boardState - Current board state.
 * @param {{ personality?: AIPersonalityWeights, playerEntities?: Object[] }} [options]
 * @returns {TileAIScore}
 */
export function scoreTileForAI(tile, entity, boardState, options = {}) {
  const personality = options.personality || AI_PERSONALITY_WEIGHTS.KNIGHT;
  const playerEntities = options.playerEntities || getPlayerEntities(boardState, entity);

  const tx = tile.x ?? tile.position?.x ?? 0;
  const ty = tile.y ?? tile.position?.y ?? 0;
  const ex = entity.x ?? entity.position?.x ?? 0;
  const ey = entity.y ?? entity.position?.y ?? 0;
  const terrain = tile.terrain || tile.terrainType || 'normal';
  const tileHeight = tile.z ?? tile.height ?? 0;

  // --- Distance Cost ---
  const rawDistance = manhattanDistance({ x: tx, y: ty }, { x: ex, y: ey });
  const moveCost = tile.movementCost || 1;
  const distanceCost = -(rawDistance * moveCost * personality.distanceSensitivity);

  // --- Offensive Value ---
  let offensiveValue = 0;

  // School matching bonus
  const entitySchool = entity.school || entity.element || '';
  const tileSchool = tile.modifier?.school || schoolFromTerrain(terrain);
  if (tileSchool) {
    const bonus = getSchoolTileBonus(tileSchool, entitySchool);
    offensiveValue += bonus * 100; // Convert fraction to score points
  }

  // Preferred terrain bonus
  if (personality.preferredTerrains.includes(terrain)) {
    offensiveValue += 15;
  }

  // High ground bonus for ranged/casters
  if (personality.prefersHighGround && (tileHeight >= 3 || HIGH_GROUND_TERRAINS.includes(terrain))) {
    offensiveValue += 12;
  }

  // Proximity to player entities (closer = higher offensive opportunity)
  const closestPlayerDist = getClosestPlayerDistance(tx, ty, playerEntities);
  const entityRange = entity.stats?.range || entity.range || 1;
  if (closestPlayerDist > 0 && closestPlayerDist <= entityRange + 1) {
    offensiveValue += 10;
  }

  // Tile modifier value
  const modifier = resolveTileModifier(tile, entitySchool, 'cast');
  if (modifier) {
    const mult = computeTileMultiplier(modifier, entitySchool);
    offensiveValue += (mult - 1.0) * 50; // Scale modifier impact
  }

  // --- Defensive Value ---
  let defensiveValue = 0;

  // Height advantage = harder to hit
  if (tileHeight >= 2) {
    defensiveValue += tileHeight * 4;
  }

  // Distance from nearest player = safer
  if (closestPlayerDist > 2) {
    defensiveValue += Math.min(10, (closestPlayerDist - 2) * 3);
  }

  // Cover / LOS blocking adjacent tiles
  if (tile.lineOfSightBlock || tile.blocksLineOfSight) {
    defensiveValue += 8;
  }

  // --- Hazard Risk ---
  let hazardRisk = 0;

  if (HAZARD_TERRAINS.includes(terrain)) {
    hazardRisk = -20 * personality.hazardAversion;
  }

  // Null tile avoidance for caster-based AIs — PDR §16.2
  if (NULL_TERRAINS.includes(terrain) && personality.avoidsNull) {
    hazardRisk += -15;
  }

  // --- Player Denial Value ---
  let playerDenialValue = 0;

  // Premium tiles that player can also reach are worth denying — PDR §16.2
  if (PREMIUM_TERRAINS.includes(terrain)) {
    const playerCanReach = canAnyPlayerReach(tx, ty, playerEntities, boardState);
    if (playerCanReach) {
      playerDenialValue += 12;
    }
  }

  // Rune tile denial is specifically called out in PDR §16.2
  if (terrain === 'rune' || terrain === 'runeTile') {
    playerDenialValue += 8;
  }

  // --- Objective Value ---
  let objectiveValue = 0;

  if (tile.isObjectiveTile) {
    objectiveValue += 20;
  }

  if (terrain === 'anchor') {
    objectiveValue += 15;
  }

  // --- Weighted Total ---
  const total = Math.round(
    (offensiveValue * personality.offensive)
    + (defensiveValue * personality.defensive)
    + (hazardRisk) // already weighted by hazardAversion
    + (playerDenialValue * personality.denialPriority)
    + (objectiveValue * personality.objectiveFocus)
    + distanceCost
  );

  return {
    tileId: tileId(tx, ty),
    distanceCost: Math.round(distanceCost),
    offensiveValue: Math.round(offensiveValue),
    defensiveValue: Math.round(defensiveValue),
    hazardRisk: Math.round(hazardRisk),
    playerDenialValue: Math.round(playerDenialValue),
    objectiveValue: Math.round(objectiveValue),
    total,
  };
}

/**
 * Selects the highest-scoring reachable tile for an AI entity.
 *
 * @param {Object} entity - The AI entity.
 * @param {Object[]} reachableTiles - Tiles within movement range.
 * @param {AIBoardState} boardState - Current board state.
 * @param {AIPersonalityType|AIPersonalityWeights} personality - Personality type or weights.
 * @returns {{ tile: Object, score: TileAIScore } | null}
 */
export function selectBestTile(entity, reachableTiles, boardState, personality) {
  if (!Array.isArray(reachableTiles) || reachableTiles.length === 0) return null;

  const weights = typeof personality === 'string'
    ? AI_PERSONALITY_WEIGHTS[personality] || AI_PERSONALITY_WEIGHTS.KNIGHT
    : personality || AI_PERSONALITY_WEIGHTS.KNIGHT;

  const playerEntities = getPlayerEntities(boardState, entity);

  let bestTile = null;
  let bestScore = null;

  for (const tile of reachableTiles) {
    // Skip occupied tiles (unless it's the entity's own tile)
    const occupant = tile.occupantId || tile.control?.occupiedBy;
    const entityId = entity.id || '';
    if (occupant && occupant !== entityId) continue;

    // Skip unwalkable tiles
    if (tile.walkable === false) continue;

    const score = scoreTileForAI(tile, entity, boardState, {
      personality: weights,
      playerEntities,
    });

    if (!bestScore || score.total > bestScore.total) {
      bestTile = tile;
      bestScore = score;
    }
  }

  if (!bestTile) return null;

  return { tile: bestTile, score: bestScore };
}

/**
 * Determines whether AI should fight for a premium tile.
 * Per PDR §16.2: "contest premium tiles".
 *
 * @param {Object} tile - The tile to evaluate.
 * @param {Object} entity - The AI entity.
 * @param {AIBoardState} boardState - Current board state.
 * @returns {{ shouldContest: boolean, reason: string, urgency: number }}
 */
export function shouldContestTile(tile, entity, boardState) {
  const terrain = tile.terrain || tile.terrainType || 'normal';

  // Only premium tiles are worth contesting
  if (!PREMIUM_TERRAINS.includes(terrain)) {
    return { shouldContest: false, reason: 'Tile is not premium', urgency: 0 };
  }

  const entitySchool = entity.school || entity.element || '';
  const tileSchool = tile.modifier?.school || schoolFromTerrain(terrain);
  const playerEntities = getPlayerEntities(boardState, entity);
  const tx = tile.x ?? tile.position?.x ?? 0;
  const ty = tile.y ?? tile.position?.y ?? 0;

  // Higher urgency if tile matches AI's school
  let urgency = 0.5;
  if (tileSchool && entitySchool) {
    const bonus = getSchoolTileBonus(tileSchool, entitySchool);
    if (bonus > 0.1) urgency += 0.3;
  }

  // Higher urgency if player can reach it soon
  const closestPlayerDist = getClosestPlayerDistance(tx, ty, playerEntities);
  if (closestPlayerDist <= 3) {
    urgency += 0.2;
  }

  // Check HP — don't contest if too injured
  const hpRatio = (entity.hp ?? entity.stats?.health ?? 10) / (entity.maxHp ?? entity.stats?.health ?? 10);
  if (hpRatio < 0.3) {
    return { shouldContest: false, reason: 'Too injured to contest', urgency: 0 };
  }

  // Rune tiles always worth contesting per PDR §16.2
  if (terrain === 'rune' || terrain === 'runeTile') {
    urgency += 0.15;
  }

  return {
    shouldContest: urgency >= 0.5,
    reason: urgency >= 0.5 ? `Premium ${terrain} tile within reach` : 'Insufficient strategic value',
    urgency: Math.min(1.0, urgency),
  };
}

/**
 * Evaluates how threatened the AI entity feels.
 * Used for retreat decisions per PDR §16.2:
 * "move out of player threat zones when low HP".
 *
 * @param {Object} entity - The AI entity being evaluated.
 * @param {Object[]} playerEntities - Player-controlled entities.
 * @param {AIBoardState} boardState - Current board state.
 * @returns {{ threatLevel: number, shouldRetreat: boolean, nearestThreatDistance: number, threateningCount: number }}
 */
export function evaluateEnemyThreat(entity, playerEntities, boardState) {
  if (!Array.isArray(playerEntities) || playerEntities.length === 0) {
    return { threatLevel: 0, shouldRetreat: false, nearestThreatDistance: Infinity, threateningCount: 0 };
  }

  const ex = entity.x ?? entity.position?.x ?? 0;
  const ey = entity.y ?? entity.position?.y ?? 0;
  const hpRatio = (entity.hp ?? entity.stats?.health ?? 10) / (entity.maxHp ?? entity.stats?.health ?? 10);

  let nearestThreatDistance = Infinity;
  let threateningCount = 0;
  let totalThreat = 0;

  for (const player of playerEntities) {
    const px = player.x ?? player.position?.x ?? 0;
    const py = player.y ?? player.position?.y ?? 0;
    const dist = manhattanDistance({ x: ex, y: ey }, { x: px, y: py });
    const playerRange = player.stats?.range || player.range || 1;
    const playerMovement = player.stats?.movement || player.movement || 3;

    if (dist < nearestThreatDistance) {
      nearestThreatDistance = dist;
    }

    // Entity is in player's attack range
    if (dist <= playerRange) {
      threateningCount++;
      const attackPower = player.stats?.attack || player.stats?.spellPower || 8;
      totalThreat += attackPower / Math.max(1, dist);
    }
    // Entity is within player's move + attack range
    else if (dist <= playerRange + playerMovement) {
      threateningCount++;
      totalThreat += (player.stats?.attack || player.stats?.spellPower || 5) * 0.4 / Math.max(1, dist);
    }
  }

  // Normalize threat to 0-1 range
  const threatLevel = Math.min(1.0, totalThreat / 30);

  // Retreat when low HP and high threat — PDR §16.2
  const shouldRetreat = hpRatio < 0.3 && threatLevel > 0.4;

  return {
    threatLevel: Math.round(threatLevel * 100) / 100,
    shouldRetreat,
    nearestThreatDistance,
    threateningCount,
  };
}

/**
 * Computes flanking value for attacking a target from a given tile.
 * Flanking occurs when the attacker is on the opposite side from the target's
 * facing or from another allied entity.
 *
 * @param {Object} tile - The attacking tile position.
 * @param {Object} targetEntity - The entity being attacked.
 * @param {AIBoardState} boardState - Current board state.
 * @returns {{ flankBonus: number, isFlanking: boolean, reason: string }}
 */
export function computeFlankingValue(tile, targetEntity, boardState) {
  if (!tile || !targetEntity) {
    return { flankBonus: 0, isFlanking: false, reason: 'Missing tile or target' };
  }

  const tx = tile.x ?? tile.position?.x ?? 0;
  const ty = tile.y ?? tile.position?.y ?? 0;
  const targetX = targetEntity.x ?? targetEntity.position?.x ?? 0;
  const targetY = targetEntity.y ?? targetEntity.position?.y ?? 0;
  const targetOrientation = targetEntity.orientation ?? 0; // 0=N, 90=E, 180=S, 270=W

  // Compute attack angle relative to target
  const dx = tx - targetX;
  const dy = ty - targetY;
  const attackAngle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;

  // Flanking = attack from behind (within 90° of opposite facing)
  const facingDiff = Math.abs(((attackAngle - targetOrientation + 180) % 360) - 180);
  const isRearAttack = facingDiff < 90;

  // Check for pincer flanking (allied entity on opposite side)
  let isPincerFlank = false;
  if (boardState && Array.isArray(boardState.entities)) {
    const alliedEntities = boardState.entities.filter(e =>
      e.id !== targetEntity.id
      && e.ownerId !== targetEntity.ownerId
      && e.ownerId === (tile.occupantId || '')
    );

    for (const ally of alliedEntities) {
      const ax = ally.x ?? ally.position?.x ?? 0;
      const ay = ally.y ?? ally.position?.y ?? 0;

      // Opposite side check: ally on one side, attacker on other
      const allyDx = ax - targetX;
      const allyDy = ay - targetY;
      const oppositeSide = (Math.sign(allyDx) === -Math.sign(dx) && Math.abs(dx) > 0)
        || (Math.sign(allyDy) === -Math.sign(dy) && Math.abs(dy) > 0);

      if (oppositeSide && chebyshevDistance({ x: ax, y: ay }, { x: targetX, y: targetY }) <= 2) {
        isPincerFlank = true;
        break;
      }
    }
  }

  let flankBonus = 0;
  let reason = 'No flanking advantage';

  if (isRearAttack) {
    flankBonus += 15;
    reason = 'Rear attack flanking bonus';
  }

  if (isPincerFlank) {
    flankBonus += 10;
    reason = isPincerFlank && isRearAttack ? 'Rear + pincer flanking' : 'Pincer flanking bonus';
  }

  return {
    flankBonus,
    isFlanking: flankBonus > 0,
    reason,
  };
}

/**
 * Top-level AI action selector. Decides move/attack/cast/wait based on board state.
 * Per PDR §16.2 rules:
 * - Prefer tiles matching school
 * - Avoid hazard tiles unless payoff is high
 * - Contest premium tiles
 * - Avoid Null if caster-based
 * - Use high ground for ranged
 * - Move out of player threat zones when low HP
 * - Deny Rune Tiles when player can reach them
 *
 * @param {Object} entity - The AI entity acting.
 * @param {AIBoardState} boardState - Current board state.
 * @param {AIPersonalityType|AIPersonalityWeights} personality - Personality type or weights.
 * @returns {AIActionDecision}
 */
export function selectAIAction(entity, boardState, personality) {
  const weights = typeof personality === 'string'
    ? AI_PERSONALITY_WEIGHTS[personality] || AI_PERSONALITY_WEIGHTS.KNIGHT
    : personality || AI_PERSONALITY_WEIGHTS.KNIGHT;

  const playerEntities = getPlayerEntities(boardState, entity);
  const ex = entity.x ?? entity.position?.x ?? 0;
  const ey = entity.y ?? entity.position?.y ?? 0;
  const entityRange = entity.stats?.range || entity.range || 1;
  const hpRatio = (entity.hp ?? entity.stats?.health ?? 10) / (entity.maxHp ?? entity.stats?.health ?? 10);

  // Step 1: Evaluate threat
  const threat = evaluateEnemyThreat(entity, playerEntities, boardState);

  // Step 2: If should retreat, move away from threats
  if (threat.shouldRetreat) {
    const reachable = getReachableTilesForEntity(entity, boardState);
    const retreatCandidates = reachable.filter((tile) => {
      const tx = tile.x ?? tile.position?.x ?? 0;
      const ty = tile.y ?? tile.position?.y ?? 0;
      return getClosestPlayerDistance(tx, ty, playerEntities) > threat.nearestThreatDistance;
    });
    const retreatPick = selectBestTile(entity, retreatCandidates, boardState, weights);
    if (retreatPick?.tile) {
      const tx = retreatPick.tile.x ?? retreatPick.tile.position?.x ?? 0;
      const ty = retreatPick.tile.y ?? retreatPick.tile.position?.y ?? 0;
      return {
        action: 'move',
        targetTileId: tileId(tx, ty),
        reason: `Low HP (${Math.round(hpRatio * 100)}%) and high threat — retreating`,
        confidence: 0.85,
      };
    }
  }

  // Step 3: Check if any player is in attack range
  const targetsInRange = playerEntities.filter(p => {
    const px = p.x ?? p.position?.x ?? 0;
    const py = p.y ?? p.position?.y ?? 0;
    return manhattanDistance({ x: ex, y: ey }, { x: px, y: py }) <= entityRange;
  });

  if (targetsInRange.length > 0) {
    // Find weakest target or best flanking opportunity
    let bestTarget = targetsInRange[0];
    let bestTargetScore = 0;

    for (const target of targetsInRange) {
      const targetHp = target.hp ?? target.stats?.health ?? 10;
      const targetMaxHp = target.maxHp ?? target.stats?.health ?? 10;
      const hpScore = 1.0 - (targetHp / targetMaxHp); // Prefer injured targets

      // Get entity's current tile for flanking computation
      const entityTile = { x: ex, y: ey };
      const flank = computeFlankingValue(entityTile, target, boardState);
      const flankScore = flank.flankBonus / 100;

      const score = hpScore * 0.6 + flankScore * 0.4;
      if (score > bestTargetScore) {
        bestTargetScore = score;
        bestTarget = target;
      }
    }

    // Decide between attack and cast based on entity type
    const isCaster = weights.offensive > 1.0 && weights.avoidsNull;
    const action = isCaster ? 'cast' : 'attack';

    return {
      action,
      targetEntityId: bestTarget.id,
      reason: `Target ${bestTarget.name || bestTarget.id} in range — ${action}`,
      confidence: 0.75 + bestTargetScore * 0.2,
    };
  }

  // Step 4: No targets in range — should we move to contest or attack?
  // Check for premium tiles worth contesting
  if (boardState && Array.isArray(boardState.tiles)) {
    const flatTiles = Array.isArray(boardState.tiles[0]) ? boardState.tiles.flat() : boardState.tiles;
    for (const tile of flatTiles) {
      const contest = shouldContestTile(tile, entity, boardState);
      if (contest.shouldContest && contest.urgency > 0.7) {
        const ttx = tile.x ?? tile.position?.x ?? 0;
        const tty = tile.y ?? tile.position?.y ?? 0;
        return {
          action: 'move',
          targetTileId: tileId(ttx, tty),
          reason: `Contesting premium tile: ${contest.reason}`,
          confidence: contest.urgency,
        };
      }
    }
  }

  // Step 5: Move toward nearest player to close distance
  if (playerEntities.length > 0) {
    let closestPlayer = playerEntities[0];
    let closestDist = Infinity;

    for (const p of playerEntities) {
      const px = p.x ?? p.position?.x ?? 0;
      const py = p.y ?? p.position?.y ?? 0;
      const dist = manhattanDistance({ x: ex, y: ey }, { x: px, y: py });
      if (dist < closestDist) {
        closestDist = dist;
        closestPlayer = p;
      }
    }

    const reachable = getReachableTilesForEntity(entity, boardState);
    const advancePick = selectBestTile(entity, reachable, boardState, weights);
    if (advancePick?.tile) {
      const tx = advancePick.tile.x ?? advancePick.tile.position?.x ?? 0;
      const ty = advancePick.tile.y ?? advancePick.tile.position?.y ?? 0;
      return {
        action: 'move',
        targetTileId: tileId(tx, ty),
        reason: `Advancing toward ${closestPlayer.name || closestPlayer.id}`,
        confidence: 0.6,
      };
    }

    return {
      action: 'wait',
      reason: 'No reachable tiles toward player',
      confidence: 0.4,
    };
  }

  // Step 6: Nothing to do — wait
  return {
    action: 'wait',
    reason: 'No actionable targets or objectives',
    confidence: 0.5,
  };
}

// ---------------------------------------------------------------------------
// Internal Helpers (not exported)
// ---------------------------------------------------------------------------

/**
 * Extracts player entities from board state (entities not owned by AI entity's owner).
 * @param {AIBoardState} boardState
 * @param {Object} aiEntity
 * @returns {Object[]}
 */
function getPlayerEntities(boardState, aiEntity) {
  if (!boardState || !Array.isArray(boardState.entities)) return [];
  const aiOwner = aiEntity.ownerId || aiEntity.id || '';
  return boardState.entities.filter(e => {
    const eOwner = e.ownerId || e.id || '';
    return eOwner !== aiOwner && e.id !== aiEntity.id;
  });
}

/**
 * Returns distance to closest player entity from a position.
 * @param {number} x
 * @param {number} y
 * @param {Object[]} playerEntities
 * @returns {number}
 */
function getClosestPlayerDistance(x, y, playerEntities) {
  if (!Array.isArray(playerEntities) || playerEntities.length === 0) return Infinity;

  let minDist = Infinity;
  for (const p of playerEntities) {
    const px = p.x ?? p.position?.x ?? 0;
    const py = p.y ?? p.position?.y ?? 0;
    const dist = manhattanDistance({ x, y }, { x: px, y: py });
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

/**
 * Checks if any player entity can likely reach a tile within one turn.
 * @param {number} x
 * @param {number} y
 * @param {Object[]} playerEntities
 * @param {AIBoardState} boardState
 * @returns {boolean}
 */
function canAnyPlayerReach(x, y, playerEntities, boardState) {
  if (!Array.isArray(playerEntities)) return false;

  for (const p of playerEntities) {
    const px = p.x ?? p.position?.x ?? 0;
    const py = p.y ?? p.position?.y ?? 0;
    const movement = p.stats?.movement || p.movement || 3;
    const dist = manhattanDistance({ x, y }, { x: px, y: py });
    if (dist <= movement) return true;
  }
  return false;
}

/**
 * Maps terrain type to school for bonus lookups.
 * @param {string} terrain
 * @returns {string|null}
 */
function schoolFromTerrain(terrain) {
  const map = {
    fire: 'FIRE',
    void: 'VOID',
    abyss: 'VOID',
    voidStone: 'VOID',
    sonic: 'SONIC',
    holy: 'HOLY',
    ice: 'ICE',
    snow: 'ICE',
    rune: null,     // School-neutral premium
    runeTile: null,
    anchor: null,    // School-neutral
    null: null,
    normal: null,
    stone: null,
    high_ground: null,
    low_ground: null,
    hazard: null,
    frozenRuins: 'ICE',
    manaCrystal: null,
  };
  return map[terrain] || null;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default {
  scoreTileForAI,
  selectBestTile,
  shouldContestTile,
  evaluateEnemyThreat,
  computeFlankingValue,
  selectAIAction,
  AI_PERSONALITY_WEIGHTS,
};

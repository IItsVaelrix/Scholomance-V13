/**
 * tactical-board.resolver.js
 *
 * Spell-board integration per PDR §12–13. Constructs TacticalCastContext,
 * resolves spell paths through tile space, applies tile modifiers to
 * combat results, and computes movement-casting penalties.
 *
 * Pure logic — no DOM, no side effects, no randomness.
 * All functions return new values; inputs are never mutated.
 *
 * @module tactical-board.resolver
 */

import {
  BATTLE_TILE_MODIFIERS,
  applyTileModifierToScore,
} from './tactical-board.tiles.js';

// ---------------------------------------------------------------------------
// JSDoc Type Definitions (PDR §12.1)
// ---------------------------------------------------------------------------

/**
 * Parsed weave placeholder (from spellweave.engine).
 * @typedef {Object} ParsedWeave
 * @property {string} [raw]
 * @property {string} [school]
 * @property {string} [intent]
 * @property {number} [resonance]
 */

/**
 * Bridge result placeholder (from spellweave.engine).
 * @typedef {Object} BridgeResult
 * @property {number} [resonance]
 * @property {string} [school]
 * @property {string} [chainType]
 * @property {number} [strikes]
 * @property {boolean} [collapsed]
 * @property {string} [intent]
 */

/**
 * Scene context snapshot.
 * @typedef {Object} SceneContextSnapshot
 * @property {string} [sceneId]
 * @property {string} [arenaSchool]
 * @property {string} [encounterType]
 */

/**
 * Full tactical cast context per PDR §12.1.
 * @typedef {Object} TacticalCastContext
 * @property {string} casterId
 * @property {import('./tactical-board.tiles.js').BattleTile} casterTile
 * @property {string|null} targetId
 * @property {import('./tactical-board.tiles.js').BattleTile|null} targetTile
 * @property {import('./tactical-board.tiles.js').BattleTile[]} pathTiles
 * @property {ParsedWeave} parsedWeave
 * @property {BridgeResult} bridgeResult
 * @property {SceneContextSnapshot} sceneContext
 * @property {import('./tactical-board.compiler.js').BattleBoardState} boardState
 */

/**
 * Result of tactical spell resolution.
 * @typedef {Object} TacticalCastResult
 * @property {number} adjustedScore - Final score after all tile modifiers
 * @property {number} totalMultiplier - Combined multiplier from all tile modifiers
 * @property {string[]} traces - Human-readable trace of each modifier applied
 * @property {{ caster: number, target: number, path: number, penalty: number }} breakdown
 */

// ---------------------------------------------------------------------------
// Context Builder
// ---------------------------------------------------------------------------

/**
 * Constructs a TacticalCastContext from combat inputs.
 * Pure assembly — no computation beyond tile lookup.
 *
 * @param {string} casterId
 * @param {string|null} targetId
 * @param {import('./tactical-board.compiler.js').BattleBoardState} boardState
 * @param {ParsedWeave} parsedWeave
 * @param {BridgeResult} bridgeResult
 * @param {SceneContextSnapshot} sceneContext
 * @returns {TacticalCastContext}
 */
export function buildTacticalCastContext(
  casterId,
  targetId,
  boardState,
  parsedWeave,
  bridgeResult,
  sceneContext
) {
  const casterUnit = findUnit(boardState, casterId);
  const targetUnit = targetId ? findUnit(boardState, targetId) : null;

  const casterTile = casterUnit
    ? getTileAt(boardState, casterUnit.x, casterUnit.y)
    : createNullTile();
  const targetTile = targetUnit
    ? getTileAt(boardState, targetUnit.x, targetUnit.y)
    : null;

  const pathTiles = targetTile
    ? resolvePathTiles(casterTile, targetTile, boardState)
    : [];

  return {
    casterId,
    casterTile,
    targetId: targetId || null,
    targetTile,
    pathTiles,
    parsedWeave: parsedWeave || {},
    bridgeResult: bridgeResult || {},
    sceneContext: sceneContext || {},
    boardState,
  };
}

// ---------------------------------------------------------------------------
// Path Tile Resolution
// ---------------------------------------------------------------------------

/**
 * Finds all tiles on the line between caster and target using Bresenham.
 * Excludes the caster and target tiles themselves.
 *
 * @param {import('./tactical-board.tiles.js').BattleTile} casterTile
 * @param {import('./tactical-board.tiles.js').BattleTile} targetTile
 * @param {import('./tactical-board.compiler.js').BattleBoardState} boardState
 * @returns {import('./tactical-board.tiles.js').BattleTile[]}
 */
export function resolvePathTiles(casterTile, targetTile, boardState) {
  if (!casterTile || !targetTile) return [];

  const dx = targetTile.x - casterTile.x;
  const dy = targetTile.y - casterTile.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps <= 1) return []; // Adjacent — no intermediate tiles

  const path = [];
  for (let i = 1; i < steps; i++) {
    const x = Math.round(casterTile.x + (dx * i) / steps);
    const y = Math.round(casterTile.y + (dy * i) / steps);
    const tile = getTileAt(boardState, x, y);
    if (tile) {
      path.push(tile);
    }
  }

  return path;
}

// ---------------------------------------------------------------------------
// Tile Modifier Application
// ---------------------------------------------------------------------------

/**
 * Reads tile modifiers from caster tile, target tile, and path tiles,
 * then computes their combined effect on a base score.
 *
 * @param {TacticalCastContext} context
 * @returns {{ casterMultiplier: number, targetMultiplier: number, pathMultiplier: number, traces: string[] }}
 */
export function applyTileModifiersToContext(context) {
  const school = context.parsedWeave?.school
    || context.bridgeResult?.school
    || context.sceneContext?.arenaSchool
    || null;

  const isHealing = context.parsedWeave?.intent === 'healing'
    || context.bridgeResult?.intent === 'healing';

  const traces = [];

  // Caster tile modifier
  const casterMod = context.casterTile?.modifier || null;
  const casterResult = applyTileModifierToScore(casterMod, school, 100, { isHealing });
  if (casterMod) {
    traces.push(`Caster tile: ${casterResult.trace}`);
  }

  // Target tile modifier
  const targetMod = context.targetTile?.modifier || null;
  let targetMultiplier = 1;
  if (targetMod && targetMod.appliesTo === 'target_tile') {
    const targetResult = applyTileModifierToScore(targetMod, school, 100, { isHealing });
    targetMultiplier = targetResult.multiplier;
    traces.push(`Target tile: ${targetResult.trace}`);
  }

  // Path tile modifiers (averaged)
  let pathMultiplier = 1;
  if (context.pathTiles.length > 0) {
    let pathSum = 0;
    let pathCount = 0;
    for (const pathTile of context.pathTiles) {
      if (pathTile.modifier && pathTile.modifier.appliesTo === 'path_tiles') {
        const pathResult = applyTileModifierToScore(pathTile.modifier, school, 100, { isHealing });
        pathSum += pathResult.multiplier;
        pathCount++;
        traces.push(`Path tile (${pathTile.x},${pathTile.y}): ${pathResult.trace}`);
      }
    }
    if (pathCount > 0) {
      pathMultiplier = pathSum / pathCount;
    }
  }

  // Check for null tiles on the path that reduce all modifiers
  const nullOnPath = context.pathTiles.some(
    (t) => t.terrain === 'null' || t.modifier?.kind === 'nullification'
  );
  let casterMultiplier = casterResult.multiplier;
  let adjustedTargetMultiplier = targetMultiplier;
  let adjustedPathMultiplier = pathMultiplier;

  if (nullOnPath) {
    const nullMod = BATTLE_TILE_MODIFIERS.null_denial;
    const reduction = 1 + (nullMod?.value || -0.20);
    casterMultiplier *= reduction;
    adjustedTargetMultiplier *= reduction;
    adjustedPathMultiplier *= reduction;
    traces.push(`Null tile in path: all modifiers reduced to ${Math.round(reduction * 100)}%.`);
  }

  return {
    casterMultiplier,
    targetMultiplier: adjustedTargetMultiplier,
    pathMultiplier: adjustedPathMultiplier,
    traces,
  };
}

// ---------------------------------------------------------------------------
// Movement-Casting Penalty (PDR §14.3)
// ---------------------------------------------------------------------------

/**
 * Computes the casting penalty from movement used this turn.
 *
 * Per PDR §14.3:
 * - No movement: +5% focus bonus (multiplier 1.05)
 * - Partial movement (< 50%): normal cast (multiplier 1.0)
 * - Full movement: -8% accuracy/bridge penalty (multiplier 0.92)
 * - Matching tile offsets penalty: handled separately
 *
 * @param {number} movementUsed - Movement points used this turn
 * @param {number} maxMovement - Total movement budget
 * @returns {{ multiplier: number, trace: string }}
 */
export function getMovementCastingPenalty(movementUsed, maxMovement) {
  if (maxMovement <= 0) {
    return { multiplier: 1, trace: 'No movement budget.' };
  }

  const ratio = movementUsed / maxMovement;

  if (ratio === 0) {
    return {
      multiplier: 1.05,
      trace: 'No movement: +5% focus bonus.',
    };
  }

  if (ratio < 0.5) {
    return {
      multiplier: 1.0,
      trace: `Partial movement (${Math.round(ratio * 100)}%): normal cast.`,
    };
  }

  if (ratio < 1.0) {
    const penalty = 0.92 + (1.0 - ratio) * 0.08;
    return {
      multiplier: Math.round(penalty * 100) / 100,
      trace: `Heavy movement (${Math.round(ratio * 100)}%): -${Math.round((1 - penalty) * 100)}% penalty.`,
    };
  }

  // Full movement
  return {
    multiplier: 0.92,
    trace: 'Full movement: -8% casting penalty.',
  };
}

// ---------------------------------------------------------------------------
// Full Tactical Resolution
// ---------------------------------------------------------------------------

/**
 * Applies all tile modifiers and movement penalties to a base combat score.
 * Returns the adjusted score with full trace.
 *
 * @param {TacticalCastContext} context
 * @param {number} baseCombatScore - The raw combat score before tile effects
 * @param {{ movementUsed?: number, maxMovement?: number }} [options]
 * @returns {TacticalCastResult}
 */
function applyMatchingTileMovementOffset(context, movementPenalty) {
  const school = context.parsedWeave?.school
    || context.bridgeResult?.school
    || context.sceneContext?.arenaSchool
    || null;
  const modifier = context.casterTile?.modifier;

  if (!school || !modifier?.school) return movementPenalty;
  if (modifier.school.toUpperCase() !== String(school).toUpperCase()) return movementPenalty;
  if (movementPenalty.multiplier >= 1) return movementPenalty;

  return {
    multiplier: 1.0,
    trace: `${modifier.label || modifier.school}: matching school tile offsets movement penalty.`,
  };
}

export function resolveTacticalCast(context, baseCombatScore, options = {}) {
  const tileModifiers = applyTileModifiersToContext(context);
  const rawMovementPenalty = getMovementCastingPenalty(
    options.movementUsed || 0,
    options.maxMovement || 0
  );
  const movementPenalty = applyMatchingTileMovementOffset(context, rawMovementPenalty);

  const totalMultiplier = tileModifiers.casterMultiplier
    * tileModifiers.targetMultiplier
    * tileModifiers.pathMultiplier
    * movementPenalty.multiplier;

  const adjustedScore = Math.max(1, Math.round(baseCombatScore * totalMultiplier));

  const traces = [
    ...tileModifiers.traces,
    movementPenalty.trace,
    `Total tile multiplier: ×${totalMultiplier.toFixed(2)}.`,
    `Score: ${baseCombatScore} → ${adjustedScore}.`,
  ];

  return {
    adjustedScore,
    totalMultiplier,
    traces,
    breakdown: {
      caster: tileModifiers.casterMultiplier,
      target: tileModifiers.targetMultiplier,
      path: tileModifiers.pathMultiplier,
      penalty: movementPenalty.multiplier,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Finds a unit placement on the board by entity ID.
 * @param {import('./tactical-board.compiler.js').BattleBoardState} boardState
 * @param {string} entityId
 * @returns {import('./tactical-board.compiler.js').BattleUnitPlacement|null}
 */
function findUnit(boardState, entityId) {
  if (!boardState?.units) return null;
  return boardState.units.find((u) => u.entityId === entityId) || null;
}

/**
 * Retrieves a tile from the board state at (x, y).
 * @param {import('./tactical-board.compiler.js').BattleBoardState} boardState
 * @param {number} x
 * @param {number} y
 * @returns {import('./tactical-board.tiles.js').BattleTile|null}
 */
function getTileAt(boardState, x, y) {
  if (!boardState?.tiles) return null;
  const { width, height } = boardState;
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  return boardState.tiles[y * width + x] || null;
}

/**
 * Creates a neutral placeholder tile for when caster has no valid position.
 * @returns {import('./tactical-board.tiles.js').BattleTile}
 */
function createNullTile() {
  return {
    x: 0,
    y: 0,
    z: 0,
    terrain: 'normal',
    walkable: true,
    blocksLineOfSight: false,
    modifier: null,
    control: { occupiedBy: null, threatenedBy: [], controlledBy: null },
    visual: { glyph: '·', colorHint: '#8a8a8a', pulseIntensity: 0 },
    interactionPriority: 0,
    movementCost: 1,
  };
}

// ---------------------------------------------------------------------------
// Default Export Bundle
// ---------------------------------------------------------------------------

export default {
  buildTacticalCastContext,
  resolvePathTiles,
  applyTileModifiersToContext,
  applyMatchingTileMovementOffset,
  resolveTacticalCast,
  getMovementCastingPenalty,
};

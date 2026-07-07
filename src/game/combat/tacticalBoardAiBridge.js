import { selectAIAction, AI_PERSONALITY_WEIGHTS } from '../../../codex/core/combat/tactical-board.ai.js';
import { getActiveBattleBoard } from './tacticalBoardSession.js';
import { findPath } from './combatPathfinding.js';

const PERSONALITY_BY_SCHOOL = {
  FIRE: 'FIRE_CASTER',
  VOID: 'VOID_CULTIST',
  SONIC: 'CONSTRUCT',
  HOLY: 'HEALER',
  ICE: 'WRAITH',
};

function toAIBoard(boardState, stats) {
  const entities = [];
  const player = stats?.getEntity?.('player');
  if (player?.position) {
    entities.push({
      id: 'player',
      x: player.position.tx,
      y: player.position.ty,
      side: 'player',
      ownerId: 'player',
      movement: player.movementPointsRemaining ?? 3,
      hp: player.hp,
      maxHp: player.maxHp,
    });
  }

  for (const unit of boardState.units || []) {
    if (unit.side === 'enemy') {
      const entity = stats?.getEntity?.(unit.entityId);
      entities.push({
        id: unit.entityId,
        x: entity?.position?.tx ?? unit.x,
        y: entity?.position?.ty ?? unit.y,
        side: 'enemy',
        ownerId: unit.entityId,
        movement: entity?.movementPointsRemaining ?? 3,
        hp: entity?.hp,
        maxHp: entity?.maxHp,
      });
    }
  }

  const board = {
    width: boardState.width,
    height: boardState.height,
    tiles: boardState.tiles,
    units: boardState.units,
    entities,
    turnCount: 1,
    getTile: (x, y) => boardState.tiles[y * boardState.width + x],
  };

  return board;
}

/**
 * Returns movement steps toward a tactically valuable tile, or null.
 *
 * @param {object} ctx - enemy turn context from enemyCombatDriver
 * @returns {{ steps: Array<{tx:number,ty:number}>, destination: {tx:number,ty:number}, reason: string }|null}
 */
export function getTacticalTileMoveGoal(ctx) {
  const boardState = getActiveBattleBoard();
  if (!boardState || !ctx?.selfId) return null;

  const selfEntity = {
    id: ctx.selfId,
    x: ctx.self.position.tx,
    y: ctx.self.position.ty,
    ownerId: ctx.selfId,
    stats: {
      movement: ctx.self.movementPointsRemaining,
      range: ctx.self.attackRange,
      health: ctx.self.hp,
    },
    hp: ctx.self.hp,
    maxHp: ctx.self.maxHp,
    school: ctx.profile?.school || ctx.abilityKit?.school || null,
  };

  const personality = PERSONALITY_BY_SCHOOL[selfEntity.school?.toUpperCase?.()] || 'KNIGHT';
  const decision = selectAIAction(selfEntity, toAIBoard(boardState, ctx.stats), personality);

  if (decision.action !== 'move' || !decision.targetTileId) return null;

  const [tx, ty] = decision.targetTileId.split(',').map(Number);
  const path = findPath(ctx.self.position, { tx, ty }, ctx.blocked);
  const budget = Math.max(0, Math.floor(ctx.self.movementPointsRemaining || 0));
  const steps = path.slice(0, budget);
  if (!steps.length) return null;

  return {
    steps,
    destination: steps[steps.length - 1],
    reason: decision.reason || 'Tactical tile contest',
  };
}

export { AI_PERSONALITY_WEIGHTS };
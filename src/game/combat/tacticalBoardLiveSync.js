import { setActiveBattleBoard, getActiveBattleBoard } from './tacticalBoardSession.js';
import { getSentinelDefinition } from './sentinelRobots.js';

const ENTITY_LABELS = {
  player: 'Player',
};

function resolveEntityLabel(entityId) {
  if (ENTITY_LABELS[entityId]) return ENTITY_LABELS[entityId];
  const sentinel = getSentinelDefinition?.(entityId);
  if (sentinel?.shortLabel || sentinel?.label) {
    return sentinel.shortLabel || sentinel.label;
  }
  return entityId.replace(/-/g, ' ');
}

/**
 * Sync compiled board unit positions from live combat stats.
 *
 * @param {import('../../../codex/core/combat/tactical-board.compiler.js').BattleBoardState|null} boardState
 * @param {import('./combatStatController.js').CombatStatController|null} stats
 * @returns {import('../../../codex/core/combat/tactical-board.compiler.js').BattleBoardState|null}
 */
export function syncBattleBoardFromLiveStats(boardState, stats) {
  if (!boardState || !stats) return boardState;

  const nextUnits = boardState.units.map((unit) => {
    const live = stats.getEntity(unit.entityId);
    if (!live?.position) return { ...unit };
    return {
      ...unit,
      x: live.position.tx,
      y: live.position.ty,
      z: unit.z,
    };
  });

  const nextTiles = boardState.tiles.map((tile) => ({
    ...tile,
    control: {
      ...tile.control,
      occupiedBy: null,
    },
  }));

  for (const unit of nextUnits) {
    const index = unit.y * boardState.width + unit.x;
    const tile = nextTiles[index];
    if (tile) {
      nextTiles[index] = {
        ...tile,
        control: {
          ...tile.control,
          occupiedBy: unit.entityId,
        },
      };
    }
  }

  const synced = {
    ...boardState,
    units: nextUnits,
    tiles: nextTiles,
  };

  setActiveBattleBoard(synced);
  return synced;
}

/**
 * Map threat entity IDs to display labels for tooltips.
 *
 * @param {string[]} entityIds
 * @returns {string[]}
 */
export function resolveThreatEntityLabels(entityIds = []) {
  return entityIds.map(resolveEntityLabel);
}

export { resolveEntityLabel };
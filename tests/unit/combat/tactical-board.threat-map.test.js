import { describe, expect, it } from 'vitest';
import { compileBattleBoard } from '../../../codex/core/combat/tactical-board.compiler.js';
import { computeThreatMap, getMovementRange } from '../../../codex/core/combat/tactical-board.threat-map.js';

describe('tactical-board.threat-map', () => {
  it('marks adjacent tiles as melee-threatened by enemy', () => {
    const map = {
      sceneId: 't',
      width: 5,
      height: 5,
      cells: Array.from({ length: 5 }, (_, y) =>
        Array.from({ length: 5 }, (_, x) => ({ x, y, terrainType: 'snow', walkable: true })),
      ),
    };
    const board = compileBattleBoard({
      sourceSceneId: 't',
      encounterId: 'e',
      mapHash: 'h',
      playerPosition: { x: 2, y: 4 },
      enemySet: ['enemy-1'],
    }, map);

    const enemy = board.units.find((u) => u.side === 'enemy');
    const threat = computeThreatMap(board, [{
      id: enemy.entityId,
      x: enemy.x,
      y: enemy.y,
      side: 'enemy',
      meleeRange: 1,
      attack: 10,
    }]);

    const threatened = threat.controlledTiles.find((t) => t.x === enemy.x && t.y === enemy.y + 1);
    expect(threatened).toBeTruthy();
    expect(threatened.controlledBy).toContain(enemy.entityId);
  });

  it('returns movement range within budget', () => {
    const map = {
      sceneId: 't',
      width: 5,
      height: 5,
      cells: Array.from({ length: 5 }, (_, y) =>
        Array.from({ length: 5 }, (_, x) => ({ x, y, terrainType: 'snow', walkable: true })),
      ),
    };
    const board = compileBattleBoard({
      sourceSceneId: 't',
      encounterId: 'e',
      mapHash: 'h',
      playerPosition: { x: 2, y: 2 },
      enemySet: [],
    }, map);
    const player = board.units.find((u) => u.side === 'player');
    const range = getMovementRange({ ...player, id: player.entityId, movementRange: 2 }, board);
    expect(range.length).toBeGreaterThan(0);
    expect(range.every((t) => t.costToReach <= 2)).toBe(true);
  });
});
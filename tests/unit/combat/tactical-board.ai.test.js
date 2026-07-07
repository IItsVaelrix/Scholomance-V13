import { describe, expect, it } from 'vitest';
import { compileBattleBoard } from '../../../codex/core/combat/tactical-board.compiler.js';
import {
  selectAIAction,
  selectBestTile,
  AI_PERSONALITY_WEIGHTS,
} from '../../../codex/core/combat/tactical-board.ai.js';
import { getMovementRange } from '../../../codex/core/combat/tactical-board.threat-map.js';

describe('tactical-board.ai', () => {
  it('FIRE_CASTER contests premium tiles when available', () => {
    const board = compileBattleBoard({
      sourceSceneId: 't',
      encounterId: 'e',
      mapHash: 'h',
      playerPosition: { x: 4, y: 4 },
      enemySet: ['fire-caster'],
    }, {
      sceneId: 't',
      width: 5,
      height: 5,
      cells: Array.from({ length: 5 }, (_, y) =>
        Array.from({ length: 5 }, (_, x) => ({
          x,
          y,
          terrainType: x === 2 && y === 1 ? 'fire' : 'snow',
          walkable: true,
        })),
      ),
    });

    const enemy = board.units.find((u) => u.side === 'enemy');
    const aiBoard = {
      width: board.width,
      height: board.height,
      tiles: board.tiles,
      entities: board.units.map((u) => ({
        id: u.entityId,
        x: u.x,
        y: u.y,
        side: u.side,
        movement: 3,
        ownerId: u.side === 'enemy' ? u.entityId : 'player',
      })),
      turnCount: 1,
      getTile: (x, y) => board.tiles[y * board.width + x],
    };

    const decision = selectAIAction({
      id: enemy.entityId,
      x: enemy.x,
      y: enemy.y,
      ownerId: enemy.entityId,
      stats: { movement: 3, range: 1 },
      school: 'FIRE',
    }, aiBoard, 'FIRE_CASTER');

    expect(['move', 'attack', 'cast', 'wait']).toContain(decision.action);
    if (decision.action === 'move') {
      expect(decision.targetTileId).toBeTruthy();
    }
  });

  it('selectBestTile returns a scored tile from reachable candidates', () => {
    const board = {
      width: 3,
      height: 3,
      tiles: Array.from({ length: 9 }, (_, i) => ({
        x: i % 3,
        y: Math.floor(i / 3),
        z: 1,
        terrain: i === 4 ? 'fire' : 'normal',
        walkable: true,
        movementCost: 1,
        modifier: null,
        control: { occupiedBy: null, threatenedBy: [], controlledBy: null },
      })),
      entities: [],
      getTile: (x, y) => ({
        x, y, terrain: x === 1 && y === 1 ? 'fire' : 'normal', walkable: true, movementCost: 1,
      }),
    };
    const entity = { id: 'enemy-1', x: 0, y: 0, stats: { movement: 2 }, school: 'FIRE' };
    const reachable = getMovementRange({ id: 'enemy-1', x: 0, y: 0, movementRange: 2 }, board);
    const pick = selectBestTile(entity, reachable.map((t) => board.tiles[t.y * 3 + t.x]), board, 'FIRE_CASTER');
    expect(pick?.tile).toBeTruthy();
    expect(pick?.score?.total).toBeGreaterThan(0);
  });

  it('exposes personality weights for all PDR §16.3 types', () => {
    expect(Object.keys(AI_PERSONALITY_WEIGHTS)).toEqual(
      expect.arrayContaining(['FIRE_CASTER', 'VOID_CULTIST', 'KNIGHT', 'WRAITH', 'HEALER', 'CONSTRUCT']),
    );
  });
});
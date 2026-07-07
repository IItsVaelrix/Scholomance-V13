import { describe, expect, it } from 'vitest';
import {
  buildMapStateFromArena,
  buildBattleBoardSeed,
  compileArenaBattleBoard,
} from '../../../src/game/combat/tacticalBoardMapAdapter.js';

const ARENA_SNAPSHOT = {
  sceneId: 'combat-arena',
  gridSize: 9,
  playerGridPos: { tx: 4, ty: 6 },
  leylines: [
    { id: 'ley-1', coord: { x: 2, y: 3 }, affinity: 'SONIC' },
    { id: 'ley-2', coord: { x: 6, y: 1 }, affinity: 'VOID' },
  ],
  enemies: ['sentinel-scout', 'sentinel-brawler'],
  encounterId: 'sentinel-aggro-1',
  mapHash: 'arena-v1',
};

describe('tacticalBoardMapAdapter', () => {
  it('builds a square MapState matching gridSize', () => {
    const map = buildMapStateFromArena(ARENA_SNAPSHOT);
    expect(map.width).toBe(9);
    expect(map.height).toBe(9);
    expect(map.cells[3][2].terrainType).toBe('sonic');
  });

  it('centers board seed on player grid position', () => {
    const seed = buildBattleBoardSeed(ARENA_SNAPSHOT);
    expect(seed.playerPosition).toEqual({ x: 4, y: 6 });
    expect(seed.enemySet).toEqual(['sentinel-scout', 'sentinel-brawler']);
  });

  it('compileArenaBattleBoard returns a deterministic board', () => {
    const a = compileArenaBattleBoard(ARENA_SNAPSHOT);
    const b = compileArenaBattleBoard(ARENA_SNAPSHOT);
    expect(a.boardId).toBe(b.boardId);
    expect(a.tiles).toHaveLength(a.width * a.height);
  });
});
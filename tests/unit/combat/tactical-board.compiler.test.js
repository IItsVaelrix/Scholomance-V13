import { describe, expect, it } from 'vitest';
import {
  compileBattleBoard,
  computeBoardHash,
  getBoardDimensions,
} from '../../../codex/core/combat/tactical-board.compiler.js';

function makeMapState(width = 10, height = 10) {
  const cells = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      x, y, z: 1, terrainType: 'snow', walkable: true, blocksLineOfSight: false,
    }))
  );
  return { sceneId: 'void-courtyard', width, height, cells };
}

const BASE_SEED = {
  sourceSceneId: 'void-courtyard',
  encounterId: 'sentinel-intro',
  mapHash: 'map-abc123',
  playerPosition: { x: 5, y: 7 },
  enemySet: ['hollow-student', 'void-acolyte'],
};

describe('tactical-board.compiler', () => {
  it('returns TACTICAL-LATTICE-v1 compiler version', () => {
    const board = compileBattleBoard(BASE_SEED, makeMapState());
    expect(board.compilerVersion).toBe('TACTICAL-LATTICE-v1');
  });

  it('produces identical board hash for identical seed + map (TLB-1)', () => {
    const map = makeMapState();
    const a = compileBattleBoard(BASE_SEED, map);
    const b = compileBattleBoard(BASE_SEED, map);
    expect(computeBoardHash(a)).toBe(computeBoardHash(b));
  });

  it('changes hash when encounter seed changes', () => {
    const map = makeMapState();
    const a = compileBattleBoard(BASE_SEED, map);
    const b = compileBattleBoard({ ...BASE_SEED, encounterId: 'other-encounter' }, map);
    expect(computeBoardHash(a)).not.toBe(computeBoardHash(b));
  });

  it('uses 10x10 board when enemy count exceeds threshold', () => {
    const dims = getBoardDimensions(makeMapState(12, 12), {
      ...BASE_SEED,
      enemySet: ['e1', 'e2', 'e3', 'e4'],
    });
    expect(dims).toEqual({ width: 10, height: 10 });
  });

  it('places player and all enemies on walkable tiles', () => {
    const board = compileBattleBoard(BASE_SEED, makeMapState());
    for (const unit of board.units) {
      const tile = board.tiles[unit.y * board.width + unit.x];
      expect(tile?.walkable).toBe(true);
    }
    expect(board.units.find((u) => u.entityId === 'player')).toBeTruthy();
    expect(board.units.filter((u) => u.side === 'enemy')).toHaveLength(2);
  });

  it('biases school tiles near sonic landmarks (PDR §19.2)', () => {
    const map = makeMapState(6, 6);
    map.cells[2][2] = {
      ...map.cells[2][2],
      terrainType: 'sonic',
      objectId: 'ley-node',
      objectType: 'landmark',
    };
    const board = compileBattleBoard({
      ...BASE_SEED,
      playerPosition: { x: 2, y: 2 },
      enemySet: [],
    }, map);
    const sonicTiles = board.tiles.filter((t) => t.terrain === 'sonic');
    expect(sonicTiles.length).toBeGreaterThan(0);
  });

  it('removes clutter objects but preserves landmarks', () => {
    const map = makeMapState();
    map.cells[3][3] = { ...map.cells[3][3], objectId: 'sign-1', objectType: 'decor' };
    map.cells[4][4] = { ...map.cells[4][4], objectId: 'obelisk-1', objectType: 'obelisk' };
    const board = compileBattleBoard(BASE_SEED, map);
    expect(board.removedObjects.some((o) => o.id === 'sign-1')).toBe(true);
    expect(board.preservedObjects.some((o) => o.id === 'obelisk-1')).toBe(true);
  });
});
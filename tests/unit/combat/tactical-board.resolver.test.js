import { describe, expect, it } from 'vitest';
import { compileBattleBoard } from '../../../codex/core/combat/tactical-board.compiler.js';
import {
  buildTacticalCastContext,
  resolveTacticalCast,
} from '../../../codex/core/combat/tactical-board.resolver.js';

function fixtureBoardWithFireTile() {
  const map = {
    sceneId: 'test',
    width: 3,
    height: 3,
    cells: Array.from({ length: 3 }, (_, y) =>
      Array.from({ length: 3 }, (_, x) => ({ x, y, terrainType: 'snow', walkable: true })),
    ),
  };
  map.cells[2][1].terrainType = 'fire';
  const seed = {
    sourceSceneId: 'test',
    encounterId: 'enc',
    mapHash: 'hash',
    playerPosition: { x: 1, y: 2 },
    enemySet: ['enemy-1'],
  };
  return compileBattleBoard(seed, map);
}

describe('tactical-board.resolver', () => {
  it('boosts fire spell score when caster stands on fire tile (TLB-5)', () => {
    const board = fixtureBoardWithFireTile();
    const player = board.units.find((u) => u.side === 'player');
    const enemy = board.units.find((u) => u.side === 'enemy');
    const fireTile = board.tiles.find((t) => t.terrain === 'fire');
    if (fireTile && player) {
      player.x = fireTile.x;
      player.y = fireTile.y;
      player.z = fireTile.z;
    }
    const ctx = buildTacticalCastContext(
      player.entityId,
      enemy.entityId,
      board,
      { school: 'FIRE', intent: 'damage' },
      { school: 'FIRE' },
      { arenaSchool: 'FIRE' },
    );
    const base = resolveTacticalCast(ctx, 100, { movementUsed: 0, maxMovement: 3 });
    expect(base.adjustedScore).toBeGreaterThan(100);
    expect(base.traces.join(' ')).toMatch(/Fire Tile/i);
  });

  it('reduces modifiers when null tile is in spell path (TLB-13)', () => {
    const map = {
      sceneId: 'test', width: 5, height: 5,
      cells: Array.from({ length: 5 }, (_, y) =>
        Array.from({ length: 5 }, (_, x) => ({ x, y, terrainType: 'snow', walkable: true })),
      ),
    };
    map.cells[2][2].terrainType = 'null';
    const board = compileBattleBoard({
      sourceSceneId: 'test', encounterId: 'enc', mapHash: 'hash',
      playerPosition: { x: 0, y: 2 }, enemySet: ['enemy-1'],
    }, map);
    const player = board.units.find((u) => u.side === 'player');
    const enemy = board.units.find((u) => u.side === 'enemy');
    player.x = 0;
    player.y = 2;
    enemy.x = 4;
    enemy.y = 2;
    const nullIndex = 2 * board.width + 2;
    board.tiles[nullIndex] = {
      ...board.tiles[nullIndex],
      terrain: 'null',
      modifier: { id: 'null_denial', kind: 'nullification', value: -0.20, appliesTo: 'area' },
    };

    const ctx = buildTacticalCastContext(
      player.entityId, enemy.entityId, board,
      { school: 'FIRE', intent: 'damage' },
      { school: 'FIRE' },
      {},
    );
    const withNull = resolveTacticalCast(ctx, 100, { movementUsed: 0, maxMovement: 3 });
    expect(withNull.traces.join(' ')).toMatch(/Null tile in path/i);
  });

  it('offsets movement penalty on matching school tile (PDR §14.3)', () => {
    const board = fixtureBoardWithFireTile();
    const player = board.units.find((u) => u.side === 'player');
    const fireTile = board.tiles.find((t) => t.terrain === 'fire');
    if (fireTile && player) {
      player.x = fireTile.x;
      player.y = fireTile.y;
    }
    const ctx = buildTacticalCastContext(
      player.entityId, null, board,
      { school: 'FIRE' }, { school: 'FIRE' }, {},
    );
    const result = resolveTacticalCast(ctx, 100, { movementUsed: 3, maxMovement: 3 });
    expect(result.traces.join(' ')).toMatch(/offsets movement penalty/i);
  });

  it('applies movement-casting penalty when player moved full budget (PDR §14.3)', () => {
    const board = fixtureBoardWithFireTile();
    const player = board.units.find((u) => u.side === 'player');
    const ctx = buildTacticalCastContext(
      player.entityId,
      null,
      board,
      { school: 'FIRE' },
      {},
      {},
    );
    const still = resolveTacticalCast(ctx, 100, { movementUsed: 0, maxMovement: 3 });
    const moved = resolveTacticalCast(ctx, 100, { movementUsed: 3, maxMovement: 3 });
    expect(still.adjustedScore).toBeGreaterThan(moved.adjustedScore);
  });

  it('applies high ground accuracy boost (TLB-8)', () => {
    const map = {
      sceneId: 'test',
      width: 3,
      height: 3,
      cells: Array.from({ length: 3 }, (_, y) =>
        Array.from({ length: 3 }, (_, x) => ({
          x,
          y,
          terrainType: x === 1 && y === 1 ? 'high_ground' : 'snow',
          walkable: true,
        })),
      ),
    };
    const board = compileBattleBoard({
      sourceSceneId: 'test',
      encounterId: 'enc',
      mapHash: 'hash',
      playerPosition: { x: 1, y: 1 },
      enemySet: [],
    }, map);
    const player = board.units.find((u) => u.side === 'player');
    const highTile = board.tiles.find((t) => t.x === 1 && t.y === 1);
    if (highTile && player) {
      highTile.terrain = 'high_ground';
      highTile.modifier = {
        id: 'high_ground_advantage',
        kind: 'accuracy_boost',
        value: 0.10,
        appliesTo: 'caster_tile',
        label: 'High Ground',
        description: 'Range +1, accuracy +10%.',
      };
      player.x = 1;
      player.y = 1;
    }
    const ctx = buildTacticalCastContext(
      player.entityId,
      null,
      board,
      { school: 'FIRE', intent: 'damage' },
      { school: 'FIRE' },
      {},
    );
    const result = resolveTacticalCast(ctx, 100, { movementUsed: 0, maxMovement: 3 });
    expect(result.traces.join(' ')).toMatch(/High Ground/i);
    expect(result.adjustedScore).toBeGreaterThan(110);
  });

  it('uses sceneContext arenaSchool when weave school is missing (TLB-12)', () => {
    const board = fixtureBoardWithFireTile();
    const player = board.units.find((u) => u.side === 'player');
    const fireTile = board.tiles.find((t) => t.terrain === 'fire');
    if (fireTile && player) {
      player.x = fireTile.x;
      player.y = fireTile.y;
    }
    const ctx = buildTacticalCastContext(
      player.entityId,
      null,
      board,
      { intent: 'damage' },
      {},
      { arenaSchool: 'FIRE', sceneId: 'combat-arena' },
    );
    const result = resolveTacticalCast(ctx, 100, { movementUsed: 0, maxMovement: 3 });
    expect(result.adjustedScore).toBeGreaterThan(100);
    expect(result.traces.join(' ')).toMatch(/Fire Tile/i);
  });

  it('applies rune tile spell roll bonus (TLB-14)', () => {
    const map = {
      sceneId: 'test',
      width: 3,
      height: 3,
      cells: Array.from({ length: 3 }, (_, y) =>
        Array.from({ length: 3 }, (_, x) => ({
          x,
          y,
          terrainType: x === 1 && y === 1 ? 'rune' : 'snow',
          walkable: true,
        })),
      ),
    };
    const board = compileBattleBoard({
      sourceSceneId: 'test',
      encounterId: 'enc',
      mapHash: 'hash',
      playerPosition: { x: 1, y: 1 },
      enemySet: [],
    }, map);
    const player = board.units.find((u) => u.side === 'player');
    const runeTile = board.tiles.find((t) => t.x === 1 && t.y === 1);
    if (runeTile && player) {
      runeTile.terrain = 'rune';
      runeTile.modifier = {
        id: 'rune_spell_bonus',
        kind: 'spell_roll_bonus',
        value: 0.08,
        appliesTo: 'caster_tile',
        label: 'Rune Tile',
        description: '+1 spell die or +8% bridge stability.',
      };
      player.x = 1;
      player.y = 1;
    }
    const ctx = buildTacticalCastContext(
      player.entityId,
      null,
      board,
      { school: 'MYTH', intent: 'damage' },
      { school: 'MYTH' },
      {},
    );
    const result = resolveTacticalCast(ctx, 100, { movementUsed: 0, maxMovement: 3 });
    expect(result.traces.join(' ')).toMatch(/Rune Tile/i);
    expect(result.adjustedScore).toBeGreaterThan(110);
  });
});
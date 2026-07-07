import { stableHash } from '../../../codex/core/leyline.engine.js';
import { compileBattleBoard } from '../../../codex/core/combat/tactical-board.compiler.js';

const AFFINITY_TO_TERRAIN = {
  FIRE: 'fire',
  VOID: 'void',
  SONIC: 'sonic',
  HOLY: 'holy',
  ICE: 'ice',
};

function buildPolarisForestMapState(snapshot = {}) {
  const size = snapshot.gridSize || 13;
  const spawn = snapshot.spawnTile || { tx: 6, ty: 10 };
  const leylineByCoord = new Map(
    (snapshot.leylines || []).map((l) => [`${l.coord.x},${l.coord.y}`, l]),
  );

  const cells = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const ley = leylineByCoord.get(`${x},${y}`);
      const nearSpawn = Math.hypot(x - spawn.tx, y - spawn.ty) < 2.5;
      const terrainType = ley
        ? (AFFINITY_TO_TERRAIN[ley.affinity] || 'sonic')
        : (nearSpawn ? 'anchor' : 'sonic');
      return {
        x,
        y,
        z: 0,
        terrainType,
        walkable: true,
        blocksLineOfSight: false,
      };
    }),
  );

  return {
    sceneId: snapshot.sceneId || 'polaris-sonic-forest',
    width: size,
    height: size,
    cells,
  };
}

export function buildMapStateFromArena(snapshot = {}) {
  if (snapshot.sceneId === 'polaris-sonic-forest') {
    return buildPolarisForestMapState(snapshot);
  }

  const size = snapshot.gridSize || 9;
  const leylineByCoord = new Map(
    (snapshot.leylines || []).map((l) => [`${l.coord.x},${l.coord.y}`, l]),
  );

  const cells = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const ley = leylineByCoord.get(`${x},${y}`);
      const terrainType = ley
        ? (AFFINITY_TO_TERRAIN[ley.affinity] || 'rune')
        : (x === 4 && y === 4 ? 'anchor' : 'snow');
      const cell = {
        x,
        y,
        z: 1,
        terrainType,
        walkable: true,
        blocksLineOfSight: false,
      };
      if (x === 4 && y === 4) {
        cell.objectId = 'center-obelisk';
        cell.objectType = 'obelisk';
      }
      return cell;
    }),
  );

  return {
    sceneId: snapshot.sceneId || 'combat-arena',
    width: size,
    height: size,
    cells,
  };
}

export function buildBattleBoardSeed(snapshot = {}) {
  const pos = snapshot.playerGridPos || { tx: 0, ty: 0 };
  return {
    sourceSceneId: snapshot.sceneId || 'combat-arena',
    encounterId: snapshot.encounterId || 'arena-default',
    mapHash: snapshot.mapHash || String(stableHash(`${snapshot.sceneId}:${snapshot.gridSize}`)),
    playerPosition: { x: pos.tx, y: pos.ty },
    enemySet: snapshot.enemies || [],
  };
}

export function compileArenaBattleBoard(snapshot = {}) {
  return compileBattleBoard(buildBattleBoardSeed(snapshot), buildMapStateFromArena(snapshot));
}
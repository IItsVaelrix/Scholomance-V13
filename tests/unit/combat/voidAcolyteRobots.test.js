import { describe, expect, it } from 'vitest';
import { DEFAULT_BLOCKED_TILES } from '../../../src/game/combat/combatPathfinding.js';
import {
  PLAYER_SPAWN_TILE,
  PORTAL_DUEL_BOSS_TILE,
  PORTAL_DUEL_PLAYER_TILE,
  PORTAL_TILE,
} from '../../../src/game/combat/portalPhase.js';
import {
  getPortalWardenDuelLayout,
  getVoidAcolyteSpawnTile,
} from '../../../src/game/combat/voidAcolyteRobots.js';

describe('voidAcolyteRobots', () => {
  it('lays out portal duel with player south and boss north on center file', () => {
    const duel = getPortalWardenDuelLayout();
    expect(duel.player).toEqual(PORTAL_DUEL_PLAYER_TILE);
    expect(duel.boss).toEqual(PORTAL_DUEL_BOSS_TILE);
    expect(duel.player.tx).toBe(duel.boss.tx);
    expect(duel.player.ty).toBeGreaterThan(duel.boss.ty);
    expect(getVoidAcolyteSpawnTile()).toEqual(PORTAL_DUEL_BOSS_TILE);
  });

  it('places duel tiles on walkable ground away from portal and obelisk blocks', () => {
    const duel = getPortalWardenDuelLayout();
    const blocked = new Set(DEFAULT_BLOCKED_TILES.map(({ tx, ty }) => `${tx},${ty}`));

    expect(blocked.has(`${duel.player.tx},${duel.player.ty}`)).toBe(false);
    expect(blocked.has(`${duel.boss.tx},${duel.boss.ty}`)).toBe(false);
    expect(blocked.has(`${PORTAL_TILE.tx},${PORTAL_TILE.ty}`)).toBe(true);

    expect(duel.player.tx).toBe(PLAYER_SPAWN_TILE.tx);
    expect(duel.player.ty).toBeGreaterThan(PLAYER_SPAWN_TILE.ty);
    expect(duel.boss.ty).toBeLessThan(PLAYER_SPAWN_TILE.ty);
    expect(duel.player.ty - duel.boss.ty).toBe(8);
  });
});
import {
  PORTAL_DUEL_BOSS_TILE,
  PORTAL_DUEL_PLAYER_TILE,
  PORTAL_WARDEN_ID,
} from './portalPhase.js';

export const VOID_ACOLYTE_STAT_DEFAULTS = Object.freeze({
  id: PORTAL_WARDEN_ID,
  label: 'Void1',
  shortLabel: 'Void1',
  spriteAsset: 'Void1',
  boss: true,
  hp: 120,
  maxHp: 120,
  weaveObjects: Object.freeze(['VOID', 'FLESH', 'SPIRIT']),
  school: 'VOID',
  interactionPriority: 500,
  intelligence: 52,
  scholomanceOverrides: Object.freeze({ BAPO: 22, SONIC: 8 }),
  movementPoints: 4,
  attackRange: 8,
});

export function getPortalWardenDuelLayout() {
  return {
    player: { ...PORTAL_DUEL_PLAYER_TILE },
    boss: { ...PORTAL_DUEL_BOSS_TILE },
  };
}

export function getVoidAcolyteSpawnTile() {
  return { ...PORTAL_DUEL_BOSS_TILE };
}

export function isPortalWardenId(id) {
  return id === PORTAL_WARDEN_ID;
}
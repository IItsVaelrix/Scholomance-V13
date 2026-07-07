/** NE dimensional portal grid anchor (matches drawTeleportationPortal). */
export const PORTAL_TILE = Object.freeze({ tx: 8, ty: 0 });

/** Default player spawn in the combat arena. */
export const PLAYER_SPAWN_TILE = Object.freeze({ tx: 4, ty: 6 });

/**
 * Portal warden duel layout — player south, boss north on the center file.
 * Player (4,8) anchors the near edge; boss (4,0) anchors the far edge.
 */
export const PORTAL_DUEL_PLAYER_TILE = Object.freeze({ tx: 4, ty: 8 });
export const PORTAL_DUEL_BOSS_TILE = Object.freeze({ tx: 4, ty: 0 });

/** Iso horizontal axis used for left/right board placement (tx - ty). */
export function combatIsoScreenX(tx, ty) {
  return tx - ty;
}

export const PORTAL_PHASE = Object.freeze({
  DORMANT: 'dormant',
  UNSEALING: 'unsealing',
  BECKONING: 'beckoning',
  ENGAGED: 'engaged',
  CLEARED: 'cleared',
  TELEPORTED: 'teleported',
});

/** South clearing spawn after portal transit to Polaris. */
/** @deprecated Use polarisForestConfig.POLARIS_SPAWN_TILE — forest is a separate map. */
export const POLARIS_SPAWN_TILE = Object.freeze({ tx: 6, ty: 10 });

export const PORTAL_WARDEN_ID = 'portal-warden';
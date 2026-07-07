/**
 * Brazier sentinel robots — the floating torch matrices are fightable combatants.
 */

export const SENTINEL_ROBOTS = Object.freeze([
  Object.freeze({
    id: 'sentinel-west',
    label: 'Brazier Sentinel',
    shortLabel: 'Sentinel α',
    tx: 2,
    ty: 4,
    brazierIndex: 0,
  }),
  Object.freeze({
    id: 'sentinel-east',
    label: 'Brazier Sentinel',
    shortLabel: 'Sentinel β',
    tx: 6,
    ty: 4,
    brazierIndex: 1,
  }),
]);

export const OBELISK_TILE = Object.freeze({ tx: 4, ty: 4 });

/** Manhattan distance from the obelisk center that wakes the flank sentinels. */
export const OBELISK_AGGRO_RADIUS = 1;

export const SENTINEL_STAT_DEFAULTS = Object.freeze({
  hp: 40,
  maxHp: 40,
  weaveObjects: Object.freeze(['FLESH', 'STONE', 'FIRE', 'SPIRIT']),
  school: 'SONIC',
  interactionPriority: 480,
  intelligence: 58,
  scholomanceOverrides: Object.freeze({ BAPO: 14, SONIC: 10 }),
});

/** Per-sentinel INT variance — same kit, different tactical personality. */
export const SENTINEL_INTELLIGENCE_PROFILES = Object.freeze({
  'sentinel-west': Object.freeze({
    intelligence: 58,
    cognitionLabel: 'tactical',
    roleNote: 'Flank matrix — scores abilities, skips redundant burns.',
  }),
  'sentinel-east': Object.freeze({
    intelligence: 82,
    cognitionLabel: 'mastermind',
    roleNote: 'Lattice controller — full reposition, finisher reads, optimal ML counters.',
  }),
});

/**
 * @param {string} sentinelId
 * @returns {{ intelligence: number, cognitionLabel?: string, roleNote?: string }}
 */
export function getSentinelIntelligenceProfile(sentinelId) {
  const profile = SENTINEL_INTELLIGENCE_PROFILES[sentinelId];
  return {
    intelligence: profile?.intelligence ?? SENTINEL_STAT_DEFAULTS.intelligence,
    cognitionLabel: profile?.cognitionLabel,
    roleNote: profile?.roleNote,
  };
}

/**
 * Combat stat overrides when registering a sentinel entity.
 *
 * @param {string} sentinelId
 */
export function getSentinelCombatOverrides(sentinelId) {
  const { intelligence } = getSentinelIntelligenceProfile(sentinelId);
  return { intelligence };
}

export function manhattanTileDistance(a, b) {
  return Math.abs(Number(a.tx) - Number(b.tx)) + Math.abs(Number(a.ty) - Number(b.ty));
}

export function isPlayerNearObelisk(
  playerTx,
  playerTy,
  radius = OBELISK_AGGRO_RADIUS,
  obelisk = OBELISK_TILE,
) {
  return manhattanTileDistance(
    { tx: playerTx, ty: playerTy },
    obelisk,
  ) <= radius;
}

export function getAggroableSentinels(sentinels = [], playerTx, playerTy) {
  if (!isPlayerNearObelisk(playerTx, playerTy)) return [];
  return sentinels.filter((entry) => !entry.defeated);
}

const SENTINEL_BY_ID = new Map(SENTINEL_ROBOTS.map((entry) => [entry.id, entry]));

export function isSentinelId(id) {
  return SENTINEL_BY_ID.has(id);
}

export function getSentinelDefinition(id) {
  return SENTINEL_BY_ID.get(id) || null;
}

export function getSentinelAtTile(tx, ty, sentinels = []) {
  const numericTx = Number(tx);
  const numericTy = Number(ty);
  return sentinels.find((entry) => (
    !entry.defeated
    && entry.tx === numericTx
    && entry.ty === numericTy
  )) || null;
}

/**
 * @param {object} options
 * @param {Array<{ id: string, label: string, tx: number, ty: number, defeated?: boolean }>} options.sentinels
 * @param {{ canAttack?: (attackerId: string, targetId: string) => boolean } | null} [options.stats]
 * @param {string} [options.playerId]
 */
export function buildSentinelSceneTargets({ sentinels = [], stats = null, playerId = 'player' }) {
  return sentinels
    .filter((entry) => !entry.defeated)
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      kind: 'combatant',
      weaveObjects: [...SENTINEL_STAT_DEFAULTS.weaveObjects],
      tx: entry.tx,
      ty: entry.ty,
      inRange: stats?.isInAttackRange?.(playerId, entry.id)
        ?? stats?.canCastSpell?.(playerId, entry.id)
        ?? stats?.canAttack?.(playerId, entry.id)
        ?? false,
      reachable: true,
      interactionPriority: SENTINEL_STAT_DEFAULTS.interactionPriority,
      weaveAliases: Object.freeze([
        'SENTINEL',
        'BRAZIER',
        entry.shortLabel,
        entry.id,
        entry.label,
      ]),
      metadata: {
        school: SENTINEL_STAT_DEFAULTS.school,
        role: 'sentinel',
        shortLabel: entry.shortLabel,
        aggroed: !!entry.aggroed,
      },
    }));
}

/**
 * @param {Array<{ tx: number, ty: number, defeated?: boolean }>} sentinels
 * @param {Array<{ tx: number, ty: number }>} [baseBlocked]
 */
export function areAllSentinelsDefeated(sentinels = []) {
  if (!sentinels.length) return false;
  return sentinels.every((entry) => entry.defeated);
}

/**
 * Whether combat battle mode / battle music should engage.
 * Obelisk puzzle play continues after the flank sentinels are down.
 *
 * @param {object} [options]
 * @param {Array<{ defeated?: boolean }>} [options.sentinels]
 * @param {boolean} [options.combatVictoryAchieved]
 */
export function shouldEngageCombatBattle({
  sentinels = [],
  combatVictoryAchieved = false,
  portalWarden = null,
} = {}) {
  if (combatVictoryAchieved) return false;
  if (portalWarden?.aggroed && !portalWarden?.defeated) return true;
  if (!sentinels.length) return true;
  return !areAllSentinelsDefeated(sentinels);
}

export function buildSentinelBlockedTiles(sentinels = [], baseBlocked = []) {
  const tiles = [...baseBlocked];
  for (const entry of sentinels) {
    if (!entry.defeated) tiles.push({ tx: entry.tx, ty: entry.ty });
  }
  return tiles;
}
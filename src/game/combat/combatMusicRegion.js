export const COMBAT_MUSIC_REGION = Object.freeze({
  VOID_COURTYARD: 'void_courtyard',
  POLARIS_FOREST: 'polaris_sonic_forest',
});

/** Dispatched when Polaris forest ambient should take over combat music. */
export const COMBAT_FOREST_MUSIC_EVENT = 'combat-forest-music';

let activeRegion = COMBAT_MUSIC_REGION.VOID_COURTYARD;

export function setCombatMusicRegion(region) {
  activeRegion = region || COMBAT_MUSIC_REGION.VOID_COURTYARD;
}

export function getCombatMusicRegion() {
  return activeRegion;
}

export function isPolarisForestRegion() {
  return activeRegion === COMBAT_MUSIC_REGION.POLARIS_FOREST;
}
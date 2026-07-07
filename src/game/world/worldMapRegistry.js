/** Authoritative world map registry — tutorial island and connected regions. */

export const TUTORIAL_ISLAND_MAP_ID = 'tutorial-island';

export const POLARIS_FOREST_MAP_ID = 'polaris-sonic-forest';

export const WORLD_MAPS = Object.freeze({
  [TUTORIAL_ISLAND_MAP_ID]: Object.freeze({
    id: TUTORIAL_ISLAND_MAP_ID,
    sceneKey: 'CombatArenaScene',
    label: 'Void Courtyard',
    gridSize: 9,
    worldRegion: 'void_courtyard',
  }),
  [POLARIS_FOREST_MAP_ID]: Object.freeze({
    id: POLARIS_FOREST_MAP_ID,
    sceneKey: 'PolarisForestScene',
    label: 'Sonic Thaumaturgist Forest',
    gridSize: 13,
    worldRegion: 'polaris_sonic_forest',
    spawnTile: Object.freeze({ tx: 6, ty: 10 }),
  }),
});

/** Portal on the tutorial island that links to Polaris after the warden falls. */
export const TUTORIAL_TO_POLARIS_CONNECTION = Object.freeze({
  from: TUTORIAL_ISLAND_MAP_ID,
  to: POLARIS_FOREST_MAP_ID,
  portalTile: Object.freeze({ tx: 8, ty: 2 }),
  trigger: 'portal-cleared',
});

/**
 * @param {string} mapId
 */
export function resolveWorldMap(mapId) {
  return WORLD_MAPS[mapId] ?? null;
}
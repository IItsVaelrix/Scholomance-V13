/**
 * PixelBrain-authoritative ice biome palette remap for the combat arena voxel terrain.
 * Palette keys sourced from void_ice_floor.scdl (frost / snowbase / snowlit → void_ice + cyan_glow).
 */

export const ICE_BIOME_PALETTE_KEYS = Object.freeze({
  deep: 'void_ice',
  mid: 'void_ice',
  slope: 'void_ice',
  peak: 'cyan_glow',
  edge: 'void_ice',
  trench: 'void_ice',
});

export const VOID_BIOME_PALETTE_KEYS = Object.freeze({
  deep: 'voidsteel',
  mid: 'obsidian',
  slope: 'void_ice',
  peak: 'cyan_glow',
  edge: 'obsidian',
  trench: 'voidsteel',
});

/** Sonic thaumaturgist forest — mossy teal earth with resonant crystal peaks. */
export const POLARIS_SONIC_PALETTE_KEYS = Object.freeze({
  deep: 'sonic_moss',
  mid: 'sonic_moss',
  slope: 'sonic_bark',
  peak: 'cyan_glow',
  edge: 'sonic_bark',
  trench: 'sonic_moss',
});

/**
 * @param {'void'|'frozen'} biome
 * @param {{ z: number, isEdge: boolean }} voxel
 * @returns {keyof typeof ICE_BIOME_PALETTE_KEYS}
 */
export function resolveVoxelPaletteBand(biome, { z, isEdge }) {
  const table = biome === 'polaris_sonic'
    ? POLARIS_SONIC_PALETTE_KEYS
    : (biome === 'frozen' ? ICE_BIOME_PALETTE_KEYS : VOID_BIOME_PALETTE_KEYS);
  if (isEdge) return table.edge;
  if (z > 22) return table.peak;
  if (z > 14) return table.slope;
  if (z > 8) return table.mid;
  return table.trench;
}

/**
 * @param {object} scene - CombatArenaScene with arenaBiome + redrawVoxelTerrain
 */
export function applyIceBiome(scene) {
  if (!scene) return false;
  scene.arenaBiome = 'frozen';
  if (typeof scene.redrawVoxelTerrain === 'function') {
    scene.redrawVoxelTerrain();
  }
  if (scene.iceSmokeEmitter) {
    scene.iceSmokeEmitter.setFrequency(28);
  }
  return true;
}

/**
 * @param {object} scene - CombatArenaScene with arenaBiome + redrawVoxelTerrain
 */
export function applyPolarisSonicBiome(scene) {
  if (!scene) return false;
  scene.arenaBiome = 'polaris_sonic';
  if (typeof scene.redrawVoxelTerrain === 'function') {
    scene.redrawVoxelTerrain();
  }
  if (scene.iceSmokeEmitter) {
    scene.iceSmokeEmitter.setFrequency(12);
  }
  return true;
}
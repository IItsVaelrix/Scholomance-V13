/** Scholomance procedural SFX — Audio Forge runtime settings */

export const GAME_AUDIO_FORGE_SETTINGS_KEY = 'scholomance.audioForge.settings.v1';

export const GAME_AUDIO_FORGE_DEFAULTS = Object.freeze({
  enabled: true,
  combatVolume: 0.85,
  magicVolume: 0.95,
  uiVolume: 0.7,
});

/** Event types pre-warmed on first unlock (common one-shots). */
export const GAME_AUDIO_FORGE_PREWARM_EVENTS = Object.freeze([
  'FOOTSTEP',
  'SPELL_CAST',
  'SPELL_HIT',
  'UI_CONFIRM',
  'LEYLINE_EXTRACTION_SUCCESS',
  'OBELISK_CHARGE',
  'OBELISK_DISCHARGE',
]);
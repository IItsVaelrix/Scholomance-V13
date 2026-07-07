/** Obelisk lightning discharge — served from /public/audio/scholosound */
export const GAME_OBELISK_ELECTRIC_SAMPLE = Object.freeze({
  id: 'lightning-strike-with-sparks-gamemaster',
  title: 'Lightning Strike With Sparks',
  url: '/audio/scholosound/lightning-strike-with-sparks-gamemaster-audio-3-3-00-04.mp3',
  /** Authoritative source archive path (encyclopedia) */
  sourcePath:
    'docs/scholomance-encyclopedia/scholosound/songs/lightning-strike-with-sparks-gamemaster-audio-3-3-00-04.mp3',
  /** ~4.9 s one-shot at 44.1 kHz export */
  durationMs: 4885,
});

export const GAME_OBELISK_ELECTRIC_SETTINGS_KEY = 'scholomance.obeliskElectric.settings.v1';

export const GAME_OBELISK_ELECTRIC_DEFAULTS = Object.freeze({
  enabled: true,
  chargeVolume: 0.62,
  dischargeVolume: 0.95,
  /** When true, procedural Audio Forge zaps are skipped in favor of the sample. */
  preferSample: true,
});
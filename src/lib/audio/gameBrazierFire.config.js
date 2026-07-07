/** Combat arena brazier fire — served from /public/audio/scholosound */
export const GAME_BRAZIER_FIRE_SAMPLE = Object.freeze({
  id: 'soundreality-fire-crackling',
  title: 'Fire Crackling',
  url: '/audio/scholosound/soundreality-fire-crackling-sound-499636.mp3',
  /** Authoritative source archive path (encyclopedia) */
  sourcePath:
    'docs/scholomance-encyclopedia/scholosound/songs/soundreality-fire-crackling-sound-499636.mp3',
  /** ~79.5 s loop at 44.1 kHz export */
  durationMs: 79536,
});

export const GAME_BRAZIER_FIRE_SETTINGS_KEY = 'scholomance.brazierFire.settings.v1';

export const GAME_BRAZIER_FIRE_DEFAULTS = Object.freeze({
  enabled: true,
  volume: 0.42,
});
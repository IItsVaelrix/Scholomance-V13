/** Combat sword swing — served from /public/audio/scholosound */
export const GAME_SWORD_SLICE_SAMPLE = Object.freeze({
  id: 'dragon-studio-sword-slice',
  title: 'Sword Slice',
  url: '/audio/scholosound/dragon-studio-sword-slice-393847.mp3',
  /** Authoritative source archive path (encyclopedia) */
  sourcePath:
    'docs/scholomance-encyclopedia/scholosound/songs/dragon-studio-sword-slice-393847.mp3',
  /** ~2.2 s one-shot at 44.1 kHz export */
  durationMs: 2194,
});

export const GAME_SWORD_SLICE_SETTINGS_KEY = 'scholomance.swordSlice.settings.v1';

export const GAME_SWORD_SLICE_DEFAULTS = Object.freeze({
  enabled: true,
  volume: 0.78,
});
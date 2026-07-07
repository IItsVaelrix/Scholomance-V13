/** Combat victory fanfare — served from /public/audio/scholosound */
export const GAME_VICTORY_SAMPLE = Object.freeze({
  id: 'victory',
  title: 'Victory!',
  url: '/audio/scholosound/victory.mp3',
  sourcePath: 'docs/scholomance-encyclopedia/scholosound/songs/Victory!.mp3',
  durationMs: 8400,
});

export const GAME_VICTORY_SETTINGS_KEY = 'scholomance.victory.settings.v1';

export const GAME_VICTORY_DEFAULTS = Object.freeze({
  enabled: true,
  volume: 0.82,
});
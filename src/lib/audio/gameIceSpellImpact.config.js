/** Void1 ice spell impact — served from /public/audio/scholosound */
export const GAME_ICE_SPELL_IMPACT_SAMPLE = Object.freeze({
  id: 'dragon-studio-ice-spell-impact',
  title: 'Ice Spell Impact',
  url: '/audio/scholosound/dragon-studio-ice-spell-impact-448563.mp3',
  sourcePath:
    'docs/scholomance-encyclopedia/scholosound/songs/dragon-studio-ice-spell-impact-448563.mp3',
  durationMs: 4704,
});

export const GAME_ICE_SPELL_IMPACT_SETTINGS_KEY = 'scholomance.iceSpellImpact.settings.v1';

/** −3 dB vs fireball impact default (0.84 × 10^(−3/20) ≈ 0.595) */
export const GAME_ICE_SPELL_IMPACT_DEFAULTS = Object.freeze({
  enabled: true,
  volume: 0.595,
});
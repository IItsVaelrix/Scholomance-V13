/** Combat chest unlock — served from /public/audio/scholosound */
export const COMBAT_CHEST_UNLOCK_SAMPLE = {
  id: 'sound:combat-chest-unlock',
  title: 'Chest Unlock',
  url: '/audio/scholosound/chest-unlock-bonus.mp3',
};

export const COMBAT_CHEST_UNLOCK_SETTINGS_KEY = 'scholomance:audio:chest-unlock';

export const COMBAT_CHEST_UNLOCK_DEFAULTS = Object.freeze({
  enabled: true,
  volume: 0.8,
});

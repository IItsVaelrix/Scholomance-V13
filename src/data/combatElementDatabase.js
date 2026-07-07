/**
 * combatElementDatabase.js — plug-and-play combat elements.
 *
 * Mirrors src/data/itemDatabase.js conventions: a keyed object where each entry
 * carries id/assetId/name/type/rarity/icon/sprite, plus element-specific visual,
 * trigger, and status fields. Adding an element (ice, poison, …) is adding an
 * entry here — no scene code changes.
 */

export const COMBAT_ELEMENT_DATABASE = {
  element_fire: {
    id: 'element_fire',
    assetId: 'FireStreak',
    name: 'Immolation',
    type: 'fire',
    rarity: 'common',
    icon: '/assets/elements/FireStreak-icon.png',
    sprite: '/assets/elements/FireStreak-f0-png.png',
    triggers: ['fire', 'flame', 'burn', 'incinerat', 'immolat'],
    streakColor: 0xff6600,
    glowColor: 0xff3300,
    particleTint: 0xffaa00,
    status: { chainId: 'burn', damagePerTurn: 3, turns: 3, disposition: 'DEBUFF' },
  },
};

/** First element whose any trigger substring appears in `text` (case-insensitive), else null. */
export function matchElement(text) {
  const hay = String(text || '').toLowerCase();
  if (!hay) return null;
  for (const el of Object.values(COMBAT_ELEMENT_DATABASE)) {
    if (el.triggers.some((t) => hay.includes(t))) return el;
  }
  return null;
}

/** Look up an element by id, or null. */
export function getElement(id) {
  return COMBAT_ELEMENT_DATABASE[id] || null;
}

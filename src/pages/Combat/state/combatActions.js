/**
 * combatActions.js
 *
 * Single source of truth for combat action definitions, hotkey bindings,
 * and footer/hint text. Both the ActionBar and the keymap handler in
 * CombatPage derive from ACTION_DEFS so the footer, the button hotkeys,
 * and the keyboard handler can never drift.
 *
 * Action glyphs are world-law-coded (not generic icons):
 *   INSCRIBE ✦  — four-pointed star: active inscription, light-carving
 *   MOVE     ◈  — diamond with dot: lattice navigation, positional intent
 *   CHANNEL  ◉  — bullseye: energy focus, restoration circuit
 *   EXTRACT  ⚗  — alembic: alchemical transmutation of leylines
 *   WAIT     ◌  — open circle: held breath, temporal patience
 *   FLEE     ↗  — diagonal arrow: escape vector
 */

export const ACTION_DEFS = [
  { id: 'INSCRIBE', glyph: '✦', label: 'INSCRIBE', hotkey: '1', title: 'Compose and cast a verse' },
  { id: 'MOVE',     glyph: '◈', label: 'MOVE',     hotkey: '2', title: 'Move on the tactical grid' },
  { id: 'CHANNEL',  glyph: '◉', label: 'CHANNEL',  hotkey: '3', title: 'Channel energy to restore MP' },
  { id: 'EXTRACT',  glyph: '⚗', label: 'EXTRACT',  hotkey: '6', title: 'Extract mana from a glowing leyline', situational: true },
  { id: 'WAIT',     glyph: '◌', label: 'WAIT',     hotkey: '4', title: 'End turn without acting' },
  { id: 'FLEE',     glyph: '↗', label: 'FLEE',     hotkey: '5', title: 'Escape the encounter' },
];

/** Map of digit-key string → action id, derived from ACTION_DEFS. */
export const HOTKEY_TO_ACTION = ACTION_DEFS.reduce((acc, def) => {
  acc[def.hotkey] = def.id;
  return acc;
}, {});

/**
 * Compact footer segment listing action hotkeys.
 * Continuous ranges collapse: [1,2,3,6,4,5] → "1–6".
 * Non-contiguous sets list explicitly.
 */
export function buildActionHotkeyFooter() {
  const nums = ACTION_DEFS.map(d => Number(d.hotkey)).sort((a, b) => a - b);
  const min = nums[0];
  const max = nums[nums.length - 1];
  const isContiguous = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  const range = isContiguous && max - min + 1 === nums.length
    ? `${min}–${max}`
    : nums.join(', ');
  return `[${range}] ACTIONS`;
}

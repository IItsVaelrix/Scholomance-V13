/** React ↔ Phaser game handle for combat commands and dev tooling. */

/** @type {import('phaser').Game | null} */
let combatGame = null;

/**
 * @param {import('phaser').Game | null | undefined} game
 */
export function registerCombatGame(game) {
  combatGame = game ?? null;
}

export function unregisterCombatGame() {
  combatGame = null;
}

/**
 * @returns {import('phaser').Game | null}
 */
export function getCombatGame() {
  return combatGame;
}
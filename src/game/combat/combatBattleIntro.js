/** Matrix flood duration — aligned to PDR §6.1 full transition. */
export const COMBAT_MATRIX_INTRO_DURATION_MS = 3000;

/** Compressed repeat-battle transition (PDR §6.3). */
export const COMBAT_MATRIX_INTRO_COMPRESSED_MS = 800;

/** Fade-out window at the end of the intro sequence. */
export const COMBAT_MATRIX_INTRO_EXIT_MS = 520;

/** Reduced-motion fallback — brief flash instead of full rain. */
export const COMBAT_MATRIX_INTRO_REDUCED_MS = 900;

export const COMBAT_BATTLE_STARTED_EVENT = 'combat-battle-started';
export const COMBAT_BATTLE_ENDED_EVENT = 'combat-battle-ended';

/** Movement range while exploring the arena outside of turn-based combat. */
export const COMBAT_FREE_ROAM_MOVEMENT_RANGE = 64;

let battleStartedPending = false;

export function markCombatBattleStarted() {
  battleStartedPending = true;
}

export function consumeCombatBattleStarted() {
  const pending = battleStartedPending;
  battleStartedPending = false;
  return pending;
}

export function resetCombatBattleEngagement() {
  battleStartedPending = false;
}

export function resetCombatBattleIntroForTests() {
  resetCombatBattleEngagement();
}
import { describe, expect, it } from 'vitest';
import {
  COMBAT_BATTLE_ENDED_EVENT,
  COMBAT_BATTLE_STARTED_EVENT,
  COMBAT_MATRIX_INTRO_DURATION_MS,
  COMBAT_MATRIX_INTRO_EXIT_MS,
  COMBAT_MATRIX_INTRO_REDUCED_MS,
  consumeCombatBattleStarted,
  markCombatBattleStarted,
  resetCombatBattleEngagement,
  resetCombatBattleIntroForTests,
} from '../../../src/game/combat/combatBattleIntro.js';

describe('combatBattleIntro', () => {
  it('exposes matrix intro timing in the 3-4 second window', () => {
    expect(COMBAT_MATRIX_INTRO_DURATION_MS).toBeGreaterThanOrEqual(3000);
    expect(COMBAT_MATRIX_INTRO_DURATION_MS).toBeLessThanOrEqual(4000);
    expect(COMBAT_MATRIX_INTRO_EXIT_MS).toBeGreaterThan(0);
    expect(COMBAT_MATRIX_INTRO_REDUCED_MS).toBeLessThan(COMBAT_MATRIX_INTRO_DURATION_MS);
  });

  it('tracks battle-started intent for late arena boot', () => {
    resetCombatBattleIntroForTests();
    expect(consumeCombatBattleStarted()).toBe(false);
    markCombatBattleStarted();
    expect(consumeCombatBattleStarted()).toBe(true);
    expect(consumeCombatBattleStarted()).toBe(false);
  });

  it('uses stable battle lifecycle event names', () => {
    expect(COMBAT_BATTLE_STARTED_EVENT).toBe('combat-battle-started');
    expect(COMBAT_BATTLE_ENDED_EVENT).toBe('combat-battle-ended');
  });

  it('clears pending battle engagement on reset', () => {
    markCombatBattleStarted();
    resetCombatBattleEngagement();
    expect(consumeCombatBattleStarted()).toBe(false);
  });
});
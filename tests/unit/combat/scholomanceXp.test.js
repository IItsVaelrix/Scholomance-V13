import { describe, it, expect, beforeEach } from 'vitest';
import {
  SCHOLOMANCE_XP_ACTIONS,
  buildScholomanceBlockFromXpStats,
  getStatLevelFromXp,
  resolveXpGrantsForAction,
  statValueFromLevel,
} from '../../../codex/core/scholomance-xp.schema.js';
import {
  applyStatXpGrants,
  normalizeScholomanceXpState,
  accountXpFromStatGrants,
} from '../../../src/game/combat/scholomanceXp.js';
import {
  grantScholomanceXpForAction,
  resetScholomanceXpForTests,
} from '../../../src/game/character/scholomanceXpService.js';

describe('scholomanceXp', () => {
  beforeEach(() => {
    resetScholomanceXpForTests();
  });

  it('derives stat values from level', () => {
    expect(statValueFromLevel('VALCH', 1)).toBe(10);
    expect(statValueFromLevel('VALCH', 16)).toBe(25);
  });

  it('applies grants and levels up stats', () => {
    const state = normalizeScholomanceXpState();
    const grants = resolveXpGrantsForAction(SCHOLOMANCE_XP_ACTIONS.BASIC_ATTACK);
    const first = applyStatXpGrants(state, grants);
    expect(first.applied.length).toBeGreaterThan(0);
    expect(first.state.stats.BAPO.xp).toBeGreaterThan(0);

    const boosted = applyStatXpGrants(first.state, grants);
    expect(boosted.state.stats.BAPO.xp).toBeGreaterThan(first.state.stats.BAPO.xp);
  });

  it('deduplicates one-time discovery grants', () => {
    const first = grantScholomanceXpForAction(SCHOLOMANCE_XP_ACTIONS.OBELISK_LOOT);
    const second = grantScholomanceXpForAction(SCHOLOMANCE_XP_ACTIONS.OBELISK_LOOT);
    expect(first.applied.length).toBeGreaterThan(0);
    expect(second.applied.length).toBe(0);
  });

  it('builds scholomance combat block from xp stats', () => {
    const state = normalizeScholomanceXpState();
    state.stats.VALCH = { xp: getStatLevelFromXp(1000) * 10, level: getStatLevelFromXp(1000) };
    const block = buildScholomanceBlockFromXpStats(state.stats);
    expect(block.VALCH).toBeGreaterThan(10);
  });

  it('bridges a fraction of stat xp to account progression', () => {
    const applied = [{ amount: 40 }, { amount: 20 }];
    expect(accountXpFromStatGrants(applied)).toBe(15);
  });
});
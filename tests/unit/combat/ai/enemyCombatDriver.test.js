import { afterAll, describe, expect, it } from 'vitest';
import { CombatStatController } from '../../../../src/game/combat/combatStatController.js';
import { registerCombatBestiaryEntry, listCombatBestiaryEntries } from '../../../../src/game/combat/bestiary/combatBestiary.registry.js';
import { driveEnemyTurn } from '../../../../src/game/combat/ai/enemyCombatDriver.js';

// Self-contained fake enemy so the test does not depend on real entries.
const FAKE = {
  id: 'test-dummy-ai',
  priority: 999,
  matches: (ctx) => ctx.record?.role === 'test-dummy',
  combatAI: {
    buildProfile: () => ({ isRanged: false, preferredRange: 1, minRange: 0, role: 'bruiser', weightOverrides: {} }),
    buildAbilityKit: () => ({ isRanged: false, preferredRange: 1, minRange: 0, estimateAttackDamage: () => 5, canActFromRange: (d) => d <= 1 }),
  },
};
registerCombatBestiaryEntry(FAKE);
afterAll(() => {
  const idx = listCombatBestiaryEntries().findIndex((e) => e.id === FAKE.id);
  if (idx >= 0) listCombatBestiaryEntries().splice(idx, 1);
});

describe('driveEnemyTurn', () => {
  it('produces a TurnPlan for a registered enemy via its combatAI', () => {
    const stats = new CombatStatController();
    stats.registerEntity('mob', { hp: 30, maxHp: 30, tx: 1, ty: 1, overrides: { intelligence: 10 } });
    stats.registerEntity('player', { hp: 100, maxHp: 100, tx: 4, ty: 1 });
    const plan = driveEnemyTurn({ entityId: 'mob', record: { role: 'test-dummy' }, stats, allies: [], targetId: 'player', rng: () => 0.5 });
    expect(plan).not.toBeNull();
    expect(['advance', 'hold']).toContain(plan.movement.kind);
    expect(plan.reasons.length).toBeGreaterThan(0);
  });

  it('returns null when no combatAI entry matches', () => {
    const stats = new CombatStatController();
    stats.registerEntity('mob', { hp: 30, maxHp: 30, tx: 1, ty: 1 });
    stats.registerEntity('player', { hp: 100, maxHp: 100, tx: 4, ty: 1 });
    expect(driveEnemyTurn({ entityId: 'mob', record: { role: 'nope' }, stats })).toBeNull();
  });
});
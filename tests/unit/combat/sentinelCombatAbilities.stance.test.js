import { describe, expect, it } from 'vitest';
import { CombatStatController } from '../../../src/game/combat/combatStatController.js';
import { createSentinelAbilityState, planSentinelAttack } from '../../../src/game/combat/sentinelCombatAbilities.js';

function setup() {
  const stats = new CombatStatController();
  stats.registerEntity('sentinel-west', { hp: 40, maxHp: 40, tx: 4, ty: 5, overrides: { intelligence: 40 } });
  stats.registerEntity('player', { hp: 100, maxHp: 100, tx: 4, ty: 6 });
  const record = { id: 'sentinel-west', shortLabel: 'α', abilities: createSentinelAbilityState() };
  return { stats, record };
}

describe('planSentinelAttack stance conservation', () => {
  it('conserves Matrix Burn when stance is not AGGRESSIVE', () => {
    const { stats, record } = setup();
    const plan = planSentinelAttack({ record, sentinels: [record], stats, stance: 'KITE', rng: () => 0.99 });
    expect(plan.applyBurn).toBe(false);
    expect(record.abilities.burnCooldown).toBe(0);
  });

  it('still applies Matrix Burn when AGGRESSIVE (default)', () => {
    const { stats, record } = setup();
    const plan = planSentinelAttack({ record, sentinels: [record], stats, rng: () => 0.99 });
    expect(plan.applyBurn).toBe(true);
  });
});
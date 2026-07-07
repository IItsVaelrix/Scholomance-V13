import { describe, expect, it } from 'vitest';
import { sentinelBrazierBestiaryEntry } from '../../../../src/game/combat/bestiary/entries/sentinelBrazier.entry.js';

describe('sentinel combatAI kit', () => {
  const entity = { scholomance: { BAPO: 14 }, attackRange: 2 };
  const ctx = { enemyId: 'sentinel-west', entity };

  it('exposes a profile and an ability kit', () => {
    expect(typeof sentinelBrazierBestiaryEntry.combatAI.buildProfile).toBe('function');
    const kit = sentinelBrazierBestiaryEntry.combatAI.buildAbilityKit(ctx);
    expect(kit.estimateAttackDamage()).toBe(7); // round(14/2)
    expect(kit.canActFromRange(2)).toBe(true);
    expect(kit.canActFromRange(3)).toBe(false);
  });
});
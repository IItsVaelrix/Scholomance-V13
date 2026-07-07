import { describe, expect, it } from 'vitest';
import { voidAcolyteBestiaryEntry } from '../../../../src/game/combat/bestiary/entries/voidAcolyte.entry.js';

describe('void acolyte combatAI kit', () => {
  const entity = { scholomance: { BAPO: 22 }, attackRange: 1 };
  const ctx = { enemyId: 'portal-warden', entity };

  it('exposes bruiser melee profile and kit', () => {
    const profile = voidAcolyteBestiaryEntry.combatAI.buildProfile(ctx);
    expect(profile.role).toBe('bruiser');
    expect(profile.preferredRange).toBe(1);

    const kit = voidAcolyteBestiaryEntry.combatAI.buildAbilityKit(ctx);
    expect(kit.estimateAttackDamage()).toBe(11);
    expect(kit.canActFromRange(1)).toBe(true);
    expect(kit.canActFromRange(2)).toBe(false);
  });
});
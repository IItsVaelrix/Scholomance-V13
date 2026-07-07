import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MANA_POINTS,
  SPELL_CAST_AP_COST,
  SPELL_CAST_MANA_COST,
  hasApForSpellweaveInvoke,
  hasManaForSpell,
} from '../../../src/game/combat/combatMana.js';

describe('combatMana', () => {
  it('exports the arena spellcasting defaults', () => {
    expect(DEFAULT_MANA_POINTS).toBe(100);
    expect(SPELL_CAST_MANA_COST).toBe(10);
    expect(SPELL_CAST_AP_COST).toBe(3);
  });

  it('checks whether a caster can afford spellweave Invoke from AP', () => {
    expect(hasApForSpellweaveInvoke(3)).toBe(true);
    expect(hasApForSpellweaveInvoke(2)).toBe(false);
    expect(hasApForSpellweaveInvoke(null)).toBe(false);
  });

  it('checks whether a caster can afford legacy mana checks', () => {
    expect(hasManaForSpell(10)).toBe(true);
    expect(hasManaForSpell(9)).toBe(false);
    expect(hasManaForSpell(null)).toBe(false);
  });
});
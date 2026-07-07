import { describe, it, expect } from 'vitest';
import {
  computeSpellQuality,
  discoveryBonusFromStat,
  statModifierForSpell,
} from '../../../src/game/combat/spellQuality.js';
import { EXAMPLE_SPELL_INCINERATE_STUDENT } from '../../../src/game/combat/scholomanceStats.js';

describe('spellQuality', () => {
  it('returns baseline quality at neutral stats', () => {
    const result = computeSpellQuality({
      spell: EXAMPLE_SPELL_INCINERATE_STUDENT,
      stats: {},
    });
    expect(result.total).toBe(12);
    expect(result.primaryModifier).toBe(0);
    expect(result.secondaryModifier).toBe(0);
    expect(result.discoveryBonus).toBe(0);
  });

  it('scales primary and secondary stats for Incinerate Student', () => {
    const result = computeSpellQuality({
      spell: EXAMPLE_SPELL_INCINERATE_STUDENT,
      stats: {
        VALCH: 20,
        BAPO: 16,
        CINF: 14,
        MYTH: 18,
      },
    });
    expect(result.primaryModifier).toBe(statModifierForSpell(20, 1));
    expect(result.secondaryModifier).toBe(statModifierForSpell(16, 0.5));
    expect(result.presentationModifier).toBeGreaterThan(0);
    expect(result.mythicResonance).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(12);
  });

  it('adds DISCOVERY bonus only for novel usage', () => {
    const without = computeSpellQuality({
      spell: EXAMPLE_SPELL_INCINERATE_STUDENT,
      stats: { DISCOVERY: 24 },
      novelUsage: false,
    });
    const withNovel = computeSpellQuality({
      spell: EXAMPLE_SPELL_INCINERATE_STUDENT,
      stats: { DISCOVERY: 24 },
      novelUsage: true,
    });
    expect(without.discoveryBonus).toBe(0);
    expect(withNovel.discoveryBonus).toBe(discoveryBonusFromStat(24, true));
    expect(withNovel.total).toBeGreaterThan(without.total);
  });

  it('differentiates build archetypes at the same base rank', () => {
    const battleRapper = computeSpellQuality({
      spell: { baseRank: 10, primary: 'BAPO', secondary: 'SONIC', flavorStats: ['CINF'] },
      stats: { BAPO: 24, SONIC: 22, CINF: 20, KSYN: 10, PSYCH: 10 },
    });
    const scholar = computeSpellQuality({
      spell: { baseRank: 10, primary: 'KSYN', secondary: 'CODEX', flavorStats: [] },
      stats: { KSYN: 24, CODEX: 22, BAPO: 10, SONIC: 10 },
    });
    expect(battleRapper.total).not.toBe(scholar.total);
    expect(battleRapper.total).toBeGreaterThan(10);
    expect(scholar.total).toBeGreaterThan(10);
  });

  it('includes roll bonus in the total', () => {
    const result = computeSpellQuality({
      spell: { baseRank: 10, primary: 'VALCH' },
      stats: {},
      rollBonus: 3,
    });
    expect(result.rollBonus).toBe(3);
    expect(result.total).toBe(13);
  });
});
import { describe, expect, it } from 'vitest';
import {
  applySentinelBurnDebuff,
  createSentinelAbilityState,
  notePlayerSpellCastOnSentinels,
  planSentinelAttack,
  resolveSentinelAbilityDamage,
  SENTINEL_BURN_DEBUFF,
  tickSentinelAbilityState,
} from '../../../src/game/combat/sentinelCombatAbilities.js';
import { CombatStatController } from '../../../src/game/combat/combatStatController.js';

function makeSentinel(id, overrides = {}) {
  return {
    id,
    shortLabel: id,
    defeated: false,
    aggroed: true,
    abilities: createSentinelAbilityState(),
    ...overrides,
  };
}

describe('sentinelCombatAbilities', () => {
  it('applies matrix burn with a 5-turn cooldown', () => {
    const sentinels = [makeSentinel('sentinel-west')];
    const plan = planSentinelAttack({
      record: sentinels[0],
      sentinels,
      intelligence: 40,
      rng: () => 1,
    });

    expect(plan.applyBurn).toBe(true);
    expect(plan.abilityId).toBe('burn');
    expect(sentinels[0].abilities.burnCooldown).toBe(SENTINEL_BURN_DEBUFF.cooldownTurns);
  });

  it('boosts damage when WiFi-linked to another aggroed sentinel', () => {
    const sentinels = [
      makeSentinel('sentinel-west', { abilities: { ...createSentinelAbilityState(), burnCooldown: 3 } }),
      makeSentinel('sentinel-east', { abilities: { ...createSentinelAbilityState(), burnCooldown: 3 } }),
    ];

    const plan = planSentinelAttack({
      record: sentinels[0],
      sentinels,
      intelligence: 40,
      rng: () => 1,
    });

    expect(plan.mentalLinkActive).toBe(true);
    expect(plan.damageMultiplier).toBeGreaterThanOrEqual(1.25);
  });

  it('surfaces tactical reasoning when burn is withheld', () => {
    const stats = new CombatStatController();
    stats.registerEntity('player', { hp: 100, maxHp: 100, tx: 4, ty: 6 });
    stats.applyStatus('player', {
      chainId: 'sentinel_matrix_burn',
      damagePerTurn: 10,
      turns: 3,
      disposition: 'DEBUFF',
    });

    const sentinels = [makeSentinel('sentinel-west', {
      abilities: { ...createSentinelAbilityState(), burnCooldown: 0 },
    })];
    const plan = planSentinelAttack({
      record: sentinels[0],
      sentinels,
      stats,
      intelligence: 72,
      rng: () => 1,
    });

    expect(plan.applyBurn).toBe(false);
    expect(plan.logLines.some((line) => line.includes('Burn withheld'))).toBe(true);
  });

  it('requires extra turns for ML when the player has high CODEX', () => {
    const stats = new CombatStatController();
    stats.registerEntity('player', {
      hp: 100,
      maxHp: 100,
      scholomanceOverrides: { CODEX: 40, KSYN: 30 },
    });

    const sentinels = [makeSentinel('sentinel-west', {
      abilities: {
        ...createSentinelAbilityState(),
        burnCooldown: 3,
        turnsSincePlayerCast: 2,
        observedFamilies: ['FRACTURE'],
      },
    })];

    const plan = planSentinelAttack({
      record: sentinels[0],
      sentinels,
      stats,
      intelligence: 55,
      rng: () => 1,
    });

    expect(plan.mlSurvivalRequired).toBe(5);
    expect(plan.abilityId).not.toBe('machine_learning');
    expect(plan.logLines.some((line) => line.includes('Pattern lock extended'))).toBe(true);
  });

  it('triggers machine learning after two turns since a player cast', () => {
    const sentinels = [makeSentinel('sentinel-west', {
      abilities: {
        ...createSentinelAbilityState(),
        burnCooldown: 3,
        turnsSincePlayerCast: 2,
        observedFamilies: ['DISSONANCE'],
        observedSyntax: ['PROBE'],
      },
    })];

    const plan = planSentinelAttack({
      record: sentinels[0],
      sentinels,
      intelligence: 55,
      rng: () => 1,
    });

    expect(plan.abilityId).toBe('machine_learning');
    expect(plan.machineLearning?.counterFamily).toBeTruthy();
  });

  it('records player spell signatures for machine learning', () => {
    const sentinels = [makeSentinel('sentinel-west')];
    notePlayerSpellCastOnSentinels(sentinels, {
      weave: 'REND FLESH',
      syntacticalChess: {
        matchedWeaknessFamilies: ['FRACTURE'],
        matchedSyntaxWeaknesses: ['COMMAND'],
      },
    });

    expect(sentinels[0].abilities.turnsSincePlayerCast).toBe(0);
    expect(sentinels[0].abilities.observedFamilies).toContain('FRACTURE');
    expect(sentinels[0].abilities.observedSyntax).toContain('COMMAND');
  });

  it('applies burn debuff and sentinel damage through the stat controller', () => {
    const stats = new CombatStatController();
    stats.registerEntity('player', { hp: 100, maxHp: 100, tx: 4, ty: 6 });
    stats.registerEntity('sentinel-west', {
      hp: 40,
      maxHp: 40,
      tx: 4,
      ty: 5,
      scholomanceOverrides: { BAPO: 14 },
    });

    const plan = {
      abilityId: 'burn',
      applyBurn: true,
      guaranteedHit: true,
      damageMultiplier: 1.25,
    };

    const result = resolveSentinelAbilityDamage(stats, 'sentinel-west', 'player', plan);
    expect(result?.hit).toBe(true);
    expect(result?.damage).toBeGreaterThan(0);

    applySentinelBurnDebuff(stats, plan);
    const player = stats.getEntity('player');
    expect(player.statuses.some((entry) => entry.chainId === SENTINEL_BURN_DEBUFF.chainId)).toBe(true);
  });

  it('exposes intelligence tier on attack plans', () => {
    const sentinels = [makeSentinel('sentinel-west')];
    const plan = planSentinelAttack({
      record: sentinels[0],
      sentinels,
      intelligence: 82,
      rng: () => 1,
    });
    expect(plan.intelligence).toBe(82);
    expect(plan.intelligenceTier).toBe('mastermind');
  });

  it('ticks sentinel cooldowns and ML timers each turn', () => {
    const sentinels = [makeSentinel('sentinel-west', {
      abilities: {
        ...createSentinelAbilityState(),
        burnCooldown: 2,
        turnsSincePlayerCast: 1,
      },
    })];

    tickSentinelAbilityState(sentinels);
    expect(sentinels[0].abilities.burnCooldown).toBe(1);
    expect(sentinels[0].abilities.turnsSincePlayerCast).toBe(2);
  });
});
import { describe, expect, it } from 'vitest';
import { CombatStatController } from '../../../src/game/combat/combatStatController.js';
import {
  BASE_ML_SURVIVAL_TURNS,
  buildSentinelAbilityReasoning,
  clampIntelligence,
  computeAlertProcChance,
  computeMachineLearningSurvivalTurns,
  getIntelligenceTier,
  INTELLIGENCE_TIERS,
  pickBestObservedCounter,
  planSentinelReposition,
  playerHasMatrixBurn,
  selectSentinelAbilityByIntelligence,
} from '../../../src/game/combat/combatIntelligence.js';
import { createSentinelAbilityState } from '../../../src/game/combat/sentinelCombatAbilities.js';
import { buildBlockedSet } from '../../../src/game/combat/combatPathfinding.js';

describe('combatIntelligence', () => {
  it('clamps INT between 0 and 100', () => {
    expect(clampIntelligence(140)).toBe(100);
    expect(clampIntelligence(-4)).toBe(0);
    expect(clampIntelligence('58')).toBe(58);
  });

  it('maps INT values to cognition tiers', () => {
    expect(getIntelligenceTier(12)).toBe(INTELLIGENCE_TIERS.BRUTE);
    expect(getIntelligenceTier(30)).toBe(INTELLIGENCE_TIERS.TRAINED);
    expect(getIntelligenceTier(58)).toBe(INTELLIGENCE_TIERS.TACTICAL);
    expect(getIntelligenceTier(88)).toBe(INTELLIGENCE_TIERS.MASTERMIND);
  });

  it('raises alert proc chance with higher INT', () => {
    expect(computeAlertProcChance(10)).toBeCloseTo(0.22, 2);
    expect(computeAlertProcChance(50)).toBeCloseTo(0.5, 2);
    expect(computeAlertProcChance(100)).toBeCloseTo(0.85, 2);
  });

  it('picks the most observed weakness family for tactical counters', () => {
    const counter = pickBestObservedCounter(
      ['FRACTURE', 'FRACTURE', 'DISSONANCE'],
      ['RESONANCE', 'FRACTURE'],
    );
    expect(counter).toBe('FRACTURE');
  });

  it('skips burn for high INT when the player already has matrix burn', () => {
    const selection = selectSentinelAbilityByIntelligence({
      abilities: createSentinelAbilityState(),
      mlReady: false,
      playerHasBurn: true,
      mentalLinkActive: false,
      intelligence: 72,
      rng: () => 0,
    });
    expect(selection.abilityId).not.toBe('burn');
  });

  it('prefers machine learning for trained INT when ML is ready', () => {
    const abilities = {
      ...createSentinelAbilityState(),
      turnsSincePlayerCast: 2,
      observedFamilies: ['FRACTURE'],
    };
    const selection = selectSentinelAbilityByIntelligence({
      abilities,
      mlReady: true,
      playerHasBurn: false,
      mentalLinkActive: false,
      intelligence: 40,
      rng: () => 0,
    });
    expect(selection.abilityId).toBe('machine_learning');
  });

  it('detects active matrix burn on the player', () => {
    const stats = new CombatStatController();
    stats.registerEntity('player', { hp: 100, maxHp: 100 });
    expect(playerHasMatrixBurn(stats)).toBe(false);
    stats.applyStatus('player', {
      chainId: 'sentinel_matrix_burn',
      damagePerTurn: 10,
      turns: 4,
      disposition: 'DEBUFF',
    });
    expect(playerHasMatrixBurn(stats)).toBe(true);
  });

  it('extends ML survival turns when the player has high CODEX and KSYN', () => {
    expect(computeMachineLearningSurvivalTurns({ CODEX: 10, KSYN: 10 })).toBe(BASE_ML_SURVIVAL_TURNS);
    expect(computeMachineLearningSurvivalTurns({ CODEX: 40, KSYN: 30 })).toBe(5);
  });

  it('emits reasoning when burn is withheld for an ignited target', () => {
    const selection = selectSentinelAbilityByIntelligence({
      abilities: createSentinelAbilityState(),
      mlReady: false,
      playerHasBurn: true,
      mentalLinkActive: false,
      intelligence: 72,
      rng: () => 0,
    });
    const lines = buildSentinelAbilityReasoning({
      shortLabel: 'Sentinel β',
      tier: selection.tier,
      selection,
      abilities: createSentinelAbilityState(),
      mlReady: false,
      burnAvailable: true,
      playerHasBurn: true,
      playerHpRatio: 0.8,
      mlSurvivalRequired: BASE_ML_SURVIVAL_TURNS,
    });
    expect(lines.some((line) => line.includes('Burn withheld'))).toBe(true);
    expect(lines.some((line) => line.includes('already ignited'))).toBe(true);
  });

  it('emits reasoning when CODEX extends the ML pattern lock', () => {
    const abilities = {
      ...createSentinelAbilityState(),
      turnsSincePlayerCast: 1,
      observedFamilies: ['FRACTURE'],
    };
    const lines = buildSentinelAbilityReasoning({
      shortLabel: 'Sentinel β',
      tier: INTELLIGENCE_TIERS.TACTICAL,
      selection: { abilityId: 'fireball', applyBurn: false },
      abilities,
      mlReady: false,
      burnAvailable: false,
      mlSurvivalRequired: 4,
      playerCodex: 34,
      playerKsyn: 12,
    });
    expect(lines.some((line) => line.includes('Pattern lock extended'))).toBe(true);
    expect(lines.some((line) => line.includes('CODEX 34'))).toBe(true);
  });

  it('plans reposition steps for high INT sentinels out of range', () => {
    const stats = new CombatStatController();
    stats.registerEntity('sentinel-west', {
      tx: 0,
      ty: 0,
      overrides: { intelligence: 60, movementPoints: 3, movementPointsRemaining: 3, attackRange: 2 },
    });
    stats.registerEntity('player', { tx: 4, ty: 6, hp: 100, maxHp: 100 });

    const blocked = buildBlockedSet([{ tx: 4, ty: 4 }]);
    const steps = planSentinelReposition({
      sentinelId: 'sentinel-west',
      stats,
      blocked,
      intelligence: 60,
    });

    expect(steps.length).toBeGreaterThan(0);
    expect(steps.length).toBeLessThanOrEqual(3);
  });
});
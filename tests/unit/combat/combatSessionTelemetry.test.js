import { describe, expect, it } from 'vitest';
import {
  COMBAT_GRADE_THRESHOLDS,
  createCombatSessionTelemetry,
} from '../../../src/game/combat/combatSessionTelemetry.js';
import { SCHOLOMANCE_XP_ACTIONS } from '../../../codex/core/scholomance-xp.schema.js';

function makePlayerEntity(overrides = {}) {
  return {
    hp: 88,
    maxHp: 100,
    movementPoints: 3,
    movementPointsRemaining: 2,
    attackPoints: 6,
    attackRange: 1,
    scholomance: {
      KSYN: 10,
      BAPO: 16,
      SONIC: 12,
      VALCH: 14,
      PSYCH: 10,
      CINF: 10,
      MYTH: 10,
      CODEX: 10,
      DISCOVERY: 10,
    },
    ...overrides,
  };
}

describe('combatSessionTelemetry', () => {
  it('tracks movement, attacks, sentinel hits, and aggro', () => {
    const telemetry = createCombatSessionTelemetry();

    telemetry.recordMove();
    telemetry.recordMove();
    telemetry.recordPlayerAttack({ damage: 8, targetId: 'sentinel-west' });
    telemetry.recordSentinelHit({ sentinelId: 'sentinel-west', damage: 5 });
    telemetry.recordAggro({ count: 2 });
    telemetry.recordTurnEnd();

    expect(telemetry.getSnapshot()).toEqual({
      tilesMoved: 2,
      turnsEnded: 1,
      playerAttacksLanded: 1,
      elementalAttacks: 0,
      damageDealt: 8,
      damageTaken: 5,
      sentinelsDefeated: 0,
      aggroEvents: 1,
      aggroSentinelCount: 2,
      xpActionCount: 0,
    });
  });

  it('builds a victory report with grade, scholomance highlights, and XP totals', () => {
    const telemetry = createCombatSessionTelemetry();

    telemetry.recordPlayerAttack({ damage: 8, targetId: 'sentinel-west', elemental: true });
    telemetry.recordPlayerAttack({ damage: 8, targetId: 'sentinel-west' });
    telemetry.recordPlayerAttack({ damage: 8, targetId: 'sentinel-east' });
    telemetry.recordPlayerAttack({ damage: 8, targetId: 'sentinel-east' });
    telemetry.recordPlayerAttack({ damage: 8, targetId: 'sentinel-east' });
    telemetry.recordSentinelDefeated();
    telemetry.recordSentinelDefeated();
    telemetry.recordXpAction(SCHOLOMANCE_XP_ACTIONS.BASIC_ATTACK);
    telemetry.recordXpAction(SCHOLOMANCE_XP_ACTIONS.BASIC_ATTACK);
    telemetry.recordAggro({ count: 2 });
    telemetry.recordTurnEnd();
    telemetry.recordTurnEnd();

    const report = telemetry.buildReport({ playerEntity: makePlayerEntity() });

    expect(report.version).toBe('combat-victory-report-v1');
    expect(report.metrics.sentinelsDefeated).toBe(2);
    expect(report.metrics.damageDealt).toBe(40);
    expect(report.vitals.hpRemaining).toBe(88);
    expect(report.xpEarned.total).toBe(40);
    expect(report.xpEarned.byStat.BAPO).toBe(24);
    expect(report.scholomanceHighlights.combatStats[0].key).toBe('BAPO');
    expect(COMBAT_GRADE_THRESHOLDS.map((entry) => entry.grade)).toContain(report.grade);
    expect(report.meritTags).toContain('Flank Cleared');
    expect(report.meritTags).toContain('Tower Threat');
    expect(report.prowessScore).toBeGreaterThanOrEqual(0);
    expect(report.prowessScore).toBeLessThanOrEqual(100);
  });

  it('resets session counters', () => {
    const telemetry = createCombatSessionTelemetry();
    telemetry.recordMove();
    telemetry.recordPlayerAttack({ damage: 5 });
    telemetry.reset();
    expect(telemetry.getSnapshot().tilesMoved).toBe(0);
    expect(telemetry.getSnapshot().playerAttacksLanded).toBe(0);
  });
});
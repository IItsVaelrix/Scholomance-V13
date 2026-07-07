import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  enrichDefenderSyntacticalChess,
  resolveCombatCastScore,
} from '../../../src/game/combat/combatCastScoring.js';
import { sentinelBrazierBestiaryEntry } from '../../../src/game/combat/bestiary/entries/sentinelBrazier.entry.js';

vi.mock('../../../src/lib/combatApi.js', () => ({
  scoreCombatScroll: vi.fn(async () => {
    throw new Error('offline');
  }),
}));

describe('combatCastScoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scores locally with browser-safe fallback and syntactical chess against a defender', async () => {
    const defender = sentinelBrazierBestiaryEntry.buildDefender({
      enemyId: 'sentinel-west',
      record: { aggroed: true },
      entitySnapshot: { hp: 40, maxHp: 40 },
    });

    const result = await resolveCombatCastScore({
      verse: 'The choir fractures — shatter the ringing glass matrix.',
      weave: 'REND FLESH',
      defender,
      defenderSchool: 'SONIC',
    });

    expect(result.scoreData?.totalScore).toBeGreaterThan(0);
    expect(result.scoreData?.failureCast).toBe(false);
    expect(result.scoreData?.damage).toBeGreaterThan(0);
    expect(result.scoreData?.syntacticalChess?.multiplier).toBeGreaterThan(0);
  });

  it('re-applies defender syntactical chess on top of API payloads', () => {
    const defender = sentinelBrazierBestiaryEntry.buildDefender({
      enemyId: 'sentinel-west',
      record: { aggroed: true },
      entitySnapshot: { hp: 40, maxHp: 40 },
    });

    const enriched = enrichDefenderSyntacticalChess({
      damage: 20,
      totalScore: 42,
      commentary: 'Base hit.',
      syntacticalChessMultiplier: 1,
    }, {
      verse: 'Dissonant noise cracks the resonant brazier shell.',
      defender,
    });

    expect(enriched.syntacticalChess?.matchedWeaknessFamilies || enriched.syntacticalChess?.diagnostics).toBeTruthy();
    expect(enriched.damage).toBeGreaterThan(0);
    expect(enriched.commentary).toMatch(/SYNTACTICAL CHESS/i);
  });
});
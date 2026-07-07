import { describe, expect, it } from 'vitest';
import {
  evaluateSyntacticalChess,
  SYNTACTIC_ARCHETYPE_PROFILES,
} from '../../../codex/core/combat.syntax-chess.js';
import { buildCombatDefenderProfile, buildBestiaryRuntimeContext } from '../../../src/game/combat/bestiary/index.js';

describe('sentinel syntactical chess', () => {
  it('maps sentinel defenders to the brazier matrix archetype', () => {
    const defender = buildCombatDefenderProfile(buildBestiaryRuntimeContext({
      enemyId: 'sentinel-west',
      record: { id: 'sentinel-west', aggroed: true },
      entitySnapshot: { hp: 30, maxHp: 40 },
    }));

    const advantage = evaluateSyntacticalChess({
      phrase: 'Shatter the brazier matrix with discord until the containment ring fractures.',
      enemy: defender,
    });
    const disadvantage = evaluateSyntacticalChess({
      phrase: 'Sing resonance into the choir until the ring glows brighter.',
      enemy: defender,
    });

    expect(defender.syntacticProfile).toBe(SYNTACTIC_ARCHETYPE_PROFILES.SENTINEL_BRAZIER_BASE);
    expect(advantage.matchedWeaknessFamilies).toEqual(
      expect.arrayContaining(['DISSONANCE', 'FRACTURE']),
    );
    expect(advantage.multiplier).toBeGreaterThan(1);
    expect(disadvantage.resistedFamilies).toContain('RESONANCE');
  });
});
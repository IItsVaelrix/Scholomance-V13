import { describe, it, expect } from 'vitest';
import {
  buildCharacterCompendiumSnapshot,
  statBarPercent,
  CHARACTER_NAME,
} from '../../../src/game/character/characterCompendium.js';

describe('characterCompendium', () => {
  it('builds a snapshot with scholomance categories and tactical rows', () => {
    const snapshot = buildCharacterCompendiumSnapshot({
      combatStats: {
        movementPointsRemaining: 2,
        movementPoints: 3,
        attackPoints: 8,
        attackRange: 2,
        attackUsed: false,
        scholomance: { BAPO: 16, VALCH: 14 },
      },
    });

    expect(snapshot.name).toBe(CHARACTER_NAME);
    expect(snapshot.tactical.rows).toHaveLength(3);
    expect(snapshot.scholomance.categories.length).toBeGreaterThanOrEqual(4);
    expect(snapshot.scholomance.block.BAPO).toBe(16);
    expect(snapshot.spellProfile.quality.total).toBeGreaterThan(0);
  });

  it('computes stat bar percentages within bounds', () => {
    expect(statBarPercent(10, 0, 100)).toBe(10);
    expect(statBarPercent(0, 0, 100)).toBe(0);
    expect(statBarPercent(150, 0, 100)).toBe(100);
  });
});
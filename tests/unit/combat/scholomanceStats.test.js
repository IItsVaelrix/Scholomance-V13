import { describe, it, expect } from 'vitest';
import {
  SCHOLOMANCE_STAT_CATEGORIES,
  SCHOLOMANCE_STAT_KEYS,
  SCHOLOMANCE_STATS,
  buildDefaultScholomanceStatBlock,
  getScholomanceStatsByCategory,
} from '../../../codex/core/scholomance-stats.schema.js';
import {
  EXAMPLE_SPELL_INCINERATE_STUDENT,
  buildFullStatBlock,
  getFullStatRegistry,
} from '../../../src/game/combat/scholomanceStats.js';

describe('scholomance stat tree schema', () => {
  it('defines all nine scholomance attribute stats', () => {
    expect(SCHOLOMANCE_STAT_KEYS).toEqual([
      'KSYN', 'BAPO', 'SONIC', 'VALCH', 'PSYCH', 'CINF', 'MYTH', 'CODEX', 'DISCOVERY',
    ]);
    expect(SCHOLOMANCE_STATS).toHaveLength(9);
  });

  it('maps creative combat stats', () => {
    const keys = getScholomanceStatsByCategory(SCHOLOMANCE_STAT_CATEGORIES.CREATIVE_COMBAT)
      .map((s) => s.key);
    expect(keys).toEqual(['BAPO', 'SONIC', 'VALCH']);
  });

  it('seeds neutral bases at 10', () => {
    expect(buildDefaultScholomanceStatBlock()).toEqual({
      KSYN: 10,
      BAPO: 10,
      SONIC: 10,
      VALCH: 10,
      PSYCH: 10,
      CINF: 10,
      MYTH: 10,
      CODEX: 10,
      DISCOVERY: 10,
    });
  });

  it('merges scholomance overrides into a full stat block', () => {
    const block = buildFullStatBlock({
      tactical: { attackPoints: 12 },
      scholomance: { BAPO: 22, MYTH: 18 },
    });
    expect(block.attackPoints).toBe(12);
    expect(block.scholomance.BAPO).toBe(22);
    expect(block.scholomance.MYTH).toBe(18);
  });

  it('exposes the unified stat tree registry', () => {
    const registry = getFullStatRegistry();
    expect(registry.tactical.length).toBe(5);
    expect(registry.scholomance.length).toBe(9);
  });

  it('documents the Incinerate Student example spell profile', () => {
    expect(EXAMPLE_SPELL_INCINERATE_STUDENT.primary).toBe('VALCH');
    expect(EXAMPLE_SPELL_INCINERATE_STUDENT.secondary).toBe('BAPO');
    expect(EXAMPLE_SPELL_INCINERATE_STUDENT.flavorStats).toEqual(['CINF', 'MYTH']);
  });
});
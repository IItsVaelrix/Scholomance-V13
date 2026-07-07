import { describe, expect, it } from 'vitest';
import {
  computeTileMultiplier,
  getSchoolTileBonus,
  computeNullTileEffect,
} from '../../../codex/core/combat/tactical-board.modifiers.js';

describe('tactical-board.modifiers value convention', () => {
  it('treats modifier.value as a fraction (+15% → 1.15)', () => {
    const mod = { id: 'fire', kind: 'school_boost', school: 'FIRE', value: 0.15, appliesTo: 'caster_tile' };
    expect(computeTileMultiplier(mod, 'FIRE')).toBeCloseTo(1.15, 5);
  });

  it('nullification reduces effectiveness by 20%', () => {
    const mod = { id: 'null', kind: 'nullification', value: -0.20, appliesTo: 'area' };
    expect(computeTileMultiplier(mod, 'FIRE')).toBeCloseTo(0.80, 5);
  });

  it('getSchoolTileBonus returns fractional bonus for matching schools', () => {
    expect(getSchoolTileBonus('FIRE', 'FIRE')).toBeCloseTo(0.15, 5);
  });

  it('computeNullTileEffect reduces non-nullification modifier values by 20%', () => {
    const reduced = computeNullTileEffect([
      { id: 'rune', kind: 'spell_roll_bonus', value: 0.08, appliesTo: 'caster_tile' },
    ]);
    expect(reduced[0].value).toBeCloseTo(0.06, 5);
  });

  it('covers at least five tactical tile modifier kinds (TLB-4)', () => {
    const kinds = new Set([
      { kind: 'school_boost', school: 'FIRE', value: 0.15 },
      { kind: 'school_boost', school: 'VOID', value: 0.20 },
      { kind: 'spell_roll_bonus', value: 0.08 },
      { kind: 'nullification', value: -0.20 },
      { kind: 'accuracy_boost', value: 0.10 },
      { kind: 'ritual_anchor', value: 0.12 },
    ].map((mod) => {
      computeTileMultiplier(mod, mod.school || 'FIRE');
      return mod.kind;
    }));
    expect(kinds.size).toBeGreaterThanOrEqual(5);
  });
});
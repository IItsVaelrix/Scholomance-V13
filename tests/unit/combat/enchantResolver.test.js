import { describe, expect, it } from 'vitest';
import { computeEnchantSuccess, resolveEnchant, qualityFromScore, ENCHANT_FLOOR, ENCHANT_CEIL, QUALITY_LO, QUALITY_HI } from '../../../src/game/combat/enchantResolver.js';

const rng = (v) => () => v; // deterministic

describe('qualityFromScore', () => {
  it('normalizes totalScore across the quality band', () => {
    expect(qualityFromScore({ totalScore: QUALITY_HI })).toBeCloseTo(1, 5);
    expect(qualityFromScore({ totalScore: QUALITY_LO })).toBeCloseTo(0, 5);
    expect(qualityFromScore({ totalScore: (QUALITY_LO + QUALITY_HI) / 2 })).toBeCloseTo(0.5, 5);
    expect(qualityFromScore({})).toBe(0); // missing -> lowest
  });
});

describe('computeEnchantSuccess', () => {
  it('maps a high totalScore near the ceiling and a low one near the floor', () => {
    expect(computeEnchantSuccess({ totalScore: QUALITY_HI }, rng(0)).probability).toBeCloseTo(ENCHANT_CEIL, 5);
    expect(computeEnchantSuccess({ totalScore: QUALITY_LO }, rng(0)).probability).toBeCloseTo(ENCHANT_FLOOR, 5);
  });

  it('failureCast forces probability 0 (always fizzles)', () => {
    const r = computeEnchantSuccess({ totalScore: QUALITY_HI, failureCast: true }, rng(0));
    expect(r.probability).toBe(0);
    expect(r.success).toBe(false);
  });

  it('success follows the injected rng deterministically', () => {
    const sd = { totalScore: (QUALITY_LO + QUALITY_HI) / 2 }; // quality 0.5 -> prob 0.54
    expect(computeEnchantSuccess(sd, rng(0.53)).success).toBe(true);
    expect(computeEnchantSuccess(sd, rng(0.55)).success).toBe(false);
  });

  it('missing totalScore is treated as lowest quality, not a crash', () => {
    expect(computeEnchantSuccess({}, rng(0)).probability).toBeCloseTo(ENCHANT_FLOOR, 5);
  });
});

describe('resolveEnchant', () => {
  it('returns element:null when no trigger matches (plain swing)', () => {
    expect(resolveEnchant({ text: 'a calm river', weave: '' }, { totalScore: QUALITY_HI }, rng(0))).toEqual({ element: null });
  });

  it('returns the matched element with success outcome when a trigger matches', () => {
    const out = resolveEnchant({ text: 'unleash the flame', weave: '' }, { totalScore: QUALITY_HI }, rng(0));
    expect(out.element.id).toBe('element_fire');
    expect(out.success).toBe(true);
  });

  it('matches against verse and weave combined', () => {
    const out = resolveEnchant({ text: 'strike now', weave: 'enchant burn' }, { totalScore: QUALITY_HI }, rng(0));
    expect(out.element.id).toBe('element_fire');
  });

  it('reads verse when text is absent (live combat incantation channel)', () => {
    const out = resolveEnchant({ verse: 'wield the incinerator blade', weave: 'enchant flame' }, { totalScore: QUALITY_HI }, rng(0));
    expect(out.element.id).toBe('element_fire');
    expect(out.success).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { COMBAT_ELEMENT_DATABASE, matchElement, getElement } from '../../../src/data/combatElementDatabase.js';

describe('combatElementDatabase', () => {
  it('defines the fire element with the documented visual + effect fields', () => {
    const fire = COMBAT_ELEMENT_DATABASE.element_fire;
    expect(fire).toMatchObject({
      id: 'element_fire',
      assetId: 'FireStreak',
      type: 'fire',
      streakColor: 0xff6600,
      glowColor: 0xff3300,
      status: { chainId: 'burn', damagePerTurn: 3, turns: 3, disposition: 'DEBUFF' },
    });
    expect(Array.isArray(fire.triggers)).toBe(true);
  });

  it('matchElement finds fire from an incantation mentioning flame/burn', () => {
    expect(matchElement('I call the FLAME to me').id).toBe('element_fire');
    expect(matchElement('let it burn').id).toBe('element_fire');
  });

  it('matchElement returns null when no trigger is present', () => {
    expect(matchElement('a gentle breeze')).toBe(null);
    expect(matchElement('')).toBe(null);
  });

  it('getElement looks up by id and returns null for unknown', () => {
    expect(getElement('element_fire').type).toBe('fire');
    expect(getElement('element_nope')).toBe(null);
  });
});

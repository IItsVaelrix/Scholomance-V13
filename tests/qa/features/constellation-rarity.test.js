// tests/qa/features/constellation-rarity.test.js
import { describe, it, expect } from 'vitest';
import { corpusFreqToRarity } from '../../../codex/core/constellation/rarity.js';

describe('corpusFreqToRarity', () => {
  it('returns null for an unattested / no-signal count', () => {
    expect(corpusFreqToRarity(0)).toBeNull();
    expect(corpusFreqToRarity(NaN)).toBeNull();
    expect(corpusFreqToRarity(-3)).toBeNull();
  });

  it('maps counts to bands 1..9 with a rare/uncommon/common label', () => {
    expect(corpusFreqToRarity(1)).toEqual({ band: 1, max: 9, label: 'rare' });
    expect(corpusFreqToRarity(39)).toEqual({ band: 3, max: 9, label: 'rare' });
    expect(corpusFreqToRarity(40)).toEqual({ band: 4, max: 9, label: 'uncommon' });
    expect(corpusFreqToRarity(399)).toEqual({ band: 5, max: 9, label: 'uncommon' });
    expect(corpusFreqToRarity(1200)).toEqual({ band: 7, max: 9, label: 'common' });
    expect(corpusFreqToRarity(19999)).toEqual({ band: 8, max: 9, label: 'common' });
    expect(corpusFreqToRarity(20000)).toEqual({ band: 9, max: 9, label: 'common' });
    expect(corpusFreqToRarity(1e9)).toEqual({ band: 9, max: 9, label: 'common' });
  });
});

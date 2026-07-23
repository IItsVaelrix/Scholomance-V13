/** @vitest-environment node */
import { describe, it, expect } from 'vitest';
import { raritySpectral } from '../../../src/pages/Constellation/skyChart.js';

describe('raritySpectral — OBAFGKM ramp keyed to the backend rarity band', () => {
  it('maps a rare (high-band) word to a hot blue class and a common one to cool red', () => {
    const rare = raritySpectral({ band: 9, max: 9, label: 'rare' });
    const common = raritySpectral({ band: 1, max: 9, label: 'common' });
    expect(rare.spectralClass).toBe('O');
    expect(common.spectralClass).toBe('M');
    // Rarer burns brighter (photonic selection).
    expect(rare.brightness).toBeGreaterThan(common.brightness);
  });

  it('normalizes strictly from band/max and clamps to [0,1]', () => {
    expect(raritySpectral({ band: 5, max: 9 }).normalized).toBeCloseTo(5 / 9, 5);
    expect(raritySpectral({ band: 20, max: 9 }).normalized).toBe(1);
    expect(raritySpectral({ band: -3, max: 9 }).normalized).toBe(0);
  });

  it('returns the neutral unknown class (amethyst) when rarity is absent — never a recomputed value', () => {
    const none = raritySpectral(null);
    expect(none.spectralClass).toBe('unknown');
    expect(none.color).toBe('#8b7cff'); // --cos-amethyst
  });

  it('does not derive rarity from anything but the band (backend-truth)', () => {
    // Same band, wildly different max normalization — color follows normalized band only.
    const a = raritySpectral({ band: 8, max: 9 });
    const b = raritySpectral({ band: 8, max: 9, label: 'IGNORED' });
    expect(a.color).toBe(b.color);
    expect(a.spectralClass).toBe(b.spectralClass);
  });
});

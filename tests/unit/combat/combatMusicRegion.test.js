import { describe, expect, it } from 'vitest';
import {
  COMBAT_MUSIC_REGION,
  getCombatMusicRegion,
  isPolarisForestRegion,
  setCombatMusicRegion,
} from '../../../src/game/combat/combatMusicRegion.js';

describe('combatMusicRegion', () => {
  it('tracks polaris forest as active music region', () => {
    setCombatMusicRegion(COMBAT_MUSIC_REGION.POLARIS_FOREST);
    expect(getCombatMusicRegion()).toBe(COMBAT_MUSIC_REGION.POLARIS_FOREST);
    expect(isPolarisForestRegion()).toBe(true);
    setCombatMusicRegion(COMBAT_MUSIC_REGION.VOID_COURTYARD);
    expect(isPolarisForestRegion()).toBe(false);
  });
});
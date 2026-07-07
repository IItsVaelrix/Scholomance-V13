import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createGameFireballImpactService,
  resetGameFireballImpactServiceForTests,
} from '../../src/lib/audio/gameFireballImpact.service.js';
import {
  GAME_FIREBALL_IMPACT_DEFAULTS,
  GAME_FIREBALL_IMPACT_SAMPLE,
} from '../../src/lib/audio/gameFireballImpact.config.js';

function createStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
    clear: () => { map.clear(); },
  };
}

describe('gameFireballImpact.service', () => {
  beforeEach(() => {
    resetGameFireballImpactServiceForTests();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    resetGameFireballImpactServiceForTests();
    document.body.innerHTML = '';
  });

  it('primes a pooled audio element for the fireball impact sample', () => {
    const service = createGameFireballImpactService({ storage: createStorage() });
    service.prime();
    const element = document.querySelector(`audio[src="${GAME_FIREBALL_IMPACT_SAMPLE.url}"]`);
    expect(element).toBeTruthy();
    service.destroy();
  });

  it('plays impact after unlock', async () => {
    const playMock = vi.fn().mockResolvedValue(undefined);
    const service = createGameFireballImpactService({ storage: createStorage() });
    service.prime();

    const elements = [...document.querySelectorAll(`audio[src="${GAME_FIREBALL_IMPACT_SAMPLE.url}"]`)];
    elements.forEach((element) => {
      element.play = playMock;
    });

    expect(await service.playImpact()).toBe(false);
    expect(await service.unlock()).toBe(true);
    playMock.mockClear();
    expect(await service.playImpact()).toBe(true);
    expect(playMock).toHaveBeenCalled();
    expect(
      elements.some((element) => element.volume === GAME_FIREBALL_IMPACT_DEFAULTS.volume),
    ).toBe(true);

    service.destroy();
  });
});
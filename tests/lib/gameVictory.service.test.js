import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createGameVictoryService,
  resetGameVictoryServiceForTests,
} from '../../src/lib/audio/gameVictory.service.js';
import {
  GAME_VICTORY_DEFAULTS,
  GAME_VICTORY_SAMPLE,
} from '../../src/lib/audio/gameVictory.config.js';

describe('gameVictory.service', () => {
  beforeEach(() => {
    resetGameVictoryServiceForTests();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    resetGameVictoryServiceForTests();
    document.body.innerHTML = '';
  });

  it('primes the victory fanfare sample', () => {
    const service = createGameVictoryService();
    service.prime();
    const element = document.querySelector(`audio[src="${GAME_VICTORY_SAMPLE.url}"]`);
    expect(element).toBeTruthy();
    expect(element.loop).toBe(false);
    service.destroy();
  });

  it('falls back to defaults when settings are missing', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const service = createGameVictoryService({ storage });
    expect(service.getState().volume).toBe(GAME_VICTORY_DEFAULTS.volume);
    service.destroy();
  });
});
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createGameBrazierFireService,
  resetGameBrazierFireServiceForTests,
} from '../../src/lib/audio/gameBrazierFire.service.js';
import {
  GAME_BRAZIER_FIRE_DEFAULTS,
  GAME_BRAZIER_FIRE_SAMPLE,
  GAME_BRAZIER_FIRE_SETTINGS_KEY,
} from '../../src/lib/audio/gameBrazierFire.config.js';

function createStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
    clear: () => { map.clear(); },
  };
}

describe('gameBrazierFire.service', () => {
  beforeEach(() => {
    resetGameBrazierFireServiceForTests();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    resetGameBrazierFireServiceForTests();
    document.body.innerHTML = '';
  });

  it('falls back to defaults when localStorage contains JSON null', () => {
    const storage = {
      getItem: () => 'null',
      setItem: () => {},
      removeItem: () => {},
    };
    const service = createGameBrazierFireService({ storage });
    expect(service.getState().volume).toBe(GAME_BRAZIER_FIRE_DEFAULTS.volume);
    service.destroy();
  });

  it('primes two looping audio elements for left and right braziers', () => {
    const service = createGameBrazierFireService({ storage: createStorage() });
    service.prime();
    const elements = document.querySelectorAll(`audio[src="${GAME_BRAZIER_FIRE_SAMPLE.url}"]`);
    expect(elements.length).toBe(2);
    expect(elements[0].loop).toBe(true);
    service.destroy();
  });

  it('defers start until unlock then plays on the next gesture', async () => {
    const playMock = vi.fn().mockResolvedValue(undefined);
    const service = createGameBrazierFireService({ storage: createStorage() });
    service.prime();

    const elements = [...document.querySelectorAll(`audio[src="${GAME_BRAZIER_FIRE_SAMPLE.url}"]`)];
    elements.forEach((element) => {
      element.play = playMock;
    });

    expect(await service.start()).toBe(false);
    expect(service.getState().pendingStart).toBe(true);
    expect(service.getState().active).toBe(false);

    expect(await service.unlock()).toBe(true);
    playMock.mockClear();
    expect(await service.start()).toBe(true);
    expect(playMock).toHaveBeenCalledTimes(2);
    expect(service.getState().active).toBe(true);

    service.destroy();
  });

  it('auto-starts on pointerdown when combat requested playback before unlock', async () => {
    const playMock = vi.fn().mockResolvedValue(undefined);
    const service = createGameBrazierFireService({ storage: createStorage() });
    service.prime();

    const elements = [...document.querySelectorAll(`audio[src="${GAME_BRAZIER_FIRE_SAMPLE.url}"]`)];
    elements.forEach((element) => {
      element.play = playMock;
    });

    expect(await service.start()).toBe(false);
    playMock.mockClear();

    window.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    await Promise.resolve();

    expect(service.getState().unlocked).toBe(true);
    expect(service.getState().active).toBe(true);
    expect(playMock).toHaveBeenCalledTimes(2);

    service.destroy();
  });

  it('starts crackling loops after unlock', async () => {
    const playMock = vi.fn().mockResolvedValue(undefined);
    const service = createGameBrazierFireService({ storage: createStorage() });
    service.prime();

    const elements = [...document.querySelectorAll(`audio[src="${GAME_BRAZIER_FIRE_SAMPLE.url}"]`)];
    elements.forEach((element) => {
      element.play = playMock;
    });

    expect(await service.start()).toBe(false);
    expect(await service.unlock()).toBe(true);
    playMock.mockClear();
    expect(await service.start()).toBe(true);
    expect(playMock).toHaveBeenCalledTimes(2);
    expect(service.getState().active).toBe(true);

    service.destroy();
  });

  it('persists volume changes to localStorage', () => {
    const storage = createStorage();
    const service = createGameBrazierFireService({ storage });
    service.setVolume(0.25);

    const raw = storage.getItem(GAME_BRAZIER_FIRE_SETTINGS_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw).volume).toBe(0.25);
    service.destroy();
  });
});
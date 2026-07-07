import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createGameSwordSliceService,
  resetGameSwordSliceServiceForTests,
} from '../../src/lib/audio/gameSwordSlice.service.js';
import {
  GAME_SWORD_SLICE_DEFAULTS,
  GAME_SWORD_SLICE_SAMPLE,
  GAME_SWORD_SLICE_SETTINGS_KEY,
} from '../../src/lib/audio/gameSwordSlice.config.js';

function createStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
    clear: () => { map.clear(); },
  };
}

describe('gameSwordSlice.service', () => {
  beforeEach(() => {
    resetGameSwordSliceServiceForTests();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    resetGameSwordSliceServiceForTests();
    document.body.innerHTML = '';
  });

  it('falls back to defaults when localStorage contains JSON null', () => {
    const storage = {
      getItem: () => 'null',
      setItem: () => {},
      removeItem: () => {},
    };
    const service = createGameSwordSliceService({ storage });
    expect(service.getState().volume).toBe(GAME_SWORD_SLICE_DEFAULTS.volume);
    service.destroy();
  });

  it('primes a pooled audio element pointed at the sword slice sample', () => {
    const service = createGameSwordSliceService({ storage: createStorage() });
    service.prime();
    const element = document.querySelector(`audio[src="${GAME_SWORD_SLICE_SAMPLE.url}"]`);
    expect(element).toBeTruthy();
    service.destroy();
  });

  it('defers playback until unlock then plays the slice', async () => {
    const playMock = vi.fn().mockResolvedValue(undefined);
    const service = createGameSwordSliceService({ storage: createStorage() });
    service.prime();

    const elements = [...document.querySelectorAll(`audio[src="${GAME_SWORD_SLICE_SAMPLE.url}"]`)];
    elements.forEach((element) => {
      element.play = playMock;
    });

    expect(await service.playSlice()).toBe(false);
    expect(service.getState().pendingPlay).toBe(true);

    expect(await service.unlock()).toBe(true);
    playMock.mockClear();
    expect(await service.playSlice()).toBe(true);
    expect(playMock).toHaveBeenCalled();
    expect(
      elements.some((element) => element.volume === GAME_SWORD_SLICE_DEFAULTS.volume),
    ).toBe(true);

    service.destroy();
  });

  it('auto-plays on pointerdown when a swing was requested before unlock', async () => {
    const playMock = vi.fn().mockResolvedValue(undefined);
    const service = createGameSwordSliceService({ storage: createStorage() });
    service.prime();

    const elements = [...document.querySelectorAll(`audio[src="${GAME_SWORD_SLICE_SAMPLE.url}"]`)];
    elements.forEach((element) => {
      element.play = playMock;
    });

    expect(await service.playSlice()).toBe(false);
    playMock.mockClear();

    window.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    await Promise.resolve();

    expect(service.getState().unlocked).toBe(true);
    expect(playMock).toHaveBeenCalled();

    service.destroy();
  });

  it('persists volume changes to localStorage', () => {
    const storage = createStorage();
    const service = createGameSwordSliceService({ storage });
    service.setVolume(0.5);

    const raw = storage.getItem(GAME_SWORD_SLICE_SETTINGS_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw).volume).toBe(0.5);
    service.destroy();
  });
});
import { describe, expect, it, vi } from 'vitest';
import {
  GAME_BACKGROUND_MUSIC_CYCLE_MS,
  GAME_BACKGROUND_MUSIC_DEFAULTS,
  GAME_BACKGROUND_MUSIC_SETTINGS_KEY,
  GAME_BACKGROUND_MUSIC_TRACK,
  GAME_BATTLE_MUSIC_TRACK,
  resolveBattleMusicProfile,
} from '../../src/lib/audio/gameBackgroundMusic.config.js';
import {
  createGameBackgroundMusicService,
  pickCycleDurationMs,
} from '../../src/lib/audio/gameBackgroundMusic.service.js';

describe('pickCycleDurationMs', () => {
  it('returns values within the 5–7 minute band', () => {
    const duration = pickCycleDurationMs(
      GAME_BACKGROUND_MUSIC_CYCLE_MS.min,
      GAME_BACKGROUND_MUSIC_CYCLE_MS.max,
      () => 0.5,
    );
    expect(duration).toBeGreaterThanOrEqual(GAME_BACKGROUND_MUSIC_CYCLE_MS.min);
    expect(duration).toBeLessThanOrEqual(GAME_BACKGROUND_MUSIC_CYCLE_MS.max);
  });

  it('is deterministic for a fixed rng', () => {
    const rng = () => 0.25;
    const first = pickCycleDurationMs(GAME_BACKGROUND_MUSIC_CYCLE_MS.min, GAME_BACKGROUND_MUSIC_CYCLE_MS.max, rng);
    const second = pickCycleDurationMs(GAME_BACKGROUND_MUSIC_CYCLE_MS.min, GAME_BACKGROUND_MUSIC_CYCLE_MS.max, rng);
    expect(second).toBe(first);
  });

  it('hits the minimum bound when rng is 0', () => {
    expect(
      pickCycleDurationMs(GAME_BACKGROUND_MUSIC_CYCLE_MS.min, GAME_BACKGROUND_MUSIC_CYCLE_MS.max, () => 0),
    ).toBe(GAME_BACKGROUND_MUSIC_CYCLE_MS.min);
  });

  it('hits the maximum bound when rng approaches 1', () => {
    expect(
      pickCycleDurationMs(GAME_BACKGROUND_MUSIC_CYCLE_MS.min, GAME_BACKGROUND_MUSIC_CYCLE_MS.max, () => 0.999999),
    ).toBe(GAME_BACKGROUND_MUSIC_CYCLE_MS.max);
  });
});

describe('createGameBackgroundMusicService settings', () => {
  beforeEach(() => {
    document.querySelectorAll('audio').forEach((element) => element.remove());
  });

  it('falls back to defaults when localStorage contains JSON null', () => {
    const storage = {
      getItem: () => 'null',
      setItem: () => {},
      removeItem: () => {},
    };
    const service = createGameBackgroundMusicService({ storage });
    expect(service.getState().volume).toBe(GAME_BACKGROUND_MUSIC_DEFAULTS.volume);
    expect(service.getState().enabled).toBe(GAME_BACKGROUND_MUSIC_DEFAULTS.enabled);
    service.destroy();
  });

  it('falls back to defaults when settings key is missing', () => {
    const storage = {
      getItem: (key) => (key === GAME_BACKGROUND_MUSIC_SETTINGS_KEY ? null : null),
      setItem: () => {},
      removeItem: () => {},
    };
    const service = createGameBackgroundMusicService({ storage });
    expect(service.getState().volume).toBe(GAME_BACKGROUND_MUSIC_DEFAULTS.volume);
    service.destroy();
  });

  it('starts playback after unlock even when the first start() exited early', async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const playMock = vi.fn().mockResolvedValue(undefined);
    const pauseMock = vi.fn();
    const service = createGameBackgroundMusicService({ storage });
    service.prime();

    const element = document.querySelector(`audio[src="${GAME_BACKGROUND_MUSIC_TRACK.url}"]`);
    expect(element).toBeTruthy();
    element.play = playMock;
    element.pause = pauseMock;

    const beforeUnlock = await service.start();
    expect(beforeUnlock).toBe(false);
    expect(service.getState().unlocked).toBe(false);

    const didUnlock = await service.unlock();
    expect(didUnlock).toBe(true);

    const afterUnlock = await service.start();
    expect(afterUnlock).toBe(true);
    expect(playMock).toHaveBeenCalled();
    expect(service.getState().active).toBe(true);

    await service.stop();
    service.destroy();
  });

  it('switches to the combat battle track via setMusicProfile', async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const service = createGameBackgroundMusicService({ storage });
    service.prime();

    const combatProfile = resolveBattleMusicProfile();
    await service.setMusicProfile(combatProfile);

    expect(service.getState().trackId).toBe(GAME_BATTLE_MUSIC_TRACK.id);
    expect(service.getState().trackUrl).toBe(GAME_BATTLE_MUSIC_TRACK.url);
    expect(service.getState().loopOnly).toBe(true);

    service.destroy();
  });

  it('does not restart playback on later clicks after the first unlock', async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    const playMock = vi.fn().mockResolvedValue(undefined);
    const service = createGameBackgroundMusicService({ storage });
    service.prime();

    const element = document.querySelector(`audio[src="${GAME_BACKGROUND_MUSIC_TRACK.url}"]`);
    expect(element).toBeTruthy();
    element.play = playMock;
    element.pause = vi.fn();
    Object.defineProperty(element, 'paused', { configurable: true, get: () => false });

    expect(await service.unlock()).toBe(true);
    expect(await service.start()).toBe(true);
    const playsAfterStart = playMock.mock.calls.length;
    expect(playsAfterStart).toBeGreaterThanOrEqual(1);

    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('pointerdown'));
    await service.start();

    expect(playMock).toHaveBeenCalledTimes(playsAfterStart);
    await service.stop();
    service.destroy();
  });
});
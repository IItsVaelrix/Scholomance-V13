import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createGameObeliskElectricService,
  resetGameObeliskElectricServiceForTests,
} from '../../src/lib/audio/gameObeliskElectric.service.js';
import {
  GAME_OBELISK_ELECTRIC_DEFAULTS,
  GAME_OBELISK_ELECTRIC_SAMPLE,
  GAME_OBELISK_ELECTRIC_SETTINGS_KEY,
} from '../../src/lib/audio/gameObeliskElectric.config.js';

function createStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
    clear: () => { map.clear(); },
  };
}

describe('gameObeliskElectric.service', () => {
  beforeEach(() => {
    resetGameObeliskElectricServiceForTests();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    resetGameObeliskElectricServiceForTests();
    document.body.innerHTML = '';
  });

  it('falls back to defaults when localStorage contains JSON null', () => {
    const storage = {
      getItem: () => 'null',
      setItem: () => {},
      removeItem: () => {},
    };
    const service = createGameObeliskElectricService({ storage });
    expect(service.getState().chargeVolume).toBe(GAME_OBELISK_ELECTRIC_DEFAULTS.chargeVolume);
    expect(service.getState().dischargeVolume).toBe(GAME_OBELISK_ELECTRIC_DEFAULTS.dischargeVolume);
    service.destroy();
  });

  it('primes an audio pool pointed at the obelisk zap sample', () => {
    const service = createGameObeliskElectricService({ storage: createStorage() });
    service.prime();
    const element = document.querySelector(`audio[src="${GAME_OBELISK_ELECTRIC_SAMPLE.url}"]`);
    expect(element).toBeTruthy();
    service.destroy();
  });

  it('plays discharge at full volume after unlock', async () => {
    const storage = createStorage();
    const service = createGameObeliskElectricService({ storage });
    service.prime();

    const elements = [...document.querySelectorAll(`audio[src="${GAME_OBELISK_ELECTRIC_SAMPLE.url}"]`)];
    const playMock = vi.fn().mockResolvedValue(undefined);
    elements.forEach((element) => {
      element.play = playMock;
    });

    const beforeUnlock = await service.playZap('OBELISK_DISCHARGE');
    expect(beforeUnlock).toBe(false);

    const didUnlock = await service.unlock();
    expect(didUnlock).toBe(true);

    const played = await service.playZap('OBELISK_DISCHARGE');
    expect(played).toBe(true);
    expect(playMock).toHaveBeenCalled();
    expect(
      elements.some((element) => element.volume === GAME_OBELISK_ELECTRIC_DEFAULTS.dischargeVolume),
    ).toBe(true);

    service.destroy();
  });

  it('uses a lower charge volume than discharge when playZap is called directly', async () => {
    const service = createGameObeliskElectricService({ storage: createStorage() });
    service.prime();

    const elements = [...document.querySelectorAll(`audio[src="${GAME_OBELISK_ELECTRIC_SAMPLE.url}"]`)];
    const playMock = vi.fn().mockResolvedValue(undefined);
    elements.forEach((element) => {
      element.play = playMock;
    });
    await service.unlock();

    await service.playZap('OBELISK_CHARGE');
    expect(
      elements.some((element) => element.volume === GAME_OBELISK_ELECTRIC_DEFAULTS.chargeVolume),
    ).toBe(true);
    expect(GAME_OBELISK_ELECTRIC_DEFAULTS.chargeVolume).toBeLessThan(
      GAME_OBELISK_ELECTRIC_DEFAULTS.dischargeVolume,
    );

    service.destroy();
  });

  it('shouldPreferSample skips procedural path for combat integration', () => {
    const service = createGameObeliskElectricService({ storage: createStorage() });
    expect(service.shouldPreferSample()).toBe(true);
    service.destroy();
  });

  it('persists volume changes to localStorage', () => {
    const storage = createStorage();
    const service = createGameObeliskElectricService({ storage });
    service.setPhaseVolume('discharge', 0.5);

    const raw = storage.getItem(GAME_OBELISK_ELECTRIC_SETTINGS_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw).dischargeVolume).toBe(0.5);
    service.destroy();
  });

  it('reports preferSample from defaults', () => {
    const service = createGameObeliskElectricService({ storage: createStorage() });
    expect(service.shouldPreferSample()).toBe(true);
    service.destroy();
  });
});
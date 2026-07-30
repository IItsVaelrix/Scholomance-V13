import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AMBIENT_PLAYER_STATES,
  AmbientPlayerService,
  createPercussivePulseState,
  getPercussivePulseLevelFromWaveform,
} from "../../src/lib/ambient/ambientPlayer.service";

const createdServices = [];
const TEST_TRACK_URLS = Object.freeze({
  SONIC: "https://suno.com/song/236e9f87-4d38-43da-a98a-b39447256d21",
  PSYCHIC: "https://suno.com/song/12345678-1234-1234-1234-123456789abc",
  VOID: "https://suno.com/song/abcdefab-cdef-cdef-cdef-abcdefabcdef",
});

function createService(options) {
  const service = new AmbientPlayerService(options);
  service.setDynamicSchools(
    Object.entries(TEST_TRACK_URLS).map(([id, trackUrl]) => ({
      id,
      trackUrl,
      paletteKey: id.toLowerCase(),
      orbSkinKey: id.toLowerCase(),
    }))
  );
  createdServices.push(service);
  return service;
}

function createMemoryStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    dump(key) {
      return store.get(key);
    },
  };
}

function createMockController(initialVolume = 0) {
  let volume = initialVolume;
  return {
    schoolId: null,
    getVolume: () => volume,
    setVolume: vi.fn((nextVolume) => {
      volume = nextVolume;
    }),
    play: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    destroy: vi.fn(() => {}),
  };
}

function createWaveformFrame({ size = 256, amplitude = 0, spike = 0 } = {}) {
  const data = new Uint8Array(size);
  const clampedAmp = Math.max(0, Math.min(1, amplitude));
  const center = 128;
  const waveAmp = Math.round(clampedAmp * 127);

  for (let index = 0; index < size; index += 1) {
    const phase = (index / size) * Math.PI * 2;
    const sample = center + Math.round(Math.sin(phase) * waveAmp);
    data[index] = Math.max(0, Math.min(255, sample));
  }

  if (spike > 0) {
    const spikeAmp = Math.max(0, Math.min(1, spike));
    data[Math.floor(size / 2)] = Math.max(0, Math.min(255, center + Math.round(spikeAmp * 127)));
  }

  return data;
}

describe("AmbientPlayerService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    while (createdServices.length > 0) {
      const service = createdServices.pop();
      service.destroy();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("queues a school selected during tuning and resolves to the queued target", async () => {
    const controllerFactory = vi.fn(async ({ schoolId }) => {
      const controller = createMockController(0);
      controller.schoolId = schoolId;
      return controller;
    });

    const service = createService({
      controllerFactory,
      storage: createMemoryStorage(),
      tuningDurationMs: 50,
      fadeOutMs: 0,
      fadeInMs: 0,
      dialSfxPlayer: vi.fn(),
    });

    service.setPlayableSchools(["SONIC", "PSYCHIC", "VOID"]);
    await service.setSchool("SONIC");
    await service.setSchool("PSYCHIC");

    await vi.runAllTimersAsync();

    expect(controllerFactory).toHaveBeenCalledTimes(1);
    expect(controllerFactory).toHaveBeenLastCalledWith(
      expect.objectContaining({ schoolId: "PSYCHIC" })
    );
    expect(service.getState().schoolId).toBe("PSYCHIC");
    expect(service.getState().status).toBe(AMBIENT_PLAYER_STATES.PLAYING);
  });

  it("passes an explicit track URL through tuning into the loaded controller", async () => {
    const selectedTrackUrl = "https://cdn1.suno.ai/manual-void-track.mp3";
    const controllerFactory = vi.fn(async ({ schoolId }) => {
      const controller = createMockController(0);
      controller.schoolId = schoolId;
      return controller;
    });

    const service = createService({
      controllerFactory,
      storage: createMemoryStorage(),
      tuningDurationMs: 50,
      fadeOutMs: 0,
      fadeInMs: 0,
      dialSfxPlayer: vi.fn(),
    });

    service.setPlayableSchools(["SONIC", "PSYCHIC", "VOID"]);
    await service.setSchool("VOID", { trackUrl: selectedTrackUrl, forceRetune: true });
    await vi.runAllTimersAsync();

    expect(controllerFactory).toHaveBeenCalledTimes(1);
    expect(controllerFactory).toHaveBeenLastCalledWith(
      expect.objectContaining({
        schoolId: "VOID",
        trackUrl: selectedTrackUrl,
      })
    );
    expect(service.getState().trackUrl).toBe(selectedTrackUrl);
    expect(service.getState().status).toBe(AMBIENT_PLAYER_STATES.PLAYING);
  });

  it("retunes the active school without reloading the track", async () => {
    const controllerFactory = vi.fn(async ({ schoolId }) => {
      const controller = createMockController(0);
      controller.schoolId = schoolId;
      return controller;
    });

    const service = createService({
      controllerFactory,
      storage: createMemoryStorage(),
      tuningDurationMs: 50,
      fadeOutMs: 0,
      fadeInMs: 0,
      dialSfxPlayer: vi.fn(),
    });

    service.setPlayableSchools(["SONIC"]);
    await service.setSchool("SONIC");
    await vi.runAllTimersAsync();

    await service.setSchool("SONIC", { forceRetune: true });
    await vi.runAllTimersAsync();

    expect(controllerFactory).toHaveBeenCalledTimes(2);
    expect(service.getState().status).toBe(AMBIENT_PLAYER_STATES.PLAYING);
  });

  it("plays immediately on first play without waiting for tune timers", async () => {
    const controllerFactory = vi.fn(async ({ schoolId }) => {
      const controller = createMockController(0);
      controller.schoolId = schoolId;
      return controller;
    });

    const service = createService({
      controllerFactory,
      storage: createMemoryStorage(),
      tuningDurationMs: 5000,
      fadeOutMs: 0,
      fadeInMs: 0,
      dialSfxPlayer: vi.fn(),
    });

    service.setPlayableSchools(["SONIC"]);
    await service.play();

    expect(controllerFactory).toHaveBeenCalledTimes(1);
    expect(service.getState().status).toBe(AMBIENT_PLAYER_STATES.PLAYING);
  });
it("converts tuning into pause when toggled mid-tune", async () => {
  const controllerFactory = vi.fn(async ({ schoolId }) => {
    const controller = createMockController(0);
    controller.schoolId = schoolId;
    controller.loadPromise = Promise.resolve();
    return controller;
  });

  const service = createService({
    controllerFactory,
    storage: createMemoryStorage(),
    tuningDurationMs: 5000,
    fadeOutMs: 0,
    fadeInMs: 0,
    dialSfxPlayer: vi.fn(),
  });

  service.setPlayableSchools(["SONIC"]);
  await service.setSchool("SONIC");
  expect(service.getState().status).toBe(AMBIENT_PLAYER_STATES.TUNING);

  await service.togglePlayPause();
  // No need to run timers, it should pause immediately.

  expect(service.getState().status).toBe(AMBIENT_PLAYER_STATES.PAUSED);
  expect(service.getState().isPlaying).toBe(false);
});


  it("exits tuning with an error when controller playback hangs", async () => {
    const controllerFactory = vi.fn(async ({ schoolId }) => {
      const controller = createMockController(0);
      controller.schoolId = schoolId;
      controller.loadPromise = Promise.resolve();
      controller.play = vi.fn(() => new Promise(() => {}));
      return controller;
    });

    const service = createService({
      controllerFactory,
      storage: createMemoryStorage(),
      tuningDurationMs: 10,
      tuningCompletionTimeoutMs: 30,
      fadeOutMs: 0,
      fadeInMs: 0,
      dialSfxPlayer: vi.fn(),
    });

    service.setPlayableSchools(["SONIC"]);
    await service.setSchool("SONIC");
    await vi.advanceTimersByTimeAsync(15);
    await vi.advanceTimersByTimeAsync(40);
    await Promise.resolve();

    const state = service.getState();
    expect(state.status).toBe(AMBIENT_PLAYER_STATES.ERROR);
    expect(state.error).toMatch(/tuning timed out/i);
  });

  it("plays dial static only once per service lifecycle", async () => {
    const controllerFactory = vi.fn(async ({ schoolId }) => {
      const controller = createMockController(0);
      controller.schoolId = schoolId;
      return controller;
    });
    const dialSfxPlayer = vi.fn();

    const service = createService({
      controllerFactory,
      storage: createMemoryStorage(),
      tuningDurationMs: 10,
      fadeOutMs: 0,
      fadeInMs: 0,
      dialSfxPlayer,
    });

    service.setPlayableSchools(["SONIC", "PSYCHIC"]);
    await service.setSchool("SONIC");
    await vi.runAllTimersAsync();
    await service.setSchool("PSYCHIC");
    await vi.runAllTimersAsync();

    expect(dialSfxPlayer).toHaveBeenCalledTimes(1);
  });

  it("loads and persists ambient settings", () => {
    const storage = createMemoryStorage({
      "scholomance.ambient.settings.v1": JSON.stringify({
        schoolId: "PSYCHIC",
        volume: 0.2,
        autoplayAmbient: true,
        cyclingEnabled: false,
      }),
    });

    const service = createService({
      storage,
      controllerFactory: vi.fn(async () => createMockController(0)),
      dialSfxPlayer: vi.fn(),
    });

    service.setPlayableSchools(["SONIC", "PSYCHIC"]);

    expect(service.getState().schoolId).toBe("PSYCHIC");
    expect(service.getState().volume).toBe(0.2);
    expect(service.getState().autoplayAmbient).toBe(true);
    expect(service.getState().cyclingEnabled).toBe(false);

    service.setVolume(0.77);
    service.setAutoplayAmbient(false);
    service.setCyclingEnabled(true);

    const persisted = JSON.parse(storage.dump("scholomance.ambient.settings.v1"));
    expect(persisted.schoolId).toBe("PSYCHIC");
    expect(persisted.volume).toBe(0.77);
    expect(persisted.autoplayAmbient).toBe(false);
    expect(persisted.cyclingEnabled).toBe(true);
  });

  it("ignores stale async tuning completions when a newer school selection arrives", async () => {
    const loadResolves = new Map();
    const controllerFactory = vi.fn(async ({ schoolId }) => {
      const controller = createMockController(0);
      controller.schoolId = schoolId;
      controller.capabilities = {
        canAnalyze: false,
        canSetVolumeSmooth: true,
        supportsSeek: true,
      };
      controller.loadPromise = new Promise((resolve) => {
        loadResolves.set(schoolId, { controller, resolve });
      });
      return controller;
    });

    const service = createService({
      controllerFactory,
      storage: createMemoryStorage(),
      tuningDurationMs: 20,
      fadeOutMs: 0,
      fadeInMs: 0,
      dialSfxPlayer: vi.fn(),
    });

    service.setPlayableSchools(["SONIC", "PSYCHIC"]);
    await service.setSchool("SONIC");
    await vi.advanceTimersByTimeAsync(25);

    await service.setSchool("PSYCHIC");
    await vi.advanceTimersByTimeAsync(25);

    const sonicLoad = loadResolves.get("SONIC");
    const psychicLoad = loadResolves.get("PSYCHIC");
    expect(sonicLoad).toBeDefined();
    expect(psychicLoad).toBeDefined();

    sonicLoad.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    psychicLoad.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(controllerFactory).toHaveBeenCalledTimes(2);
    expect(sonicLoad.controller.destroy).toHaveBeenCalled();
    expect(psychicLoad.controller.play).toHaveBeenCalled();
    expect(service.getState().schoolId).toBe("PSYCHIC");
    expect(service.getState().status).toBe(AMBIENT_PLAYER_STATES.PLAYING);
  });

  it("resumes AudioContext only on user interaction events", async () => {
    const mockContext = {
      state: "suspended",
      resume: vi.fn(async () => {
        mockContext.state = "running";
      }),
      close: vi.fn(async () => {
        mockContext.state = "closed";
      }),
    };

    const originalAudioContext = window.AudioContext;
    const originalWebkitAudioContext = window.webkitAudioContext;
    class MockAudioContext {
      constructor() {
        return mockContext;
      }
    }
    window.AudioContext = MockAudioContext;
    window.webkitAudioContext = undefined;
    try {
      const service = createService({
        controllerFactory: vi.fn(async () => createMockController(0)),
        storage: createMemoryStorage(),
        dialSfxPlayer: vi.fn(),
      });

      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
      expect(mockContext.resume).toHaveBeenCalledTimes(0);

      mockContext.state = "suspended";
      window.dispatchEvent(new Event("pointerdown"));
      await Promise.resolve();
      expect(mockContext.resume).toHaveBeenCalledTimes(1);

      service.destroy();
      mockContext.state = "suspended";
      window.dispatchEvent(new Event("pointerdown"));
      await Promise.resolve();
      expect(mockContext.resume).toHaveBeenCalledTimes(1);
    } finally {
      window.AudioContext = originalAudioContext;
      window.webkitAudioContext = originalWebkitAudioContext;
    }
  });
});

describe("Percussive Pulse Detection", () => {
  it("boosts level on percussive waveform peaks", () => {
    const state = createPercussivePulseState();
    const quietFrame = createWaveformFrame({ amplitude: 0.03 });
    const hitFrame = createWaveformFrame({ amplitude: 0.08, spike: 1 });

    const baselineA = getPercussivePulseLevelFromWaveform(quietFrame, state, 0);
    const baselineB = getPercussivePulseLevelFromWaveform(quietFrame, state, 120);
    const hitLevel = getPercussivePulseLevelFromWaveform(hitFrame, state, 240);

    expect(hitLevel).toBeGreaterThan(baselineB);
    expect(hitLevel).toBeGreaterThan(baselineA);
  });

  it("limits pulse frequency with cooldown between detected hits", () => {
    const state = createPercussivePulseState();
    const hitFrame = createWaveformFrame({ amplitude: 0.12, spike: 1 });

    getPercussivePulseLevelFromWaveform(hitFrame, state, 0);
    const firstHitMs = state.lastHitMs;

    getPercussivePulseLevelFromWaveform(hitFrame, state, 40);
    expect(state.lastHitMs).toBe(firstHitMs);

    getPercussivePulseLevelFromWaveform(hitFrame, state, 180);
    expect(state.lastHitMs).toBe(180);
  });

  it("decays pulse energy after the peak window", () => {
    const state = createPercussivePulseState();
    const hitFrame = createWaveformFrame({ amplitude: 0.1, spike: 1 });
    const quietFrame = createWaveformFrame({ amplitude: 0.02 });

    const peakLevel = getPercussivePulseLevelFromWaveform(hitFrame, state, 0);
    const lateLevel = getPercussivePulseLevelFromWaveform(quietFrame, state, 500);

    expect(peakLevel).toBeGreaterThan(lateLevel);
    expect(lateLevel).toBeLessThan(0.45);
  });

  it("handles missing waveform frames without crashing", () => {
    const state = createPercussivePulseState({ pulse: 0.37 });
    const level = getPercussivePulseLevelFromWaveform(null, state, 0);
    expect(level).toBeCloseTo(0.37, 4);
  });
});

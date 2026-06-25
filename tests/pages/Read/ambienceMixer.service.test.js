import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  createAmbienceMixerService,
  createWebAudioEngine,
  AMBIENCE_CHANNELS,
} from '../../../src/lib/ambient/ambienceMixer.service.js';

function makeFakeEngine() {
  const calls = [];
  let availabilityCb = null;
  return {
    calls,
    setChannelGain: (id, value, rampMs) => calls.push(['channel', id, value, rampMs]),
    setMasterGain: (value, rampMs) => calls.push(['master', value, rampMs]),
    resume: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
    onAvailabilityChange: (cb) => { availabilityCb = cb; },
    _fail: (id) => availabilityCb && availabilityCb(
      Object.fromEntries(AMBIENCE_CHANNELS.map((c) => [c, c !== id])),
    ),
  };
}

function makeService() {
  const engine = makeFakeEngine();
  const service = createAmbienceMixerService({ createEngine: () => engine });
  return { service, engine };
}

describe('ambienceMixer.service', () => {
  it('defaults to not-running, all channels disabled', () => {
    const { service } = makeService();
    const s = service.getState();
    expect(s.running).toBe(false);
    expect(s.channels.rain.enabled).toBe(false);
    expect(s.channels.cafe.available).toBe(true);
  });

  it('enabling a channel starts the engine and ramps its gain to its volume', async () => {
    const { service, engine } = makeService();
    service.setChannelVolume('rain', 0.4);
    await service.setChannelEnabled('rain', true);
    expect(engine.resume).toHaveBeenCalledTimes(1);
    expect(service.getState().running).toBe(true);
    expect(engine.calls).toContainEqual(['channel', 'rain', 0.4, expect.any(Number)]);
  });

  it('disabling a running channel ramps its gain to 0', async () => {
    const { service, engine } = makeService();
    await service.setChannelEnabled('cafe', true);
    engine.calls.length = 0;
    await service.setChannelEnabled('cafe', false);
    expect(engine.calls).toContainEqual(['channel', 'cafe', 0, expect.any(Number)]);
  });

  it('master volume scales independently and notifies subscribers', async () => {
    const { service, engine } = makeService();
    const seen = [];
    service.subscribe((s) => seen.push(s.master));
    await service.start();
    service.setMasterVolume(0.3);
    expect(engine.calls).toContainEqual(['master', 0.3, expect.any(Number)]);
    expect(seen).toContain(0.3);
  });

  it('stop() fades master to 0 and suspends', async () => {
    const { service, engine } = makeService();
    await service.start();
    await service.stop();
    expect(engine.calls).toContainEqual(['master', 0, expect.any(Number)]);
    expect(engine.suspend).toHaveBeenCalled();
    expect(service.getState().running).toBe(false);
  });

  it('marks a channel unavailable and forces its gain to 0', async () => {
    const { service, engine } = makeService();
    await service.setChannelEnabled('wind', true);
    engine.calls.length = 0;
    engine._fail('wind');
    expect(service.getState().channels.wind.available).toBe(false);
    expect(engine.calls).toContainEqual(['channel', 'wind', 0, expect.any(Number)]);
  });

  it('loadConfig applies persisted master + channel settings', () => {
    const { service } = makeService();
    service.loadConfig({ master: 0.2, channels: { rain: { enabled: true, volume: 0.9 } } });
    const s = service.getState();
    expect(s.master).toBe(0.2);
    expect(s.channels.rain.enabled).toBe(true);
    expect(s.channels.rain.volume).toBe(0.9);
  });
});

// ---------------------------------------------------------------------------
// createWebAudioEngine — real engine path (stubbed globals)
// ---------------------------------------------------------------------------
describe('createWebAudioEngine', () => {
  function makeGainParam() {
    return {
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    };
  }

  function makeGainNode() {
    return { gain: makeGainParam(), connect: vi.fn() };
  }

  let fakeCtx;
  let audioElements;

  beforeEach(() => {
    audioElements = [];

    fakeCtx = {
      currentTime: 0,
      state: 'suspended',
      destination: {},
      createGain: vi.fn(() => makeGainNode()),
      createMediaElementSource: vi.fn(() => ({ connect: vi.fn() })),
      suspend: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
    };

    // Must be proper constructors (function, not arrow) for `new` to work
    function FakeAudioContext() { return fakeCtx; }
    function FakeAudio(src) {
      const listeners = {};
      let _paused = true;
      const el = {
        src,
        loop: false,
        preload: '',
        crossOrigin: '',
        get paused() { return _paused; },
        play: vi.fn(function () { _paused = false; return Promise.resolve(); }),
        pause: vi.fn(function () { _paused = true; }),
        addEventListener: vi.fn(function (event, cb) {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(cb);
        }),
        _emit(event) {
          (listeners[event] || []).forEach((cb) => cb());
        },
      };
      audioElements.push(el);
      return el;
    }

    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('Audio', FakeAudio);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('enabling a channel (setChannelGain > 0) calls play() on the element', () => {
    const engine = createWebAudioEngine();
    const rainEl = audioElements[AMBIENCE_CHANNELS.indexOf('rain')];
    engine.setChannelGain('rain', 0.5, 120);
    expect(rainEl.play).toHaveBeenCalledTimes(1);
    expect(rainEl.pause).not.toHaveBeenCalled();
  });

  it('disabling a channel (setChannelGain = 0) calls pause() on the element', () => {
    const engine = createWebAudioEngine();
    const rainEl = audioElements[AMBIENCE_CHANNELS.indexOf('rain')];
    // First enable so paused=false
    engine.setChannelGain('rain', 0.5, 120);
    expect(rainEl.paused).toBe(false);
    // Now disable
    engine.setChannelGain('rain', 0, 120);
    expect(rainEl.pause).toHaveBeenCalledTimes(1);
  });

  it('suspend() pauses all elements + calls ctx.suspend(); resume() re-plays channels with desired gain > 0', async () => {
    const engine = createWebAudioEngine();
    const rainIdx = AMBIENCE_CHANNELS.indexOf('rain');
    const cafeIdx = AMBIENCE_CHANNELS.indexOf('cafe');
    const rainEl = audioElements[rainIdx];
    const cafeEl = audioElements[cafeIdx];

    // Enable rain, leave cafe at 0
    engine.setChannelGain('rain', 0.6, 120);
    expect(rainEl.paused).toBe(false);

    // Suspend
    await engine.suspend();
    expect(rainEl.pause).toHaveBeenCalledTimes(1);
    expect(cafeEl.pause).toHaveBeenCalledTimes(1);
    expect(fakeCtx.suspend).toHaveBeenCalledTimes(1);

    // Resume — only rain should re-play (desired gain > 0)
    await engine.resume();
    expect(fakeCtx.resume).toHaveBeenCalledTimes(1);
    // play was called once before suspend, and once again after resume
    expect(rainEl.play).toHaveBeenCalledTimes(2);
    // cafe desired gain is 0, must not play
    expect(cafeEl.play).not.toHaveBeenCalled();
  });

  it('firing the error event twice invokes onAvailabilityChange only once (idempotent)', () => {
    const engine = createWebAudioEngine();
    const cb = vi.fn();
    engine.onAvailabilityChange(cb);

    const rainEl = audioElements[AMBIENCE_CHANNELS.indexOf('rain')];
    rainEl._emit('error');
    rainEl._emit('error');

    expect(cb).toHaveBeenCalledTimes(1);
  });
});

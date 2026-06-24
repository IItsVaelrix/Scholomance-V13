import { describe, it, expect, vi } from 'vitest';
import {
  createAmbienceMixerService,
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

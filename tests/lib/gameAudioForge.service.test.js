import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createGameAudioForgeService,
  resetGameAudioForgeServiceForTests,
} from '../../src/lib/audio/gameAudioForge.service.js';
import { GAME_AUDIO_FORGE_SETTINGS_KEY } from '../../src/lib/audio/gameAudioForge.config.js';
import { renderSfxBuffer } from '../../codex/core/audio-forge/dsp/buffer-renderer.js';

function createStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
    clear: () => { map.clear(); },
  };
}

describe('gameAudioForge.service', () => {
  beforeEach(() => {
    resetGameAudioForgeServiceForTests();
    vi.stubGlobal('Worker', class {
      constructor() {
        this.onmessage = null;
        this.onerror = null;
      }
      postMessage(message) {
        const result = renderSfxBuffer(message.packet, message.sampleRate ?? 44100);
        this.onmessage?.({
          data: {
            id: message.id,
            ok: result.ok,
            buffer: result.channelData,
            diagnostics: result.diagnostics ?? [],
          },
        });
      }
      terminate() {}
    });
    vi.stubGlobal('AudioContext', class {
      constructor() {
        this.state = 'suspended';
        this.sampleRate = 44100;
        this.currentTime = 0;
        this.destination = {};
      }
      createGain() {
        return { gain: { value: 1, setTargetAtTime: () => {} }, connect: () => {}, disconnect: () => {} };
      }
      createDynamicsCompressor() {
        return {
          threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 },
          attack: { value: 0 }, release: { value: 0 },
          connect: () => {}, disconnect: () => {},
        };
      }
      createBuffer(channels, length, rate) {
        const channel = new Float32Array(length);
        return {
          numberOfChannels: channels,
          length,
          sampleRate: rate,
          getChannelData: () => channel,
          copyToChannel: (source) => { channel.set(source); },
        };
      }
      createBufferSource() {
        return { connect: () => {}, start: () => {}, disconnect: () => {}, buffer: null, onended: null };
      }
      createStereoPanner() {
        return { pan: { value: 0 }, connect: () => {}, disconnect: () => {} };
      }
      async resume() {
        this.state = 'running';
      }
      async close() {}
    });
  });

  afterEach(() => {
    resetGameAudioForgeServiceForTests();
    vi.unstubAllGlobals();
  });

  it('prime attaches unlock listeners once', () => {
    const storage = createStorage();
    const service = createGameAudioForgeService({ storage });
    const addSpy = vi.spyOn(window, 'addEventListener');

    service.prime();
    service.prime();

    const unlockCalls = addSpy.mock.calls.filter(([event]) => event === 'pointerdown');
    expect(unlockCalls.length).toBe(1);
  });

  it('emitSfx is a no-op before unlock', async () => {
    const storage = createStorage();
    const service = createGameAudioForgeService({ storage });
    service.prime();

    const played = await service.emitSfx('FOOTSTEP', { stepIndex: 0 });
    expect(played).toBe(false);
    expect(service.getState().unlocked).toBe(false);
  });

  it('unlock detaches listeners and allows emitSfx', async () => {
    const storage = createStorage();
    const service = createGameAudioForgeService({ storage });
    service.prime();

    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const unlocked = await service.unlock();
    expect(unlocked).toBe(true);
    expect(service.getState().unlocked).toBe(true);
    expect(removeSpy).toHaveBeenCalled();

    const played = await service.emitSfx('FOOTSTEP', { stepIndex: 1, surface: 'stone' });
    expect(played).toBe(true);
  });

  it('persists enabled flag to storage', () => {
    const storage = createStorage();
    const service = createGameAudioForgeService({ storage });

    service.setEnabled(false);
    const saved = JSON.parse(storage.getItem(GAME_AUDIO_FORGE_SETTINGS_KEY));
    expect(saved.enabled).toBe(false);
  });
});
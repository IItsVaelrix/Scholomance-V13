import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clearAudioBufferCache,
  handleWorkerMessage,
  resolvePacketPcm,
  resolvePacketAudioBuffer,
} from '../../src/audio/audio-forge.scheduler.js';
import { resolveIntent } from '../../src/audio/sfx-intent-resolver.js';

function createMockAudioContext(sampleRate = 44100) {
  const buffers = [];
  return {
    sampleRate,
    state: 'running',
    currentTime: 0,
    createBuffer: (channels, length, rate) => ({
      numberOfChannels: channels,
      length,
      sampleRate: rate,
      getChannelData: () => new Float32Array(length),
      copyToChannel: vi.fn(),
    }),
    createBufferSource: () => ({
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      onended: null,
      disconnect: vi.fn(),
    }),
    createStereoPanner: () => ({
      pan: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    destination: {},
    _buffers: buffers,
  };
}

describe('Audio Forge — scheduler hardening', () => {
  beforeEach(() => {
    clearAudioBufferCache();
  });

  it('resolvePacketPcm falls back to main thread when worker is null', async () => {
    const { packet } = resolveIntent('FOOTSTEP', { stepIndex: 0, surface: 'stone' });
    const result = await resolvePacketPcm({
      packet,
      sampleRate: 44100,
      worker: null,
    });

    expect(result.source).toBe('main');
    expect(result.pcm).toBeInstanceOf(Float32Array);
    expect(result.pcm.length).toBeGreaterThan(0);
  });

  it('resolvePacketPcm falls back to main thread when worker returns failure', async () => {
    const { packet } = resolveIntent('SPELL_CAST', { battleId: 'test' });
    const worker = {
      postMessage: (message) => {
        handleWorkerMessage({
          data: {
            id: message.id,
            ok: false,
            buffer: null,
            error: 'RENDER_FAILED',
          },
        });
      },
    };

    const result = await resolvePacketPcm({
      packet,
      sampleRate: 44100,
      worker,
    });

    expect(result.source).toBe('main');
    expect(result.pcm?.length).toBeGreaterThan(0);
  });

  it('resolvePacketAudioBuffer caches rendered buffers by checksum', async () => {
    const { packet } = resolveIntent('UI_CONFIRM', {});
    const audioContext = createMockAudioContext();

    const first = await resolvePacketAudioBuffer({ packet, audioContext, worker: null });
    const second = await resolvePacketAudioBuffer({ packet, audioContext, worker: null });

    expect(first.source).toBe('main');
    expect(second.source).toBe('cache');
    expect(second.audioBuffer).toBe(first.audioBuffer);
  });
});
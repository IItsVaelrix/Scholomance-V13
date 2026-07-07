import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../codex/core/shared/math/seededRng.js';
import { buildTransientBuffer } from '../../codex/core/audio-forge/dsp/transient.js';
import { resolveIntent } from '../../src/audio/sfx-intent-resolver.js';
import { renderSfxBuffer } from '../../codex/core/audio-forge/dsp/buffer-renderer.js';

describe('Audio Forge — transient synthesis', () => {
  it('buildTransientBuffer returns finite samples in [-1, 1]', () => {
    const rng = mulberry32(42);
    const buffer = buildTransientBuffer({
      durationSamples: 512,
      sampleRate: 44100,
      attackMs: 1.5,
      decayMs: 55,
      brightnessHz: 900,
      bodyHz: 180,
    }, rng);

    expect(buffer).toBeInstanceOf(Float32Array);
    expect(buffer.length).toBe(512);
    for (let i = 0; i < buffer.length; i++) {
      expect(Number.isFinite(buffer[i])).toBe(true);
      expect(buffer[i]).toBeGreaterThanOrEqual(-1);
      expect(buffer[i]).toBeLessThanOrEqual(1);
    }
  });

  it('FOOTSTEP event resolves and renders without NaN', () => {
    const { packet } = resolveIntent('FOOTSTEP', {
      surface: 'void_ice',
      stepIndex: 3,
      battleId: 'arena-1',
      tx: 2,
      ty: 4,
    });

    const result = renderSfxBuffer(packet, 44100);
    expect(result.ok).toBe(true);
    expect(result.channelData.length).toBeGreaterThan(0);

    for (let i = 0; i < result.channelData.length; i++) {
      expect(Number.isFinite(result.channelData[i])).toBe(true);
    }
  });

  it('different stepIndex seeds produce different FOOTSTEP output', () => {
    const base = { surface: 'stone', battleId: 'arena-1', tx: 1, ty: 1 };
    const { packet: p1 } = resolveIntent('FOOTSTEP', { ...base, stepIndex: 1 });
    const { packet: p2 } = resolveIntent('FOOTSTEP', { ...base, stepIndex: 2 });
    const r1 = renderSfxBuffer(p1, 44100);
    const r2 = renderSfxBuffer(p2, 44100);

    let differs = false;
    for (let i = 0; i < Math.min(r1.channelData.length, r2.channelData.length); i++) {
      if (r1.channelData[i] !== r2.channelData[i]) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });
});
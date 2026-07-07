import { describe, it, expect } from 'vitest';
import { resolveIntent } from '../../src/audio/sfx-intent-resolver.js';
import { renderSfxBuffer } from '../../codex/core/audio-forge/dsp/buffer-renderer.js';

describe('Audio Forge — obelisk electric SFX', () => {
  it('OBELISK_CHARGE uses a short FM zap voice at peak intensity', () => {
    const { packet } = resolveIntent('OBELISK_CHARGE', {
      intensity: 0.95,
      pulseIndex: 3,
      battleId: 'arena-1',
    });

    expect(packet.durationMs).toBeLessThan(220);
    expect(packet.synthesis.voices[0].type).toBe('zap');
    expect(packet.synthesis.voices[0].modIndex).toBeGreaterThanOrEqual(7);
  });

  it('OBELISK_DISCHARGE uses harsh FM zap plus spark bursts', () => {
    const { packet } = resolveIntent('OBELISK_DISCHARGE', {
      intensity: 1,
      pulseIndex: 4,
      battleId: 'arena-1',
    });

    expect(packet.synthesis.voices[0].type).toBe('zap');
    expect(packet.synthesis.voices[0].modIndex).toBeGreaterThanOrEqual(18);
    expect(packet.synthesis.voices[0].impact).toBe(1);
    expect(packet.synthesis.voices.some((v) => v.type === 'transient')).toBe(true);
    expect(packet.synthesis.voices.some((v) => v.noiseType === 'crackle')).toBe(true);

    const result = renderSfxBuffer(packet, 44100);
    expect(result.ok).toBe(true);
    expect(result.channelData.length).toBeGreaterThan(0);
  });

  it('different pulseIndex seeds produce different discharge output', () => {
    const base = { intensity: 1, battleId: 'arena-1' };
    const r1 = renderSfxBuffer(resolveIntent('OBELISK_DISCHARGE', { ...base, pulseIndex: 8 }).packet, 44100);
    const r2 = renderSfxBuffer(resolveIntent('OBELISK_DISCHARGE', { ...base, pulseIndex: 12 }).packet, 44100);

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
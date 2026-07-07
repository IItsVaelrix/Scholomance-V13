import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../codex/core/shared/math/seededRng.js';
import {
  buildArcSnapBursts,
  buildElectricShockBuffer,
  buildHighVoltageZapBuffer,
  buildSampleHoldModulation,
} from '../../codex/core/audio-forge/dsp/electric-shock.js';

describe('Audio Forge — electric shock DSP', () => {
  it('buildSampleHoldModulation holds values in blocks', () => {
    const rng = mulberry32(99);
    const { mod, holdSamples } = buildSampleHoldModulation(128, 44100, 40, rng);
    expect(holdSamples).toBeGreaterThan(0);
    expect(mod[0]).toBe(mod[Math.min(holdSamples - 1, 127)]);
    expect(mod[holdSamples]).not.toBe(mod[0]);
  });

  it('buildElectricShockBuffer returns finite samples in [-1, 1]', () => {
    const rng = mulberry32(7);
    const buffer = buildElectricShockBuffer({
      durationSamples: 2048,
      sampleRate: 44100,
      centerFreqHz: 3000,
      q: 18,
      shRateHz: 60,
      shDepth: 0.9,
      shMode: 'both',
      cutoffSpreadHz: 1200,
    }, rng);

    expect(buffer).toBeInstanceOf(Float32Array);
    expect(buffer.length).toBe(2048);
    for (let i = 0; i < buffer.length; i++) {
      expect(Number.isFinite(buffer[i])).toBe(true);
      expect(buffer[i]).toBeGreaterThanOrEqual(-1);
      expect(buffer[i]).toBeLessThanOrEqual(1);
    }
  });

  it('buildHighVoltageZapBuffer renders finite FM + snap output', () => {
    const rng = mulberry32(12);
    const buffer = buildHighVoltageZapBuffer({
      durationSamples: 1024,
      sampleRate: 44100,
      carrierFreq: 480,
      modFreq: 173,
      modIndex: 12,
      burstDensity: 0.02,
      burstDecayMs: 5,
    }, rng);

    expect(buffer.length).toBe(1024);
    let nonZero = 0;
    for (let i = 0; i < buffer.length; i++) {
      expect(Number.isFinite(buffer[i])).toBe(true);
      if (Math.abs(buffer[i]) > 0.001) nonZero += 1;
    }
    expect(nonZero).toBeGreaterThan(10);
  });

  it('buildArcSnapBursts stays sparse (not sustained wind)', () => {
    const rng = mulberry32(21);
    const bursts = buildArcSnapBursts(2048, 44100, 0.015, 5, rng);
    let active = 0;
    for (let i = 0; i < bursts.length; i++) {
      if (Math.abs(bursts[i]) > 0.05) active += 1;
    }
    expect(active).toBeLessThan(bursts.length * 0.2);
  });

  it('amplitude and cutoff modes produce different spectra of motion', () => {
    const base = {
      durationSamples: 1024,
      sampleRate: 44100,
      centerFreqHz: 2800,
      q: 16,
      shRateHz: 48,
      shDepth: 0.95,
    };
    const amp = buildElectricShockBuffer({ ...base, shMode: 'amplitude', cutoffSpreadHz: 0 }, mulberry32(1));
    const cut = buildElectricShockBuffer({ ...base, shMode: 'cutoff', cutoffSpreadHz: 1400 }, mulberry32(1));

    let differs = false;
    for (let i = 0; i < amp.length; i++) {
      if (amp[i] !== cut[i]) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });
});
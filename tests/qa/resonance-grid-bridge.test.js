import { describe, it, expect } from 'vitest';
import { compileGrid, fractionalBeatAt, sampleChannel } from '../../codex/core/pixelbrain/resonance-grid-bridge';
import { getRotationAtTime, getRotationFromResonance, getRotationWithPulseFromResonance, GEAR_GLIDE_CONFIG } from '../../codex/core/pixelbrain/gear-glide-amp';

describe('Resonance Grid Bridge', () => {

  describe('Drift & Continuity (fractionalBeatAt)', () => {
    it('returns exact integers at every downbeat (no accumulated drift)', () => {
      // Base tempo 120 BPM = 500ms per beat.
      // We encode a tempo change where the 4th beat is delayed (600ms instead of 500ms)
      const sidecar = {
        sync: {
          bpm: 120,
          downbeatsMs: [0, 500, 1000, 1500, 2100, 2600, 3100]
        }
      };
      const grid = compileGrid(sidecar);

      // 1000ms is exactly beat 2.
      expect(fractionalBeatAt(grid, 1000)).toBeCloseTo(2, 5);
      // 1500ms is exactly beat 3.
      expect(fractionalBeatAt(grid, 1500)).toBeCloseTo(3, 5);
      // 2100ms is exactly beat 4 (where the tempo shifted).
      // Math.round((2100 - 1500) / 500) = Math.round(1.2) = 1 beat interval. So it's beat 4.
      expect(fractionalBeatAt(grid, 2100)).toBeCloseTo(4, 5);
      // 3100ms is beat 6.
      expect(fractionalBeatAt(grid, 3100)).toBeCloseTo(6, 5);
    });

    it('has no jump greater than epsilon across boundaries (continuity)', () => {
      const sidecar = {
        sync: {
          bpm: 120,
          downbeatsMs: [0, 500, 1000, 1500, 2100] // Tempo drift at 1500-2100
        }
      };
      const grid = compileGrid(sidecar);
      
      const epsilon = 1e-4;
      const beatAt1500 = fractionalBeatAt(grid, 1500); // exactly 3
      
      const beatJustBefore = fractionalBeatAt(grid, 1500 - epsilon);
      const beatJustAfter = fractionalBeatAt(grid, 1500 + epsilon);
      
      expect(Math.abs(beatAt1500 - beatJustBefore)).toBeLessThan(0.001);
      expect(Math.abs(beatAt1500 - beatJustAfter)).toBeLessThan(0.001);
    });
  });

  describe('Fallback', () => {
    it('produces output identical to current getRotationAtTime when grid is empty', () => {
      const emptyGrid = compileGrid({ sync: { bpm: 120, downbeatsMs: [] } });
      const timeMs = 12345;
      const degreesPerBeat = 90;
      
      const legacyRotation = getRotationAtTime(timeMs, 120, degreesPerBeat);
      const bridgeRotation = getRotationFromResonance(emptyGrid, timeMs, degreesPerBeat);
      
      expect(bridgeRotation).toBeCloseTo(legacyRotation, 5);
    });
  });

  describe('Pulse Mapping & Interpolation', () => {
    const sidecar = {
      sync: { bpm: 120 },
      channels: {
        'spectral.onset': { interpolation: 'step', default: 0 },
        'spectral.rms': { interpolation: 'linear', default: 0.1 },
        'resonance.violence': { interpolation: 'step' } // no default specified
      },
      frames: [
        { timeMs: 0, spectral: { onset: 0, rms: 0.2 } },
        { timeMs: 500, spectral: { onset: 1, rms: 0.8 }, resonance: { violence: 0.5 } },
        { timeMs: 600, spectral: { onset: 0, rms: 0.4 } },
        { timeMs: 1000, spectral: { onset: 0, rms: 0.2 }, resonance: { violence: 0.9 } }
      ]
    };
    
    it('interpolates step vs linear correctly', () => {
      const grid = compileGrid(sidecar);
      
      // Step channel (onset): should hold value until next frame
      expect(sampleChannel(grid, 'spectral.onset', 0)).toBe(0);
      expect(sampleChannel(grid, 'spectral.onset', 499)).toBe(0);
      expect(sampleChannel(grid, 'spectral.onset', 500)).toBe(1);
      expect(sampleChannel(grid, 'spectral.onset', 550)).toBe(1); // held step
      expect(sampleChannel(grid, 'spectral.onset', 600)).toBe(0);
      
      // Linear channel (rms): should interpolate
      expect(sampleChannel(grid, 'spectral.rms', 0)).toBe(0.2);
      expect(sampleChannel(grid, 'spectral.rms', 250)).toBeCloseTo(0.5, 5); // Halfway between 0.2 and 0.8
      expect(sampleChannel(grid, 'spectral.rms', 550)).toBeCloseTo(0.6, 5); // Halfway between 0.8 and 0.4
    });

    it('applies default where a channel frame is absent', () => {
      const grid = compileGrid(sidecar);
      // 'resonance.violence' has no default, but it's absent at t=0
      // Our compileGrid doesn't record it if it's undefined, so before t=500, it falls back to 0 (default fallback in sampleChannel if not specified).
      expect(sampleChannel(grid, 'resonance.violence', 0)).toBe(0);
      expect(sampleChannel(grid, 'resonance.violence', 500)).toBe(0.5);
    });

    it('generates pulse peak at onset:1 scaled by rms, and baseline at onset:0', () => {
      const grid = compileGrid(sidecar);
      
      // At t=0, onset=0, so pulse should be 1.0 (baseline)
      const res0 = getRotationWithPulseFromResonance(grid, 0);
      expect(res0.pulse).toBe(1.0);
      
      // At t=500, onset=1, rms=0.8. pulseAmplitude = 0.8 * BEAT_PULSE_AMOUNT
      const res500 = getRotationWithPulseFromResonance(grid, 500);
      expect(res500.pulse).toBeCloseTo(1 + 0.8 * GEAR_GLIDE_CONFIG.BEAT_PULSE_AMOUNT, 5);
      
      // At t=550, onset=1, rms=0.6 (interpolated).
      const res550 = getRotationWithPulseFromResonance(grid, 550);
      expect(res550.pulse).toBeCloseTo(1 + 0.6 * GEAR_GLIDE_CONFIG.BEAT_PULSE_AMOUNT, 5);
      
      // At t=600, onset=0, so pulse drops to baseline 1.0
      const res600 = getRotationWithPulseFromResonance(grid, 600);
      expect(res600.pulse).toBe(1.0);
    });
  });
});

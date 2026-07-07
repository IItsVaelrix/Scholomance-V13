/**
 * Audio analysis for Remotion Forge (Phase 8)
 * Runs in browser using Web Audio API.
 * Produces beat positions and RMS envelope for reactivity.
 */

export interface AudioAnalysis {
  bpm?: number;
  beats: number[];        // frame indices
  rms: number[];          // 0-1 values
  windowSize: number;     // frames per sample
  duration: number;       // seconds
}

export async function analyzeAudio(
  url: string,
  fps: number = 30,
  windowMs: number = 50   // ~1.5 frames at 30fps
): Promise<AudioAnalysis> {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const duration = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0); // mono for simplicity

  const windowSizeSamples = Math.floor(sampleRate * (windowMs / 1000));
  const totalWindows = Math.floor(channelData.length / windowSizeSamples);

  const rms: number[] = [];

  // Compute RMS per window
  for (let w = 0; w < totalWindows; w++) {
    let sum = 0;
    const start = w * windowSizeSamples;
    for (let i = 0; i < windowSizeSamples && (start + i) < channelData.length; i++) {
      const sample = channelData[start + i];
      sum += sample * sample;
    }
    const windowRms = Math.sqrt(sum / windowSizeSamples);
    rms.push(Math.min(1, windowRms * 3)); // normalize roughly
  }

  // Very naive beat detection: look for local energy peaks above threshold
  const beats: number[] = [];
  const threshold = 0.4;
  const minBeatDistanceFrames = Math.floor(fps * 0.2); // ~200ms

  let lastBeat = -999;

  for (let i = 1; i < rms.length - 1; i++) {
    const prev = rms[i - 1];
    const curr = rms[i];
    const next = rms[i + 1];

    if (curr > threshold && curr > prev && curr > next) {
      const frame = Math.floor((i * windowSizeSamples / sampleRate) * fps);
      if (frame - lastBeat > minBeatDistanceFrames) {
        beats.push(frame);
        lastBeat = frame;
      }
    }
  }

  // Very rough BPM from average beat interval
  let bpm: number | undefined;
  if (beats.length > 1) {
    const intervals: number[] = [];
    for (let i = 1; i < beats.length; i++) {
      intervals.push(beats[i] - beats[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    bpm = Math.round((60 * fps) / avgInterval);
    if (bpm < 60 || bpm > 200) bpm = undefined;
  }

  const windowSizeFrames = Math.floor((windowSizeSamples / sampleRate) * fps);

  audioContext.close();

  return {
    bpm,
    beats,
    rms,
    windowSize: windowSizeFrames,
    duration,
  };
}

/**
 * Get interpolated RMS value at a specific frame.
 */
export function getRmsAtFrame(analysis: AudioAnalysis | undefined, frame: number): number {
  if (!analysis || !analysis.rms.length) return 0;
  const idx = Math.floor(frame / analysis.windowSize);
  const safeIdx = Math.max(0, Math.min(analysis.rms.length - 1, idx));
  return analysis.rms[safeIdx] ?? 0;
}

/**
 * Returns 1 if a beat is "active" near this frame (for pulses).
 * Uses a short decay window.
 */
export function getBeatPulse(analysis: AudioAnalysis | undefined, frame: number, decayFrames: number = 8): number {
  if (!analysis || analysis.beats.length === 0) return 0;

  let closest = Infinity;
  for (const b of analysis.beats) {
    const dist = Math.abs(b - frame);
    if (dist < closest) closest = dist;
  }

  if (closest > decayFrames) return 0;
  return Math.max(0, 1 - (closest / decayFrames));
}

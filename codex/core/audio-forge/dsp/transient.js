/**
 * Audio Forge DSP — Transient Impact Synthesizer
 *
 * Percussive one-shots: footsteps, taps, soft impacts.
 * Combines band-shaped noise with an optional body thump.
 *
 * CLASSIFICATION: core / pure / DSP
 * LAYER: codex/core — NO DOM, NO AudioContext, NO side effects.
 * DETERMINISM: same params + same rng stream → same output always.
 */

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function msToSamples(ms, sampleRate) {
  return Math.max(1, Math.round((Number.isFinite(ms) ? ms : 0) * sampleRate / 1000));
}

/**
 * One-pole lowpass at a given cutoff (first-order, stable).
 *
 * @param {Float32Array} input
 * @param {number} sampleRate
 * @param {number} cutoffHz
 * @returns {Float32Array}
 */
function lowpass(input, sampleRate, cutoffHz) {
  const output = new Float32Array(input.length);
  const fc = Math.max(40, Math.min(sampleRate * 0.45, Number.isFinite(cutoffHz) ? cutoffHz : 800));
  const coeff = Math.exp(-2 * Math.PI * fc / sampleRate);
  let state = 0;
  for (let i = 0; i < input.length; i++) {
    state = (1 - coeff) * input[i] + coeff * state;
    output[i] = state;
  }
  return output;
}

/**
 * Exponential decay envelope with configurable attack.
 *
 * @param {number} durationSamples
 * @param {number} attackSamples
 * @param {number} decayTauSamples
 * @returns {Float32Array}
 */
function buildImpactEnvelope(durationSamples, attackSamples, decayTauSamples) {
  const envelope = new Float32Array(durationSamples);
  const attack = Math.max(1, Math.min(durationSamples, attackSamples));
  const tau = Math.max(1, decayTauSamples);

  for (let i = 0; i < durationSamples; i++) {
    let gain;
    if (i < attack) {
      gain = i / attack;
    } else {
      gain = Math.exp(-(i - attack) / tau);
    }
    envelope[i] = clamp01(gain);
  }
  return envelope;
}

/**
 * Builds a percussive transient buffer.
 *
 * @param {object} params
 * @param {number} params.durationSamples
 * @param {number} params.sampleRate
 * @param {number} [params.attackMs=1.5]
 * @param {number} [params.decayMs=55]
 * @param {number} [params.brightnessHz=900]
 * @param {number} [params.bodyHz=180]
 * @param {number} [params.bodyMix=0.35]
 * @param {number} [params.noiseMix=0.65]
 * @param {() => number} rng
 * @returns {Float32Array}
 */
export function buildTransientBuffer(
  {
    durationSamples,
    sampleRate,
    attackMs = 1.5,
    decayMs = 55,
    brightnessHz = 900,
    bodyHz = 180,
    bodyMix = 0.35,
    noiseMix = 0.65,
  },
  rng,
) {
  const n = Math.max(1, Math.round(durationSamples));
  const attackSamples = msToSamples(attackMs, sampleRate);
  const decayTauSamples = msToSamples(decayMs, sampleRate);
  const envelope = buildImpactEnvelope(n, attackSamples, decayTauSamples);

  const noise = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    noise[i] = rng() * 2 - 1;
  }

  const brightNoise = lowpass(noise, sampleRate, brightnessHz);
  const bodyNoise = lowpass(noise, sampleRate, bodyHz);

  const bodyTone = new Float32Array(n);
  const phaseInc = (2 * Math.PI * Math.max(40, bodyHz)) / sampleRate;
  let phase = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    bodyTone[i] = Math.sin(phase);
    phase += phaseInc;
    if (phase > Math.PI * 2) phase -= Math.PI * 2;
  }

  const safeNoiseMix = clamp01(noiseMix);
  const safeBodyMix = clamp01(bodyMix);
  const output = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const noiseSample = brightNoise[i] * safeNoiseMix + bodyNoise[i] * (1 - safeNoiseMix) * 0.5;
    const bodySample = bodyTone[i] * safeBodyMix;
    output[i] = (noiseSample + bodySample) * envelope[i];
  }

  let peak = 0;
  for (let i = 0; i < n; i++) {
    const abs = Math.abs(output[i]);
    if (abs > peak) peak = abs;
  }
  if (peak > 1) {
    for (let i = 0; i < n; i++) output[i] /= peak;
  }

  return output;
}
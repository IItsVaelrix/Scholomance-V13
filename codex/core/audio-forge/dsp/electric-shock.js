/**
 * Audio Forge DSP — Electric Shock Synthesizer
 *
 * Noise + Sample-and-Hold LFO + high-resonance bandpass.
 * Classic arc/zap timbre: stepped random amplitude and/or cutoff sweeps
 * through a narrow resonant filter.
 *
 * CLASSIFICATION: core / pure / DSP
 * LAYER: codex/core — NO DOM, NO AudioContext, NO side effects.
 * DETERMINISM: same params + same rng stream → same output always.
 */

import { buildWhiteNoise } from './noise.js';
import { computeBiquadCoefficients, applyBiquadFilter } from './parametric-eq.js';

function clamp01(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

/**
 * Builds a 0..1 sample-and-hold modulation curve.
 *
 * @param {number} durationSamples
 * @param {number} sampleRate
 * @param {number} shRateHz
 * @param {() => number} rng
 * @returns {{ mod: Float32Array, holdSamples: number }}
 */
export function buildSampleHoldModulation(durationSamples, sampleRate, shRateHz, rng) {
  const n = Math.max(1, durationSamples);
  const mod = new Float32Array(n);
  const holdSamples = Math.max(1, Math.round(sampleRate / Math.max(1, shRateHz)));
  let held = rng();
  let counter = 0;

  for (let i = 0; i < n; i++) {
    if (counter <= 0) {
      held = rng();
      counter = holdSamples;
    }
    counter -= 1;
    mod[i] = held;
  }

  return { mod, holdSamples };
}

/**
 * Applies a bandpass in segments with per-segment center frequency from S&H.
 *
 * @param {Float32Array} input
 * @param {Float32Array} shMod - 0..1 held values
 * @param {number} holdSamples
 * @param {object} params
 * @returns {Float32Array}
 */
function applySegmentedBandpass(input, shMod, holdSamples, {
  sampleRate,
  centerFreqHz,
  q,
  cutoffSpreadHz,
}) {
  const n = input.length;
  const output = new Float32Array(n);
  const spread = Math.max(0, Number.isFinite(cutoffSpreadHz) ? cutoffSpreadHz : 0);
  const safeQ = Math.max(0.5, Number.isFinite(q) ? q : 12);
  const baseFc = Math.max(120, Number.isFinite(centerFreqHz) ? centerFreqHz : 2800);

  let i = 0;
  while (i < n) {
    const segmentEnd = Math.min(n, i + holdSamples);
    const held = shMod[i];
    const freqOffset = (held * 2 - 1) * spread;
    const fc = Math.max(120, Math.min(sampleRate * 0.42, baseFc + freqOffset));
    const coef = computeBiquadCoefficients({
      type: 'bandpass',
      frequencyHz: fc,
      q: safeQ,
      sampleRate,
    });

    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;

    for (let j = i; j < segmentEnd; j++) {
      const x0 = input[j];
      let y0 = coef.b0 * x0 + coef.b1 * x1 + coef.b2 * x2 - coef.a1 * y1 - coef.a2 * y2;
      if (!Number.isFinite(y0)) y0 = 0;
      output[j] = y0;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
    }

    i = segmentEnd;
  }

  return output;
}

/**
 * Static high-Q bandpass.
 *
 * @param {Float32Array} input
 * @param {object} params
 * @returns {Float32Array}
 */
function applyStaticBandpass(input, { sampleRate, centerFreqHz, q }) {
  const n = input.length;
  const output = new Float32Array(n);
  const safeQ = Math.max(0.5, Number.isFinite(q) ? q : 12);
  const fc = Math.max(120, Math.min(sampleRate * 0.42, Number.isFinite(centerFreqHz) ? centerFreqHz : 2800));
  const coef = computeBiquadCoefficients({
    type: 'bandpass',
    frequencyHz: fc,
    q: safeQ,
    sampleRate,
  });

  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < n; i++) {
    const x0 = input[i];
    let y0 = coef.b0 * x0 + coef.b1 * x1 + coef.b2 * x2 - coef.a1 * y1 - coef.a2 * y2;
    if (!Number.isFinite(y0)) y0 = 0;
    output[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return output;
}

/**
 * Builds an electric shock buffer from noise + S&H + resonant bandpass.
 *
 * @param {object} params
 * @param {number} params.durationSamples
 * @param {number} params.sampleRate
 * @param {number} [params.centerFreqHz=2800]
 * @param {number} [params.q=16] - bandpass resonance
 * @param {number} [params.shRateHz=48] - sample-and-hold LFO rate
 * @param {number} [params.shDepth=0.9] - S&H modulation depth (0..1)
 * @param {'amplitude'|'cutoff'|'both'} [params.shMode='both']
 * @param {number} [params.cutoffSpreadHz=1000] - S&H cutoff deviation when shMode includes cutoff
 * @param {() => number} rng
 * @returns {Float32Array}
 */
export function buildElectricShockBuffer(
  {
    durationSamples,
    sampleRate,
    centerFreqHz = 2800,
    q = 16,
    shRateHz = 48,
    shDepth = 0.9,
    shMode = 'both',
    cutoffSpreadHz = 1000,
  },
  rng,
) {
  const n = Math.max(1, Math.round(durationSamples));
  const depth = clamp01(shDepth, 0.9);
  const mode = shMode === 'amplitude' || shMode === 'cutoff' ? shMode : 'both';
  const noise = buildWhiteNoise(n, rng);
  const { mod: shMod, holdSamples } = buildSampleHoldModulation(n, sampleRate, shRateHz, rng);

  const working = new Float32Array(n);

  if (mode === 'amplitude' || mode === 'both') {
    for (let i = 0; i < n; i++) {
      const amp = 1 - depth + depth * shMod[i];
      working[i] = noise[i] * amp;
    }
  } else {
    working.set(noise);
  }

  let filtered;
  if (mode === 'cutoff' || mode === 'both') {
    filtered = applySegmentedBandpass(working, shMod, holdSamples, {
      sampleRate,
      centerFreqHz,
      q,
      cutoffSpreadHz,
    });
  } else {
    filtered = applyStaticBandpass(working, { sampleRate, centerFreqHz, q });
  }

  let peak = 0;
  for (let i = 0; i < n; i++) {
    const abs = Math.abs(filtered[i]);
    if (abs > peak) peak = abs;
  }
  if (peak > 1) {
    for (let i = 0; i < n; i++) filtered[i] /= peak;
  }

  return filtered;
}

/**
 * Sparse randomized high-voltage snap bursts (not sustained noise/wind).
 *
 * @param {number} durationSamples
 * @param {number} sampleRate
 * @param {number} burstDensity - per-sample trigger probability
 * @param {number} burstDecayMs
 * @param {() => number} rng
 * @returns {Float32Array}
 */
function msToSamples(ms, sampleRate) {
  return Math.max(1, Math.round((Number.isFinite(ms) ? ms : 0) * sampleRate / 1000));
}

/**
 * Initial broadband lightning crack (first few ms).
 *
 * @param {number} durationSamples
 * @param {number} sampleRate
 * @param {number} impact
 * @param {() => number} rng
 * @returns {Float32Array}
 */
function buildLightningCrackOnset(durationSamples, sampleRate, impact, rng) {
  const n = Math.max(1, durationSamples);
  const buf = new Float32Array(n);
  const power = clamp01(impact, 0.8);
  const onsetSamples = Math.min(n, msToSamples(4 + power * 10, sampleRate));

  for (let i = 0; i < onsetSamples; i++) {
    const env = Math.exp(-i / Math.max(1, onsetSamples * 0.12));
    buf[i] += (rng() * 2 - 1) * env * (0.95 + power * 0.55);
  }

  for (let i = 0; i < Math.min(n, 6); i++) {
    buf[i] += (i % 2 === 0 ? 1 : -1) * (1 - i / 6) * (0.65 + power * 0.35);
  }

  const hp = computeBiquadCoefficients({
    type: 'highpass',
    frequencyHz: 900,
    q: 0.7,
    sampleRate,
  });
  return applyBiquadFilter(buf, hp);
}

/**
 * FM arc with pitch-drop sweep (lightning collapse character).
 *
 * @param {object} params
 * @param {() => number} rng
 * @returns {Float32Array}
 */
function buildFmZapWithPitchDrop(
  { durationSamples, sampleRate, carrierFreq, modFreq, modIndex, impact },
  rng,
) {
  const n = Math.max(1, durationSamples);
  const buf = new Float32Array(n);
  const power = clamp01(impact, 0.8);
  const idx = Math.max(1, modIndex) * (0.85 + power * 0.35);
  let carrierPhase = rng() * Math.PI * 2;
  let modPhase = rng() * Math.PI * 2;

  for (let i = 0; i < n; i++) {
    const progress = i / Math.max(1, n - 1);
    const sweep = 1 - progress * (0.45 + power * 0.2);
    const fc = Math.max(80, carrierFreq * sweep);
    const fm = Math.max(40, modFreq * sweep * 1.15);
    carrierPhase += (2 * Math.PI * fc) / sampleRate;
    modPhase += (2 * Math.PI * fm) / sampleRate;
    const env = Math.exp(-progress * (2.2 + power * 1.4));
    buf[i] = Math.sin(carrierPhase + idx * Math.sin(modPhase)) * env;
  }

  return buf;
}

export function buildArcSnapBursts(durationSamples, sampleRate, burstDensity, burstDecayMs, rng, impact = 0.8) {
  const n = Math.max(1, durationSamples);
  const buf = new Float32Array(n);
  const density = Math.max(0.001, Math.min(0.5, burstDensity));
  const power = clamp01(impact, 0.8);
  const decaySamples = Math.max(2, Math.round((burstDecayMs || 6) * sampleRate / 1000));
  const durationMs = (n * 1000) / sampleRate;
  const snapCount = Math.max(2, Math.round(density * durationMs));
  const frontWindow = Math.max(decaySamples * 2, Math.floor(n * 0.22));
  const frontCount = Math.max(1, Math.ceil(snapCount * (0.45 + power * 0.25)));

  for (let s = 0; s < snapCount; s++) {
    const inFront = s < frontCount;
    const pos = inFront
      ? Math.floor(rng() * Math.max(1, frontWindow - decaySamples))
      : Math.floor(rng() * Math.max(1, n - decaySamples * 2));
    const amp = (0.75 + rng() * 0.55) * (inFront ? 1.25 + power * 0.35 : 0.85);
    const len = Math.floor(rng() * decaySamples * 0.75) + 2;
    const sign = rng() > 0.5 ? 1 : -1;

    for (let j = 0; j < len && pos + j < n; j++) {
      const env = Math.exp(-j / Math.max(1, decaySamples * 0.16));
      buf[pos + j] += sign * amp * env * (rng() * 2 - 1);
    }
  }

  const hp = computeBiquadCoefficients({
    type: 'highpass',
    frequencyHz: 750,
    q: 0.75,
    sampleRate,
  });
  return applyBiquadFilter(buf, hp);
}

/**
 * Harsh metallic FM core + chaotic arc snap bursts.
 *
 * @param {object} params
 * @param {number} params.durationSamples
 * @param {number} params.sampleRate
 * @param {number} [params.carrierFreq=420]
 * @param {number} [params.modFreq=163]
 * @param {number} [params.modIndex=10]
 * @param {number} [params.burstDensity=0.012]
 * @param {number} [params.burstDecayMs=7]
 * @param {number} [params.metallicMix=0.5]
 * @param {number} [params.snapMix=0.5]
 * @param {() => number} rng
 * @returns {Float32Array}
 */
export function buildHighVoltageZapBuffer(
  {
    durationSamples,
    sampleRate,
    carrierFreq = 420,
    modFreq = 163,
    modIndex = 10,
    burstDensity = 0.012,
    burstDecayMs = 7,
    metallicMix = 0.5,
    snapMix = 0.5,
    impact = 0.85,
  },
  rng,
) {
  const n = Math.max(1, Math.round(durationSamples));
  const power = clamp01(impact, 0.85);
  const crack = buildLightningCrackOnset(n, sampleRate, power, rng);
  const fm = buildFmZapWithPitchDrop({
    durationSamples: n,
    sampleRate,
    carrierFreq,
    modFreq,
    modIndex,
    impact: power,
  }, rng);
  const snaps = buildArcSnapBursts(n, sampleRate, burstDensity, burstDecayMs, rng, power);

  const metalW = clamp01(metallicMix, 0.5) * (0.9 + power * 0.35);
  const snapW = clamp01(snapMix, 0.5) * (0.95 + power * 0.45);
  const crackW = 0.55 + power * 0.65;
  const output = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    output[i] = crack[i] * crackW + fm[i] * metalW + snaps[i] * snapW;
  }

  const bp = computeBiquadCoefficients({
    type: 'bandpass',
    frequencyHz: Math.min(5200, carrierFreq * 5.5),
    q: 3.2 + power * 1.5,
    sampleRate,
  });
  const shaped = applyBiquadFilter(output, bp);

  const peakBoost = 1.08 + power * 0.22;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const abs = Math.abs(shaped[i]);
    if (abs > peak) peak = abs;
  }
  if (peak > 0) {
    const scale = Math.min(peakBoost, 1 / peak);
    for (let i = 0; i < n; i++) shaped[i] *= scale;
  }

  return shaped;
}
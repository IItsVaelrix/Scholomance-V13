/**
 * Audio Forge DSP — Buffer Renderer
 *
 * Pure one-shot buffer assembly from a PB-SFX-v1 packet.
 * Orchestrates all DSP modules. Returns mono Float32Array.
 *
 * Rendering pipeline:
 *   1. Validate packet (collect warnings, graceful fallback on degraded fields)
 *   2. Per voice: oscillator → envelope → mix by gain
 *   3. Apply EQ chain if packet.effects includes parametricEQ
 *   4. Apply soft clip if packet.effects includes softClip
 *   5. Final NaN/Infinity pass → replace with 0
 *   6. Peak-limit to [-1, 1] (scales down only — never amplifies soft SFX)
 *   7. Return { ok, channelData, analysis, diagnostics }
 *
 * CORE RENDERER RETURNS MONO ONLY.
 * Stereo panning is applied by the browser adapter (StereoPannerNode),
 * never by the core layer.
 *
 * CLASSIFICATION: core / pure / DSP / orchestration
 * LAYER: codex/core — NO DOM, NO AudioContext, NO side effects.
 * DETERMINISM: same packet + same sampleRate → same channelData always.
 */

import { validateSfxPacket, clampPacketDuration, resolveAffinity, safeVoiceGain, VOICE_TYPES, ENVELOPE_ROLES } from '../pb-sfx.schema.js';
import { computePacketChecksum } from '../pb-sfx.checksum.js';
import { rngFromStringSeed } from './seeded-rng-bridge.js';
import { buildWavetable, buildWavetableBuffer, buildFmBuffer } from './oscillators.js';
import { buildNoiseBuffer } from './noise.js';
import { buildTransientBuffer } from './transient.js';
import { buildElectricShockBuffer, buildHighVoltageZapBuffer } from './electric-shock.js';
import { TRANSIENT_SURFACES } from '../pb-sfx.schema.js';
import { buildEnvelopeCurve } from './envelopes.js';
import { applyEqChain } from './parametric-eq.js';
import { applySoftClip } from './distortion.js';
import { resolveAffinityProfile } from '../affinity-audio-profiles.js';

// ─── Default ADSR ─────────────────────────────────────────────────────────────

const DEFAULT_ADSR = Object.freeze({
  attackMs: 10,
  decayMs: 100,
  sustain: 0.7,
  releaseMs: 200,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function msToSamples(ms, sampleRate) {
  return Math.max(1, Math.round((Number.isFinite(ms) ? ms : 0) * sampleRate / 1000));
}

function computeRms(buffer) {
  if (buffer.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < buffer.length; i++) sumSq += buffer[i] * buffer[i];
  return Math.sqrt(sumSq / buffer.length);
}

function computePeak(buffer) {
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    const abs = Math.abs(buffer[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

function sanitizeSamples(buffer) {
  let nanCount = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (!Number.isFinite(buffer[i])) {
      buffer[i] = 0;
      nanCount++;
    }
  }
  return nanCount;
}

/**
 * Peak LIMITER, not a normalizer: scales the buffer DOWN so its peak is at most
 * 1.0, and leaves quieter buffers untouched (never amplifies). This prevents
 * clipping without manufacturing loudness for soft SFX.
 *
 * @param {Float32Array} buffer
 * @returns {Float32Array} Same buffer, modified in-place
 */
const TRANSIENT_SURFACE_DEFAULTS = Object.freeze({
  [TRANSIENT_SURFACES.STONE]:   { attackMs: 1.2, decayMs: 52, brightnessHz: 820, bodyHz: 170, bodyMix: 0.38, noiseMix: 0.62 },
  [TRANSIENT_SURFACES.ICE]:     { attackMs: 0.8, decayMs: 38, brightnessHz: 1400, bodyHz: 240, bodyMix: 0.22, noiseMix: 0.78 },
  [TRANSIENT_SURFACES.SLATE]:   { attackMs: 1.0, decayMs: 46, brightnessHz: 980, bodyHz: 200, bodyMix: 0.30, noiseMix: 0.70 },
  [TRANSIENT_SURFACES.METAL]:   { attackMs: 0.6, decayMs: 34, brightnessHz: 1800, bodyHz: 320, bodyMix: 0.18, noiseMix: 0.82 },
  [TRANSIENT_SURFACES.ORGANIC]: { attackMs: 2.0, decayMs: 64, brightnessHz: 520, bodyHz: 120, bodyMix: 0.45, noiseMix: 0.55 },
});

function resolveTransientSurfaceProfile(surface, voice) {
  const defaults = TRANSIENT_SURFACE_DEFAULTS[surface] ?? TRANSIENT_SURFACE_DEFAULTS[TRANSIENT_SURFACES.STONE];
  return {
    attackMs: Number.isFinite(voice.attackMs) ? voice.attackMs : defaults.attackMs,
    decayMs: Number.isFinite(voice.decayMs) ? voice.decayMs : defaults.decayMs,
    brightnessHz: Number.isFinite(voice.brightnessHz) ? voice.brightnessHz : defaults.brightnessHz,
    bodyHz: Number.isFinite(voice.bodyHz) ? voice.bodyHz : defaults.bodyHz,
    bodyMix: Number.isFinite(voice.bodyMix) ? voice.bodyMix : defaults.bodyMix,
    noiseMix: Number.isFinite(voice.noiseMix) ? voice.noiseMix : defaults.noiseMix,
  };
}

function peakLimit(buffer) {
  const peak = computePeak(buffer);
  if (peak === 0 || peak <= 1) return buffer;
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] /= peak;
  }
  return buffer;
}

// ─── Voice Renderer ───────────────────────────────────────────────────────────

/**
 * Renders a single voice to a Float32Array using the provided rng stream.
 * Returns { voiceBuffer, diagnostics }.
 *
 * @param {object} voice
 * @param {object} envelopeDefs
 * @param {number} durationMs
 * @param {number} sampleRate
 * @param {AffinityAudioProfile} affinityProfile
 * @param {() => number} rng
 * @returns {{ voiceBuffer: Float32Array, diagnostics: string[] }}
 */
function renderVoice(voice, envelopeDefs, durationMs, sampleRate, affinityProfile, rng) {
  const diagnostics = [];
  const durationSamples = msToSamples(durationMs, sampleRate);
  const baseFreq = affinityProfile.baseFrequencyHz;
  let raw;

  switch (voice.type) {
    // Additive synthesis is a sum of harmonic sinusoids — which is precisely
    // what buildWavetable produces. The two voice types share one render path
    // so the schema's advertised 'additive' type is honored, not silently
    // degraded to white noise.
    case VOICE_TYPES.ADDITIVE:
    case VOICE_TYPES.WAVETABLE: {
      const harmonics = Array.isArray(voice.harmonics) && voice.harmonics.length > 0
        ? voice.harmonics
        : [{ partial: 1, amplitude: 1.0, phase: 0 }];
      const table = buildWavetable({ harmonics, phaseWarp: voice.phaseWarp ?? 0 }, rng);
      const freq = Number.isFinite(voice.frequencyHz) ? voice.frequencyHz : baseFreq;
      raw = buildWavetableBuffer({ wavetable: table, frequencyHz: freq, durationSamples, sampleRate });
      break;
    }
    case VOICE_TYPES.NOISE: {
      raw = buildNoiseBuffer({ noiseType: voice.noiseType ?? 'white', durationSamples }, rng);
      break;
    }
    case VOICE_TYPES.FM: {
      const carrier = Number.isFinite(voice.carrierFreq) ? voice.carrierFreq : baseFreq;
      const mod = Number.isFinite(voice.modFreq) ? voice.modFreq : baseFreq / 2;
      const idx = Number.isFinite(voice.modIndex) ? voice.modIndex : 2;
      raw = buildFmBuffer({ carrierFreq: carrier, modFreq: mod, modIndex: idx, durationSamples, sampleRate }, rng);
      break;
    }
    case VOICE_TYPES.TRANSIENT: {
      const surface = Object.values(TRANSIENT_SURFACES).includes(voice.surface)
        ? voice.surface
        : TRANSIENT_SURFACES.STONE;
      const surfaceProfile = resolveTransientSurfaceProfile(surface, voice);
      raw = buildTransientBuffer({
        durationSamples,
        sampleRate,
        ...surfaceProfile,
      }, rng);
      break;
    }
    case VOICE_TYPES.ELECTRIC: {
      raw = buildElectricShockBuffer({
        durationSamples,
        sampleRate,
        centerFreqHz: Number.isFinite(voice.centerFreqHz) ? voice.centerFreqHz : 2800,
        q: Number.isFinite(voice.q) ? voice.q : 16,
        shRateHz: Number.isFinite(voice.shRateHz) ? voice.shRateHz : 48,
        shDepth: Number.isFinite(voice.shDepth) ? voice.shDepth : 0.9,
        shMode: voice.shMode ?? 'both',
        cutoffSpreadHz: Number.isFinite(voice.cutoffSpreadHz) ? voice.cutoffSpreadHz : 1000,
      }, rng);
      break;
    }
    case VOICE_TYPES.ZAP: {
      raw = buildHighVoltageZapBuffer({
        durationSamples,
        sampleRate,
        carrierFreq: Number.isFinite(voice.carrierFreq) ? voice.carrierFreq : 420,
        modFreq: Number.isFinite(voice.modFreq) ? voice.modFreq : 163,
        modIndex: Number.isFinite(voice.modIndex) ? voice.modIndex : 10,
        burstDensity: Number.isFinite(voice.burstDensity) ? voice.burstDensity : 0.012,
        burstDecayMs: Number.isFinite(voice.burstDecayMs) ? voice.burstDecayMs : 7,
        metallicMix: Number.isFinite(voice.metallicMix) ? voice.metallicMix : 0.5,
        snapMix: Number.isFinite(voice.snapMix) ? voice.snapMix : 0.5,
        impact: Number.isFinite(voice.impact) ? voice.impact : 0.85,
      }, rng);
      break;
    }
    default: {
      diagnostics.push(`VOICE_TYPE_UNKNOWN:${voice.type} — treating as white noise`);
      raw = buildNoiseBuffer({ noiseType: 'white', durationSamples }, rng);
    }
  }

  // Build envelope
  const role = Object.values(ENVELOPE_ROLES).includes(voice.envelopeRole)
    ? voice.envelopeRole
    : ENVELOPE_ROLES.ADSR;

  const adsrDef = envelopeDefs?.adsr ?? DEFAULT_ADSR;
  const envelopeParams = {
    attackMs:  adsrDef.attackMs  ?? 10,
    decayMs:   adsrDef.decayMs   ?? 100,
    sustain:   adsrDef.sustain   ?? 0.7,
    releaseMs: adsrDef.releaseMs ?? 200,
    durationMs,
    sampleRate,
  };

  const envelope = buildEnvelopeCurve(role, envelopeParams);

  // Apply envelope
  const voiced = new Float32Array(durationSamples);
  const minLen = Math.min(raw.length, envelope.length, durationSamples);
  for (let i = 0; i < minLen; i++) {
    voiced[i] = raw[i] * envelope[i];
  }

  return { voiceBuffer: voiced, diagnostics };
}

// ─── Main Renderer ────────────────────────────────────────────────────────────

/**
 * Renders a PB-SFX-v1 packet into a mono Float32Array.
 *
 * @param {object} packet - PB-SFX-v1 packet
 * @param {number} sampleRate - Target sample rate (e.g. 44100, 48000)
 * @returns {{
 *   ok: boolean,
 *   channelData: Float32Array,
 *   analysis: { peak: number, rms: number, durationSamples: number, sampleRate: number, checksum: string },
 *   diagnostics: string[]
 * }}
 */
export function renderSfxBuffer(packet, sampleRate) {
  const diagnostics = [];

  // 1. Validate
  const validation = validateSfxPacket(packet);
  if (!validation.ok) {
    return {
      ok: false,
      channelData: new Float32Array(0),
      analysis: { peak: 0, rms: 0, durationSamples: 0, sampleRate, checksum: '' },
      diagnostics: [...validation.errors, ...validation.warnings],
    };
  }
  diagnostics.push(...validation.warnings);

  // 2. Resolve and clamp fields
  const safePacket = clampPacketDuration(packet);
  const durationMs = safePacket.durationMs;
  const durationSamples = msToSamples(durationMs, sampleRate);
  const affinity = resolveAffinity(safePacket.affinity);
  if (affinity !== safePacket.affinity) {
    diagnostics.push(`AFFINITY_FALLBACK:CODEX`);
  }
  const affinityProfile = resolveAffinityProfile(affinity);

  // 3. Build seeded RNG from packet seed
  const rng = rngFromStringSeed(`${safePacket.eventType}:${safePacket.seed}`);

  // 4. Render each voice and mix
  const voices = safePacket.synthesis?.voices ?? [];
  const mixed = new Float32Array(durationSamples);

  for (let v = 0; v < voices.length; v++) {
    const voice = voices[v];
    const { voiceBuffer, diagnostics: vDiag } = renderVoice(
      voice,
      safePacket.envelopes,
      durationMs,
      sampleRate,
      affinityProfile,
      rng,
    );
    diagnostics.push(...vDiag.map((d) => `VOICE[${v}]:${d}`));

    const gain = safeVoiceGain(voice.gain);
    const len = Math.min(voiceBuffer.length, durationSamples);
    for (let i = 0; i < len; i++) {
      mixed[i] += voiceBuffer[i] * gain;
    }
  }

  // 5. Apply EQ chain
  const effects = Array.isArray(safePacket.effects) ? safePacket.effects : [];
  const eqEffect = effects.find((fx) => fx.type === 'parametricEQ');
  if (eqEffect && Array.isArray(eqEffect.bands) && eqEffect.bands.length > 0) {
    const { output: eqOutput, diagnostics: eqDiag } = applyEqChain(mixed, eqEffect.bands, sampleRate);
    diagnostics.push(...eqDiag);
    mixed.set(eqOutput);
  }

  // 6. Apply soft clip
  const clipEffect = effects.find((fx) => fx.type === 'softClip');
  if (clipEffect) {
    const drive = Number.isFinite(clipEffect.drive) ? clipEffect.drive : 0.3;
    applySoftClip(mixed, drive);
  }

  // 7. NaN/Infinity sanitization pass
  const nanCount = sanitizeSamples(mixed);
  if (nanCount > 0) {
    diagnostics.push(`NAN_SAMPLES_ZEROED:${nanCount}`);
  }

  // 8. Peak-limit to [-1, 1] (scales down only, never amplifies)
  peakLimit(mixed);

  // 9. Analysis
  const peak = computePeak(mixed);
  const rms = computeRms(mixed);
  const checksum = computePacketChecksum(safePacket);

  return {
    ok: true,
    channelData: mixed,
    analysis: {
      peak,
      rms,
      durationSamples,
      sampleRate,
      checksum,
    },
    diagnostics,
  };
}

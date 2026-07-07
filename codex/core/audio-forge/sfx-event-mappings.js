/**
 * Audio Forge — SFX Event Mappings
 *
 * Game event → PB-SFX-v1 packet template library.
 * Each builder returns a partial packet that the SFX intent resolver
 * will hydrate with dynamic values (seed, affinity, checksum).
 *
 * Template builders are pure functions. No state. No side effects.
 *
 * CLASSIFICATION: core / pure / event-to-packet mapping
 * LAYER: codex/core — NO DOM, NO AudioContext, NO side effects.
 */

import {
  PB_SFX_VERSION,
  SFX_EVENT_TYPES,
  VOICE_TYPES,
  ENVELOPE_ROLES,
  NOISE_TYPES,
  ROUTING_BUSES,
  TRANSIENT_SURFACES,
} from './pb-sfx.schema.js';

// ─── Template Helpers ─────────────────────────────────────────────────────────

function base(eventType) {
  return {
    version:   PB_SFX_VERSION,
    eventType,
    // seed, id, affinity, checksum injected by intent resolver
  };
}

// ─── Leyline Extraction Success ───────────────────────────────────────────────

function buildLeylineSuccessPacket(eventData) {
  const stars = eventData?.stars ?? 1;
  const durationMs = 200 + stars * 80; // 1-star=280ms, 5-star=600ms
  const drive = Math.min(0.8, 0.2 + stars * 0.12);

  return {
    ...base(SFX_EVENT_TYPES.LEYLINE_EXTRACTION_SUCCESS),
    durationMs,
    synthesis: {
      voices: [
        {
          type: VOICE_TYPES.WAVETABLE,
          harmonics: [
            { partial: 1, amplitude: 1.0, phase: 0 },
            { partial: 2, amplitude: 0.5, phase: 0 },
            { partial: 3, amplitude: 0.25, phase: 0 },
            { partial: 5, amplitude: 0.12, phase: 0 },
          ],
          phaseWarp: 0.1,
          envelopeRole: ENVELOPE_ROLES.PLUCK,
          gain: 0.8,
        },
        {
          type: VOICE_TYPES.NOISE,
          noiseType: NOISE_TYPES.CRACKLE,
          envelopeRole: ENVELOPE_ROLES.BURST,
          gain: 0.15 + stars * 0.04,
        },
      ],
    },
    envelopes: {
      adsr: { attackMs: 2, decayMs: durationMs * 0.6, sustain: 0.0, releaseMs: durationMs * 0.4 },
    },
    effects: [
      { type: 'parametricEQ', bands: [
        { type: 'highpass', frequencyHz: 180, q: 0.7 },
        { type: 'peaking',  frequencyHz: 2000, q: 1.2, gainDb: 3 + stars },
      ]},
      { type: 'softClip', drive },
    ],
    routing: { bus: ROUTING_BUSES.MAGIC, pan: 0 },
  };
}

// ─── Leyline Extraction Failure ───────────────────────────────────────────────

function buildLeylineFailurePacket(_eventData) {
  return {
    ...base(SFX_EVENT_TYPES.LEYLINE_EXTRACTION_FAILURE),
    durationMs: 320,
    synthesis: {
      voices: [
        {
          type: VOICE_TYPES.FM,
          carrierFreq: 220,
          modFreq: 110,
          modIndex: 4,
          envelopeRole: ENVELOPE_ROLES.PLUCK,
          gain: 0.7,
        },
        {
          type: VOICE_TYPES.NOISE,
          noiseType: NOISE_TYPES.BROWN,
          envelopeRole: ENVELOPE_ROLES.BURST,
          gain: 0.2,
        },
      ],
    },
    envelopes: {
      adsr: { attackMs: 5, decayMs: 200, sustain: 0.0, releaseMs: 120 },
    },
    effects: [
      { type: 'parametricEQ', bands: [
        { type: 'lowpass',   frequencyHz: 600, q: 0.8 },
        { type: 'peaking',   frequencyHz: 300, q: 1.5, gainDb: -4 },
      ]},
      { type: 'softClip', drive: 0.5 },
    ],
    routing: { bus: ROUTING_BUSES.MAGIC, pan: 0 },
  };
}

// ─── CODEx Burst Stages ───────────────────────────────────────────────────────

function buildCodexBurstPacket(stage, eventType, _eventData) {
  const scale = stage / 5; // 0.2 – 1.0
  const durationMs = 100 + stage * 60;

  return {
    ...base(eventType),
    durationMs,
    synthesis: {
      voices: [
        {
          type: VOICE_TYPES.WAVETABLE,
          harmonics: [
            { partial: 1,      amplitude: 1.0,              phase: 0 },
            { partial: stage,  amplitude: 0.5 * scale,      phase: 0 },
            { partial: stage * 2, amplitude: 0.25 * scale,  phase: 0 },
          ],
          phaseWarp: scale * 0.3,
          envelopeRole: stage >= 4 ? ENVELOPE_ROLES.PLUCK : ENVELOPE_ROLES.BURST,
          gain: 0.6 + scale * 0.3,
        },
      ],
    },
    envelopes: {
      adsr: { attackMs: 1, decayMs: durationMs * 0.7, sustain: 0, releaseMs: durationMs * 0.3 },
    },
    effects: [
      { type: 'parametricEQ', bands: [
        { type: 'highpass',  frequencyHz: 400 - stage * 40, q: 1.0 },
        { type: 'highshelf', frequencyHz: 4000, q: 0.7, gainDb: stage * 1.5 },
      ]},
      { type: 'softClip', drive: 0.1 + scale * 0.4 },
    ],
    routing: { bus: ROUTING_BUSES.ORACLE, pan: 0 },
  };
}

// ─── Syntactical Chess Advantage ──────────────────────────────────────────────

function buildSyntaxChessPacket(_eventData) {
  return {
    ...base(SFX_EVENT_TYPES.SYNTACTICAL_CHESS_ADVANTAGE),
    durationMs: 250,
    synthesis: {
      voices: [
        {
          type: VOICE_TYPES.WAVETABLE,
          harmonics: [
            { partial: 1, amplitude: 1.0, phase: 0 },
            { partial: 4, amplitude: 0.3, phase: Math.PI / 4 },
            { partial: 7, amplitude: 0.15, phase: 0 },
          ],
          phaseWarp: 0.05,
          envelopeRole: ENVELOPE_ROLES.PLUCK,
          gain: 0.75,
        },
        {
          type: VOICE_TYPES.NOISE,
          noiseType: NOISE_TYPES.DUST,
          envelopeRole: ENVELOPE_ROLES.BURST,
          gain: 0.1,
        },
      ],
    },
    envelopes: {
      adsr: { attackMs: 3, decayMs: 180, sustain: 0.0, releaseMs: 70 },
    },
    effects: [
      { type: 'parametricEQ', bands: [
        { type: 'bandpass', frequencyHz: 2800, q: 1.4 },
      ]},
      { type: 'softClip', drive: 0.2 },
    ],
    routing: { bus: ROUTING_BUSES.COMBAT, pan: 0 },
  };
}

// ─── Oracle Marginalia ────────────────────────────────────────────────────────

function buildOraclePacket(_eventData) {
  return {
    ...base(SFX_EVENT_TYPES.ORACLE_MARGINALIA),
    durationMs: 800,
    synthesis: {
      voices: [
        {
          type: VOICE_TYPES.WAVETABLE,
          harmonics: [
            { partial: 1,   amplitude: 1.0,  phase: 0 },
            { partial: 1.5, amplitude: 0.4,  phase: Math.PI / 3 },
            { partial: 3,   amplitude: 0.2,  phase: 0 },
          ],
          phaseWarp: 0.2,
          envelopeRole: ENVELOPE_ROLES.ADSR,
          gain: 0.6,
        },
        {
          type: VOICE_TYPES.NOISE,
          noiseType: NOISE_TYPES.VOID_STATIC,
          envelopeRole: ENVELOPE_ROLES.ADSR,
          gain: 0.08,
        },
      ],
    },
    envelopes: {
      adsr: { attackMs: 80, decayMs: 200, sustain: 0.4, releaseMs: 520 },
    },
    effects: [
      { type: 'parametricEQ', bands: [
        { type: 'lowshelf',  frequencyHz: 200, q: 0.7, gainDb: -3 },
        { type: 'highshelf', frequencyHz: 8000, q: 0.7, gainDb: 2 },
      ]},
      { type: 'softClip', drive: 0.15 },
    ],
    routing: { bus: ROUTING_BUSES.ORACLE, pan: 0 },
  };
}

// ─── Nexus Unlock ─────────────────────────────────────────────────────────────

function buildNexusUnlockPacket(_eventData) {
  return {
    ...base(SFX_EVENT_TYPES.NEXUS_UNLOCK),
    durationMs: 1200,
    synthesis: {
      voices: [
        {
          type: VOICE_TYPES.WAVETABLE,
          harmonics: [
            { partial: 1,  amplitude: 1.0,  phase: 0 },
            { partial: 2,  amplitude: 0.6,  phase: 0 },
            { partial: 3,  amplitude: 0.4,  phase: 0 },
            { partial: 5,  amplitude: 0.25, phase: 0 },
            { partial: 8,  amplitude: 0.15, phase: 0 },
          ],
          phaseWarp: 0.15,
          envelopeRole: ENVELOPE_ROLES.ADSR,
          gain: 0.85,
        },
        {
          type: VOICE_TYPES.NOISE,
          noiseType: NOISE_TYPES.SPARK,
          envelopeRole: ENVELOPE_ROLES.BURST,
          gain: 0.25,
        },
      ],
    },
    envelopes: {
      adsr: { attackMs: 20, decayMs: 300, sustain: 0.6, releaseMs: 880 },
    },
    effects: [
      { type: 'parametricEQ', bands: [
        { type: 'highpass',  frequencyHz: 120, q: 0.7 },
        { type: 'peaking',   frequencyHz: 1200, q: 1.0, gainDb: 4 },
        { type: 'highshelf', frequencyHz: 6000, q: 0.7, gainDb: 3 },
      ]},
      { type: 'softClip', drive: 0.35 },
    ],
    routing: { bus: ROUTING_BUSES.NEXUS, pan: 0 },
  };
}

// ─── Locomotion ───────────────────────────────────────────────────────────────

const FOOTSTEP_SURFACE_MAP = Object.freeze({
  stone:   TRANSIENT_SURFACES.STONE,
  obsidian: TRANSIENT_SURFACES.STONE,
  voidsteel: TRANSIENT_SURFACES.METAL,
  void_ice: TRANSIENT_SURFACES.ICE,
  cyan_glow: TRANSIENT_SURFACES.SLATE,
  arcane_slate: TRANSIENT_SURFACES.SLATE,
  organic: TRANSIENT_SURFACES.ORGANIC,
});

function resolveFootstepSurface(eventData = {}) {
  const raw = String(eventData.surface ?? 'stone').toLowerCase();
  return FOOTSTEP_SURFACE_MAP[raw] ?? TRANSIENT_SURFACES.STONE;
}

function buildFootstepPacket(eventData = {}) {
  const surface = resolveFootstepSurface(eventData);
  return {
    ...base(SFX_EVENT_TYPES.FOOTSTEP),
    durationMs: 72,
    synthesis: {
      voices: [{
        type: VOICE_TYPES.TRANSIENT,
        surface,
        envelopeRole: ENVELOPE_ROLES.BURST,
        gain: eventData.reducedIntensity ? 0.18 : 0.28,
      }],
    },
    envelopes: {
      adsr: { attackMs: 1, decayMs: 55, sustain: 0, releaseMs: 16 },
    },
    effects: [
      { type: 'parametricEQ', bands: [
        { type: 'highpass', frequencyHz: 90, q: 0.7 },
        { type: 'lowpass', frequencyHz: 4200, q: 0.8 },
      ]},
      { type: 'softClip', drive: 0.12 },
    ],
    routing: { bus: ROUTING_BUSES.COMBAT, pan: eventData.pan ?? 0 },
  };
}

// ─── Spell / UI ───────────────────────────────────────────────────────────────

function buildSpellCastPacket(eventData = {}) {
  const intensity = eventData.reducedIntensity ? 0.55 : 1;
  return {
    ...base(SFX_EVENT_TYPES.SPELL_CAST),
    durationMs: Math.round(180 * intensity),
    synthesis: {
      voices: [
        {
          type: VOICE_TYPES.WAVETABLE,
          harmonics: [
            { partial: 1, amplitude: 1.0, phase: 0 },
            { partial: 2, amplitude: 0.35, phase: 0 },
            { partial: 3, amplitude: 0.18, phase: 0 },
          ],
          phaseWarp: 0.12,
          envelopeRole: ENVELOPE_ROLES.PLUCK,
          gain: 0.55 * intensity,
        },
        {
          type: VOICE_TYPES.NOISE,
          noiseType: NOISE_TYPES.DUST,
          envelopeRole: ENVELOPE_ROLES.BURST,
          gain: 0.08 * intensity,
        },
      ],
    },
    envelopes: {
      adsr: { attackMs: 2, decayMs: 120, sustain: 0, releaseMs: 58 },
    },
    effects: [
      { type: 'parametricEQ', bands: [
        { type: 'bandpass', frequencyHz: 1800, q: 1.1 },
      ]},
      { type: 'softClip', drive: 0.18 },
    ],
    routing: { bus: ROUTING_BUSES.MAGIC, pan: eventData.pan ?? 0 },
  };
}

function buildSpellHitPacket(eventData = {}) {
  const intensity = eventData.reducedIntensity ? 0.6 : 1;
  return {
    ...base(SFX_EVENT_TYPES.SPELL_HIT),
    durationMs: Math.round(140 * intensity),
    synthesis: {
      voices: [
        {
          type: VOICE_TYPES.TRANSIENT,
          surface: TRANSIENT_SURFACES.SLATE,
          envelopeRole: ENVELOPE_ROLES.BURST,
          gain: 0.42 * intensity,
        },
        {
          type: VOICE_TYPES.NOISE,
          noiseType: NOISE_TYPES.SPARK,
          envelopeRole: ENVELOPE_ROLES.BURST,
          gain: 0.12 * intensity,
        },
      ],
    },
    envelopes: {
      adsr: { attackMs: 1, decayMs: 90, sustain: 0, releaseMs: 49 },
    },
    effects: [
      { type: 'parametricEQ', bands: [
        { type: 'highpass', frequencyHz: 160, q: 0.8 },
        { type: 'peaking', frequencyHz: 2400, q: 1.2, gainDb: 3 },
      ]},
      { type: 'softClip', drive: 0.22 },
    ],
    routing: { bus: ROUTING_BUSES.MAGIC, pan: eventData.pan ?? 0 },
  };
}

function voidSpellVariantGain(eventData = {}, fallback = 1) {
  const variant = String(eventData.variant ?? 'default');
  if (variant === 'execution') return fallback * 1.15;
  if (variant === 'gravity') return fallback * 1.05;
  if (variant === 'lash') return fallback * 0.92;
  return fallback;
}

/** Dark sub-bass swell for Void1 VOID spell windups. */
function buildVoidSpellCastPacket(eventData = {}) {
  const gain = voidSpellVariantGain(eventData, eventData.reducedIntensity ? 0.72 : 1);
  return {
    ...base(SFX_EVENT_TYPES.VOID_SPELL_CAST),
    durationMs: Math.round(520 * gain),
    synthesis: {
      voices: [
        {
          type: VOICE_TYPES.WAVETABLE,
          harmonics: [
            { partial: 0.5, amplitude: 1.0, phase: 0 },
            { partial: 1, amplitude: 0.62, phase: 0 },
            { partial: 1.5, amplitude: 0.22, phase: Math.PI / 4 },
          ],
          phaseWarp: 0.42,
          envelopeRole: ENVELOPE_ROLES.ADSR,
          gain: 0.92 * gain,
        },
        {
          type: VOICE_TYPES.NOISE,
          noiseType: NOISE_TYPES.BROWN,
          envelopeRole: ENVELOPE_ROLES.ADSR,
          gain: 0.48 * gain,
        },
        {
          type: VOICE_TYPES.NOISE,
          noiseType: NOISE_TYPES.VOID_STATIC,
          envelopeRole: ENVELOPE_ROLES.ADSR,
          gain: 0.28 * gain,
        },
      ],
    },
    envelopes: {
      adsr: { attackMs: 55, decayMs: 320, sustain: 0.12, releaseMs: 420 },
    },
    effects: [
      { type: 'parametricEQ', bands: [
        { type: 'lowshelf', frequencyHz: 110, q: 0.7, gainDb: 10 },
        { type: 'lowpass', frequencyHz: 380, q: 0.85 },
      ]},
      { type: 'softClip', drive: 0.5 },
    ],
    routing: { bus: ROUTING_BUSES.MAGIC, pan: eventData.pan ?? 0 },
  };
}

/** Low hollow bass thump when a VOID spell connects. */
function buildVoidSpellHitPacket(eventData = {}) {
  const gain = voidSpellVariantGain(eventData, eventData.reducedIntensity ? 0.68 : 1);
  const execution = String(eventData.variant ?? '') === 'execution';
  return {
    ...base(SFX_EVENT_TYPES.VOID_SPELL_HIT),
    durationMs: Math.round((execution ? 360 : 240) * gain),
    synthesis: {
      voices: [
        {
          type: VOICE_TYPES.FM,
          carrierFreq: execution ? 58 : 72,
          modFreq: execution ? 29 : 36,
          modIndex: execution ? 6.5 : 4.8,
          envelopeRole: ENVELOPE_ROLES.BURST,
          gain: (execution ? 0.95 : 0.82) * gain,
        },
        {
          type: VOICE_TYPES.NOISE,
          noiseType: NOISE_TYPES.BROWN,
          envelopeRole: ENVELOPE_ROLES.BURST,
          gain: 0.55 * gain,
        },
        {
          type: VOICE_TYPES.NOISE,
          noiseType: NOISE_TYPES.VOID_STATIC,
          envelopeRole: ENVELOPE_ROLES.BURST,
          gain: 0.22 * gain,
        },
      ],
    },
    envelopes: {
      adsr: {
        attackMs: 2,
        decayMs: execution ? 220 : 150,
        sustain: 0,
        releaseMs: execution ? 120 : 78,
      },
    },
    effects: [
      { type: 'parametricEQ', bands: [
        { type: 'lowshelf', frequencyHz: 90, q: 0.8, gainDb: 12 },
        { type: 'lowpass', frequencyHz: execution ? 520 : 340, q: 0.9 },
      ]},
      { type: 'softClip', drive: execution ? 0.58 : 0.46 },
    ],
    routing: { bus: ROUTING_BUSES.MAGIC, pan: eventData.pan ?? 0 },
  };
}

function buildSpellFailPacket(_eventData = {}) {
  return {
    ...base(SFX_EVENT_TYPES.SPELL_FAIL),
    durationMs: 220,
    synthesis: {
      voices: [
        {
          type: VOICE_TYPES.FM,
          carrierFreq: 180,
          modFreq: 90,
          modIndex: 5,
          envelopeRole: ENVELOPE_ROLES.PLUCK,
          gain: 0.5,
        },
        {
          type: VOICE_TYPES.NOISE,
          noiseType: NOISE_TYPES.BROWN,
          envelopeRole: ENVELOPE_ROLES.BURST,
          gain: 0.15,
        },
      ],
    },
    envelopes: {
      adsr: { attackMs: 4, decayMs: 140, sustain: 0, releaseMs: 76 },
    },
    effects: [
      { type: 'parametricEQ', bands: [
        { type: 'lowpass', frequencyHz: 700, q: 0.9 },
      ]},
      { type: 'softClip', drive: 0.25 },
    ],
    routing: { bus: ROUTING_BUSES.MAGIC, pan: 0 },
  };
}

function buildUiConfirmPacket(_eventData = {}) {
  return {
    ...base(SFX_EVENT_TYPES.UI_CONFIRM),
    durationMs: 120,
    synthesis: {
      voices: [{
        type: VOICE_TYPES.WAVETABLE,
        harmonics: [
          { partial: 1, amplitude: 1.0, phase: 0 },
          { partial: 2, amplitude: 0.25, phase: 0 },
        ],
        phaseWarp: 0.04,
        envelopeRole: ENVELOPE_ROLES.PLUCK,
        gain: 0.45,
      }],
    },
    envelopes: {
      adsr: { attackMs: 1, decayMs: 70, sustain: 0, releaseMs: 49 },
    },
    effects: [{ type: 'softClip', drive: 0.1 }],
    routing: { bus: ROUTING_BUSES.UI, pan: 0 },
  };
}

function clamp01(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function buildObeliskChargePacket(eventData = {}) {
  const intensity = clamp01(eventData.intensity, 0.9);
  const durationMs = Math.round(125 + intensity * 40);

  return {
    ...base(SFX_EVENT_TYPES.OBELISK_CHARGE),
    durationMs,
    synthesis: {
      voices: [{
        type: VOICE_TYPES.ZAP,
        carrierFreq: 420 + intensity * 120,
        modFreq: 149 + intensity * 41,
        modIndex: 11 + intensity * 5,
        burstDensity: 0.1 + intensity * 0.06,
        burstDecayMs: 3.5,
        impact: 0.55 + intensity * 0.25,
        metallicMix: 0.58,
        snapMix: 0.72,
        envelopeRole: ENVELOPE_ROLES.BURST,
        gain: 0.82 + intensity * 0.18,
      }],
    },
    envelopes: {
      adsr: { attackMs: 0.05, decayMs: durationMs * 0.68, sustain: 0, releaseMs: durationMs * 0.25 },
    },
    effects: [
      { type: 'parametricEQ', bands: [
        { type: 'highpass', frequencyHz: 420, q: 0.8 },
        { type: 'peaking', frequencyHz: 2800, q: 2.2, gainDb: 6 },
      ]},
      { type: 'softClip', drive: 0.52 + intensity * 0.14 },
    ],
    routing: { bus: ROUTING_BUSES.MAGIC, pan: eventData.pan ?? 0 },
  };
}

function buildObeliskDischargePacket(eventData = {}) {
  const intensity = clamp01(eventData.intensity, 1);
  const durationMs = Math.round(280 + intensity * 80);

  return {
    ...base(SFX_EVENT_TYPES.OBELISK_DISCHARGE),
    durationMs,
    synthesis: {
      voices: [
        {
          type: VOICE_TYPES.ZAP,
          carrierFreq: 720 + intensity * 180,
          modFreq: 257 + intensity * 83,
          modIndex: 18 + intensity * 7,
          burstDensity: 0.22 + intensity * 0.1,
          burstDecayMs: 2.5,
          impact: 1,
          metallicMix: 0.62,
          snapMix: 0.95,
          envelopeRole: ENVELOPE_ROLES.BURST,
          gain: 1.12,
        },
        {
          type: VOICE_TYPES.TRANSIENT,
          surface: TRANSIENT_SURFACES.METAL,
          attackMs: 0.3,
          decayMs: 32,
          brightnessHz: 2600,
          bodyHz: 280,
          bodyMix: 0.12,
          noiseMix: 0.88,
          envelopeRole: ENVELOPE_ROLES.BURST,
          gain: 0.78,
        },
        {
          type: VOICE_TYPES.NOISE,
          noiseType: NOISE_TYPES.CRACKLE,
          envelopeRole: ENVELOPE_ROLES.BURST,
          gain: 0.42 + intensity * 0.12,
        },
      ],
    },
    envelopes: {
      adsr: { attackMs: 0.05, decayMs: durationMs * 0.52, sustain: 0, releaseMs: durationMs * 0.38 },
    },
    effects: [
      { type: 'parametricEQ', bands: [
        { type: 'highpass', frequencyHz: 380, q: 0.75 },
        { type: 'peaking', frequencyHz: 4200, q: 2.4, gainDb: 8 },
        { type: 'highshelf', frequencyHz: 7000, q: 0.7, gainDb: 4 },
      ]},
      { type: 'softClip', drive: 0.78 + intensity * 0.14 },
    ],
    routing: { bus: ROUTING_BUSES.MAGIC, pan: eventData.pan ?? 0 },
  };
}

function buildUiCancelPacket(_eventData = {}) {
  return {
    ...base(SFX_EVENT_TYPES.UI_CANCEL),
    durationMs: 150,
    synthesis: {
      voices: [{
        type: VOICE_TYPES.FM,
        carrierFreq: 260,
        modFreq: 130,
        modIndex: 2.5,
        envelopeRole: ENVELOPE_ROLES.PLUCK,
        gain: 0.35,
      }],
    },
    envelopes: {
      adsr: { attackMs: 2, decayMs: 90, sustain: 0, releaseMs: 58 },
    },
    effects: [{ type: 'softClip', drive: 0.12 }],
    routing: { bus: ROUTING_BUSES.UI, pan: 0 },
  };
}

// ─── Event Mapping Dispatcher ─────────────────────────────────────────────────

export const SFX_EVENT_MAPPINGS = Object.freeze({
  [SFX_EVENT_TYPES.LEYLINE_EXTRACTION_SUCCESS]:  buildLeylineSuccessPacket,
  [SFX_EVENT_TYPES.LEYLINE_EXTRACTION_FAILURE]:  buildLeylineFailurePacket,
  [SFX_EVENT_TYPES.CODEX_BURST_STAGE_1]: (d) => buildCodexBurstPacket(1, SFX_EVENT_TYPES.CODEX_BURST_STAGE_1, d),
  [SFX_EVENT_TYPES.CODEX_BURST_STAGE_2]: (d) => buildCodexBurstPacket(2, SFX_EVENT_TYPES.CODEX_BURST_STAGE_2, d),
  [SFX_EVENT_TYPES.CODEX_BURST_STAGE_3]: (d) => buildCodexBurstPacket(3, SFX_EVENT_TYPES.CODEX_BURST_STAGE_3, d),
  [SFX_EVENT_TYPES.CODEX_BURST_STAGE_4]: (d) => buildCodexBurstPacket(4, SFX_EVENT_TYPES.CODEX_BURST_STAGE_4, d),
  [SFX_EVENT_TYPES.CODEX_BURST_STAGE_5]: (d) => buildCodexBurstPacket(5, SFX_EVENT_TYPES.CODEX_BURST_STAGE_5, d),
  [SFX_EVENT_TYPES.SYNTACTICAL_CHESS_ADVANTAGE]: buildSyntaxChessPacket,
  [SFX_EVENT_TYPES.ORACLE_MARGINALIA]:           buildOraclePacket,
  [SFX_EVENT_TYPES.NEXUS_UNLOCK]:                buildNexusUnlockPacket,
  [SFX_EVENT_TYPES.FOOTSTEP]:                    buildFootstepPacket,
  [SFX_EVENT_TYPES.SPELL_CAST]:                  buildSpellCastPacket,
  [SFX_EVENT_TYPES.SPELL_HIT]:                   buildSpellHitPacket,
  [SFX_EVENT_TYPES.SPELL_FAIL]:                  buildSpellFailPacket,
  [SFX_EVENT_TYPES.UI_CONFIRM]:                  buildUiConfirmPacket,
  [SFX_EVENT_TYPES.UI_CANCEL]:                   buildUiCancelPacket,
  [SFX_EVENT_TYPES.OBELISK_CHARGE]:              buildObeliskChargePacket,
  [SFX_EVENT_TYPES.OBELISK_DISCHARGE]:           buildObeliskDischargePacket,
  [SFX_EVENT_TYPES.VOID_SPELL_CAST]:             buildVoidSpellCastPacket,
  [SFX_EVENT_TYPES.VOID_SPELL_HIT]:              buildVoidSpellHitPacket,
});

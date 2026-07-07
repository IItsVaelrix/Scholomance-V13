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

import { PB_SFX_VERSION, SFX_EVENT_TYPES, VOICE_TYPES, ENVELOPE_ROLES, NOISE_TYPES, ROUTING_BUSES } from './pb-sfx.schema.js';

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
});

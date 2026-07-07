/**
 * PB-SFX-v1 — PixelBrain SFX Packet Schema & Validation
 *
 * The source of truth for every deterministic sound event in Scholomance.
 * A packet is an immutable, serializable definition of a sound to be synthesized.
 * Same packet + same engine version = same rendered audio.
 *
 * CLASSIFICATION: core / pure / schema
 * LAYER: codex/core — NO DOM, NO AudioContext, NO side effects.
 * SCHEMA VERSION: PB-SFX-v1
 */

import { validateEqBands } from './dsp/parametric-eq.js';

// ─── Schema Version ───────────────────────────────────────────────────────────

export const PB_SFX_VERSION = 'PB-SFX-v1';

// ─── Affinities ───────────────────────────────────────────────────────────────

export const AFFINITIES = Object.freeze({
  ALCHEMY:  'ALCHEMY',
  PSYCHIC:  'PSYCHIC',
  VOID:     'VOID',
  LIGHT:    'LIGHT',
  CODEX:    'CODEX',
  SONIC:    'SONIC',
});

// ─── Event Types ──────────────────────────────────────────────────────────────

export const SFX_EVENT_TYPES = Object.freeze({
  LEYLINE_EXTRACTION_SUCCESS:  'LEYLINE_EXTRACTION_SUCCESS',
  LEYLINE_EXTRACTION_FAILURE:  'LEYLINE_EXTRACTION_FAILURE',
  CODEX_BURST_STAGE_1:         'CODEX_BURST_STAGE_1',
  CODEX_BURST_STAGE_2:         'CODEX_BURST_STAGE_2',
  CODEX_BURST_STAGE_3:         'CODEX_BURST_STAGE_3',
  CODEX_BURST_STAGE_4:         'CODEX_BURST_STAGE_4',
  CODEX_BURST_STAGE_5:         'CODEX_BURST_STAGE_5',
  SYNTACTICAL_CHESS_ADVANTAGE: 'SYNTACTICAL_CHESS_ADVANTAGE',
  ORACLE_MARGINALIA:           'ORACLE_MARGINALIA',
  NEXUS_UNLOCK:                'NEXUS_UNLOCK',
  FOOTSTEP:                    'FOOTSTEP',
  SPELL_CAST:                  'SPELL_CAST',
  SPELL_HIT:                   'SPELL_HIT',
  SPELL_FAIL:                  'SPELL_FAIL',
  UI_CONFIRM:                  'UI_CONFIRM',
  UI_CANCEL:                   'UI_CANCEL',
  OBELISK_CHARGE:              'OBELISK_CHARGE',
  OBELISK_DISCHARGE:           'OBELISK_DISCHARGE',
  VOID_SPELL_CAST:             'VOID_SPELL_CAST',
  VOID_SPELL_HIT:              'VOID_SPELL_HIT',
});

// ─── Voice Types ──────────────────────────────────────────────────────────────

export const VOICE_TYPES = Object.freeze({
  WAVETABLE: 'wavetable',
  NOISE:     'noise',
  FM:        'fm',
  ADDITIVE:  'additive',
  TRANSIENT: 'transient',
  ELECTRIC:  'electric',
  ZAP:       'zap',
});

/** Sample-and-hold routing for electric shock voices. */
export const ELECTRIC_SH_MODES = Object.freeze({
  AMPLITUDE: 'amplitude',
  CUTOFF:    'cutoff',
  BOTH:      'both',
});

/** Surface profiles for locomotion / impact events. */
export const TRANSIENT_SURFACES = Object.freeze({
  STONE:    'stone',
  ICE:      'ice',
  SLATE:    'slate',
  METAL:    'metal',
  ORGANIC:  'organic',
});

// ─── Noise Types ──────────────────────────────────────────────────────────────

export const NOISE_TYPES = Object.freeze({
  WHITE:       'white',
  PINK:        'pink',
  BROWN:       'brown',
  CRACKLE:     'crackle',
  DUST:        'dust',
  SPARK:       'spark',
  VOID_STATIC: 'void_static',
});

// ─── Envelope Roles ───────────────────────────────────────────────────────────

export const ENVELOPE_ROLES = Object.freeze({
  ADSR:  'adsr',
  PLUCK: 'pluck',
  BURST: 'burst',
});

// ─── Effect Types ─────────────────────────────────────────────────────────────

export const EFFECT_TYPES = Object.freeze({
  SOFT_CLIP:      'softClip',
  PARAMETRIC_EQ:  'parametricEQ',
  // Phase 2+: granular, convolution, spectral
});

// ─── Routing Bus Names ────────────────────────────────────────────────────────

export const ROUTING_BUSES = Object.freeze({
  COMBAT:   'combat',
  MAGIC:    'combat.magic',
  UI:       'ui',
  ORACLE:   'oracle',
  NEXUS:    'nexus',
  AMBIENCE: 'ambience',
  MASTER:   'master',
});

// ─── Duration Limits ──────────────────────────────────────────────────────────

const DURATION_MIN_MS = 10;
const DURATION_MAX_MS = 10000;

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates a PB-SFX-v1 packet.
 *
 * Returns { ok, errors[], warnings[] }.
 * errors[]   = fields that must be fixed before playback (packet is unplayable)
 * warnings[] = degraded fields where the engine will fall back gracefully
 *
 * @param {object} packet
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function validateSfxPacket(packet) {
  const errors = [];
  const warnings = [];

  if (!packet || typeof packet !== 'object') {
    return { ok: false, errors: ['PACKET_NULL_OR_NOT_OBJECT'], warnings };
  }

  // version
  if (packet.version !== PB_SFX_VERSION) {
    errors.push(`VERSION_MISMATCH: expected ${PB_SFX_VERSION}, got ${String(packet.version)}`);
  }

  // id
  if (typeof packet.id !== 'string' || packet.id.length === 0) {
    errors.push('ID_MISSING_OR_EMPTY');
  }

  // seed
  if (typeof packet.seed !== 'number' || !Number.isFinite(packet.seed)) {
    errors.push('SEED_INVALID: must be a finite number');
  }

  // eventType
  if (typeof packet.eventType !== 'string' || packet.eventType.length === 0) {
    errors.push('EVENT_TYPE_MISSING');
  }

  // durationMs
  if (typeof packet.durationMs !== 'number' || !Number.isFinite(packet.durationMs)) {
    errors.push('DURATION_INVALID: must be a finite number');
  } else if (packet.durationMs < DURATION_MIN_MS) {
    warnings.push(`DURATION_CLAMPED: ${packet.durationMs}ms below minimum ${DURATION_MIN_MS}ms`);
  } else if (packet.durationMs > DURATION_MAX_MS) {
    warnings.push(`DURATION_CLAMPED: ${packet.durationMs}ms above maximum ${DURATION_MAX_MS}ms`);
  }

  // affinity
  if (!Object.values(AFFINITIES).includes(packet.affinity)) {
    warnings.push(`AFFINITY_UNKNOWN:${String(packet.affinity)} — falling back to CODEX`);
  }

  // synthesis
  if (!packet.synthesis || typeof packet.synthesis !== 'object') {
    errors.push('SYNTHESIS_MISSING');
  } else {
    if (!Array.isArray(packet.synthesis.voices) || packet.synthesis.voices.length === 0) {
      errors.push('SYNTHESIS_VOICES_EMPTY: at least one voice required');
    } else {
      packet.synthesis.voices.forEach((voice, i) => {
        if (!Object.values(VOICE_TYPES).includes(voice.type)) {
          errors.push(`VOICE[${i}]_UNKNOWN_TYPE:${String(voice.type)}`);
        }
        if (typeof voice.gain !== 'number' || !Number.isFinite(voice.gain)) {
          warnings.push(`VOICE[${i}]_GAIN_INVALID: defaulting to 1.0`);
        }
        if (voice.type === VOICE_TYPES.WAVETABLE) {
          if (!Array.isArray(voice.harmonics) || voice.harmonics.length === 0) {
            warnings.push(`VOICE[${i}]_WAVETABLE_NO_HARMONICS: defaulting to fundamental`);
          }
        }
        if (voice.type === VOICE_TYPES.NOISE) {
          if (!Object.values(NOISE_TYPES).includes(voice.noiseType)) {
            warnings.push(`VOICE[${i}]_UNKNOWN_NOISE_TYPE:${String(voice.noiseType)} — defaulting to white`);
          }
        }
        if (voice.type === VOICE_TYPES.FM) {
          if (typeof voice.carrierFreq !== 'number' || !Number.isFinite(voice.carrierFreq)) {
            warnings.push(`VOICE[${i}]_FM_CARRIER_INVALID: defaulting to 440`);
          }
          if (typeof voice.modFreq !== 'number' || !Number.isFinite(voice.modFreq)) {
            warnings.push(`VOICE[${i}]_FM_MOD_INVALID: defaulting to 220`);
          }
        }
        if (voice.type === VOICE_TYPES.TRANSIENT) {
          if (voice.surface != null && !Object.values(TRANSIENT_SURFACES).includes(voice.surface)) {
            warnings.push(`VOICE[${i}]_TRANSIENT_SURFACE_UNKNOWN:${String(voice.surface)} — defaulting to stone`);
          }
        }
        if (voice.type === VOICE_TYPES.ELECTRIC) {
          if (voice.shMode != null && !Object.values(ELECTRIC_SH_MODES).includes(voice.shMode)) {
            warnings.push(`VOICE[${i}]_ELECTRIC_SH_MODE_UNKNOWN:${String(voice.shMode)} — defaulting to both`);
          }
          if (typeof voice.centerFreqHz !== 'number' || !Number.isFinite(voice.centerFreqHz)) {
            warnings.push(`VOICE[${i}]_ELECTRIC_CENTER_INVALID: defaulting to 2800 Hz`);
          }
          if (typeof voice.q !== 'number' || !Number.isFinite(voice.q)) {
            warnings.push(`VOICE[${i}]_ELECTRIC_Q_INVALID: defaulting to 16`);
          }
        }
        if (voice.type === VOICE_TYPES.ZAP) {
          if (typeof voice.carrierFreq !== 'number' || !Number.isFinite(voice.carrierFreq)) {
            warnings.push(`VOICE[${i}]_ZAP_CARRIER_INVALID: defaulting to 420 Hz`);
          }
          if (typeof voice.modIndex !== 'number' || !Number.isFinite(voice.modIndex)) {
            warnings.push(`VOICE[${i}]_ZAP_MOD_INDEX_INVALID: defaulting to 10`);
          }
        }
        if (!Object.values(ENVELOPE_ROLES).includes(voice.envelopeRole)) {
          warnings.push(`VOICE[${i}]_ENVELOPE_UNKNOWN:${String(voice.envelopeRole)} — defaulting to adsr`);
        }
      });
    }
  }

  // envelopes
  if (!packet.envelopes || typeof packet.envelopes !== 'object') {
    errors.push('ENVELOPES_MISSING');
  } else {
    if (!packet.envelopes.adsr || typeof packet.envelopes.adsr !== 'object') {
      warnings.push('ENVELOPES_ADSR_MISSING: using defaults');
    }
  }

  // effects (array, optional — empty is valid)
  if (!Array.isArray(packet.effects)) {
    warnings.push('EFFECTS_NOT_ARRAY: treating as empty');
  } else {
    packet.effects.forEach((fx, i) => {
      if (!fx || typeof fx !== 'object' || !Object.values(EFFECT_TYPES).includes(fx.type)) {
        warnings.push(`EFFECT[${i}]_UNSUPPORTED_IN_MVP:${String(fx?.type)} — skipped`);
        return;
      }
      // Surface malformed EQ bands at validation time. A band with a bad
      // frequency would otherwise zero the signal silently at render.
      if (fx.type === EFFECT_TYPES.PARAMETRIC_EQ) {
        const bandCheck = validateEqBands(fx.bands);
        bandCheck.errors.forEach((e) => warnings.push(`EFFECT[${i}]_EQ_BAND_DROPPED:${e}`));
        bandCheck.warnings.forEach((w) => warnings.push(`EFFECT[${i}]_EQ:${w}`));
      }
    });
  }

  // routing
  if (!packet.routing || typeof packet.routing !== 'object') {
    warnings.push('ROUTING_MISSING: using defaults');
  } else {
    if (!Object.values(ROUTING_BUSES).includes(packet.routing.bus)) {
      warnings.push(`ROUTING_BUS_UNKNOWN:${String(packet.routing.bus)} — defaulting to master`);
    }
    const pan = packet.routing.pan;
    if (pan !== undefined && (typeof pan !== 'number' || !Number.isFinite(pan) || pan < -1 || pan > 1)) {
      warnings.push(`ROUTING_PAN_INVALID:${pan} — defaulting to 0.0`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Clamps packet.durationMs to [DURATION_MIN_MS, DURATION_MAX_MS].
 * Returns a new packet object (does not mutate).
 *
 * @param {object} packet
 * @returns {object}
 */
export function clampPacketDuration(packet) {
  const clamped = Math.max(
    DURATION_MIN_MS,
    Math.min(DURATION_MAX_MS, packet.durationMs ?? DURATION_MIN_MS)
  );
  if (clamped === packet.durationMs) return packet;
  return { ...packet, durationMs: clamped };
}

/**
 * Resolves an unknown or missing affinity to CODEX.
 *
 * @param {string|undefined} affinity
 * @returns {string}
 */
export function resolveAffinity(affinity) {
  if (Object.values(AFFINITIES).includes(affinity)) return affinity;
  return AFFINITIES.CODEX;
}

/**
 * Returns safe voice gain (clamps to [0, 1], defaults to 1.0).
 *
 * @param {number|undefined} gain
 * @returns {number}
 */
export function safeVoiceGain(gain) {
  if (typeof gain !== 'number' || !Number.isFinite(gain)) return 1.0;
  return Math.max(0, Math.min(1, gain));
}

/**
 * Audio Forge — Intent Resolver
 *
 * Converts gameplay events into validated PB-SFX-v1 packets.
 * Bridges game state (affinity, battle seed, turn) to audio packets.
 *
 * LAYER: src/audio (browser adapter) — pure logic, no AudioContext needed.
 */

import { SFX_EVENT_MAPPINGS } from '../../codex/core/audio-forge/sfx-event-mappings.js';
import { validateSfxPacket, resolveAffinity, AFFINITIES } from '../../codex/core/audio-forge/pb-sfx.schema.js';
import { computePacketChecksum } from '../../codex/core/audio-forge/pb-sfx.checksum.js';
import { buildPacketSeedString, rngFromStringSeed } from '../../codex/core/audio-forge/dsp/seeded-rng-bridge.js';
import { hashString } from '../../codex/core/pixelbrain/shared.js';
import { createInvalidPacketError } from '../../codex/core/audio-forge/audio-bytecode-error.js';

// ─── Seed Builder ─────────────────────────────────────────────────────────────

/**
 * Derives a numeric seed from battle context + event type.
 * Deterministic: same input fields → same seed always.
 *
 * @param {string} eventType
 * @param {object} [context]
 * @returns {number} uint32 seed
 */
function deriveNumericSeed(eventType, context = {}) {
  const str = buildPacketSeedString({
    battleId:  context.battleId  ?? 'default',
    tile:      context.tile      ?? context.tx ?? 0,
    turn:      context.turn      ?? 0,
    eventType,
    stepIndex: context.stepIndex,
    surface:   context.surface,
    variant:   context.variant ?? context.pulseIndex,
  });
  return hashString(str) >>> 0;
}

// ─── Intent Resolver ──────────────────────────────────────────────────────────

/**
 * Resolves a game event type + payload into a validated PB-SFX-v1 packet.
 *
 * @param {string} eventType - One of SFX_EVENT_TYPES
 * @param {object} [eventData] - Gameplay payload (stars, affinity, battleId, tile, turn, etc.)
 * @returns {{ packet: object, warnings: string[] }}
 * @throws {BytecodeError} AUDIO_INVALID_PACKET if packet cannot be assembled
 */
export function resolveIntent(eventType, eventData = {}) {
  const warnings = [];

  // 1. Look up template builder
  const templateBuilder = SFX_EVENT_MAPPINGS[eventType];
  if (!templateBuilder) {
    warnings.push(`INTENT_RESOLVER:UNKNOWN_EVENT_TYPE:${eventType} — no template found`);
    // Return a minimal safe fallback packet rather than crash
    return resolveIntentFallback(eventType, eventData, warnings);
  }

  // 2. Build template
  const template = templateBuilder(eventData);

  // 3. Inject dynamic fields
  const affinity = resolveAffinity(eventData.affinity ?? eventData.school);
  if (!Object.values(AFFINITIES).includes(eventData.affinity ?? eventData.school)) {
    warnings.push(`INTENT_RESOLVER:AFFINITY_FALLBACK:CODEX for input "${eventData.affinity ?? eventData.school}"`);
  }

  const seed = deriveNumericSeed(eventType, eventData);
  const id = `${eventType}-${seed.toString(16).padStart(8, '0')}`;

  const packet = {
    ...template,
    id,
    seed,
    affinity,
  };

  // 4. Apply dynamic intensity scaling from eventData
  packet.durationMs = scaleDuration(packet.durationMs, eventData);

  // 5. Compute checksum AFTER all fields are final
  packet.checksum = computePacketChecksum(packet);

  // 6. Validate
  const validation = validateSfxPacket(packet);
  if (!validation.ok) {
    throw createInvalidPacketError(validation.errors, { eventType, eventData });
  }
  warnings.push(...validation.warnings);

  return { packet, warnings };
}

/**
 * Scales durationMs based on event intensity hints.
 * Clamps output to [50, 2000] ms for SFX (not ambient).
 *
 * @param {number} baseDurationMs
 * @param {object} eventData
 * @returns {number}
 */
function scaleDuration(baseDurationMs, eventData) {
  let duration = Number.isFinite(baseDurationMs) ? baseDurationMs : 300;
  if (eventData.reducedIntensity) {
    duration = duration * 0.65;
  }
  return Math.max(50, Math.min(2000, duration));
}

/**
 * Minimal safe fallback packet for unknown event types.
 *
 * @param {string} eventType
 * @param {object} eventData
 * @param {string[]} warnings
 * @returns {{ packet: object, warnings: string[] }}
 */
function resolveIntentFallback(eventType, eventData, warnings) {
  const { validateSfxPacket: _v, PB_SFX_VERSION, VOICE_TYPES, ENVELOPE_ROLES, ROUTING_BUSES } = {
    validateSfxPacket: null, // not needed here
    PB_SFX_VERSION: 'PB-SFX-v1',
    VOICE_TYPES: { NOISE: 'noise' },
    ENVELOPE_ROLES: { BURST: 'burst' },
    ROUTING_BUSES: { COMBAT: 'combat' },
  };

  const seed = deriveNumericSeed(eventType, eventData);
  const packet = {
    version: 'PB-SFX-v1',
    id: `FALLBACK-${eventType}-${seed.toString(16).padStart(8, '0')}`,
    seed,
    eventType,
    durationMs: 150,
    affinity: resolveAffinity(eventData.affinity),
    synthesis: {
      voices: [{
        type: 'noise',
        noiseType: 'white',
        envelopeRole: 'burst',
        gain: 0.3,
      }],
    },
    envelopes: { adsr: { attackMs: 2, decayMs: 100, sustain: 0, releaseMs: 50 } },
    effects: [{ type: 'softClip', drive: 0.2 }],
    routing: { bus: 'combat', pan: 0 },
  };

  packet.checksum = computePacketChecksum(packet);
  warnings.push(`INTENT_RESOLVER:FALLBACK_PACKET_USED for "${eventType}"`);
  return { packet, warnings };
}

import { SFX_EVENT_TYPES } from '../audio-forge/pb-sfx.schema.js';

export const EVENT_DOMAINS = Object.freeze({
  RUNTIME: 'runtime',
  PROGRESSION: 'progression',
  COMBAT_BRIDGE: 'combat_bridge',
  AMBIENT: 'ambient',
  SFX: 'sfx',
});

export const RUNTIME_EVENTS = Object.freeze({
  WORD_LOOKUP_REQUEST: 'ui:word_lookup_requested',
  WORD_LOOKUP_RESPONSE: 'runtime:word_lookup_result',
  WORD_LOOKUP_ERROR: 'runtime:word_lookup_error',
  COMBAT_ACTION_REQUEST: 'ui:combat_action_submitted',
  COMBAT_ACTION_RESPONSE: 'runtime:combat_action_result',
});

export const PROGRESSION_EVENTS = Object.freeze({
  LEVEL_UP: 'level-up',
  SCHOOL_UNLOCKED: 'school-unlocked',
  XP_GAINED: 'xp-gained',
  WORD_DISCOVERED: 'word-discovered',
});

export const COMBAT_BRIDGE_EVENTS = Object.freeze({
  STATE_UPDATE: 'state:update',
  ACTION_INSCRIBE: 'action:inscribe',
  PLAYER_ANIMATION_DONE: 'anim:player:done',
  GODOT_SPELL_IMPACT: 'godot_spell_impact',
  GODOT_SCENE_LOAD: 'godot_scene_load',
});

export const AMBIENT_EVENTS = Object.freeze({
  SELECT_SCHOOL: 'SELECT_SCHOOL',
  TUNE_COMPLETE: 'TUNE_COMPLETE',
  PLAY: 'PLAY',
  PAUSE: 'PAUSE',
  TRACK_ENDED: 'TRACK_ENDED',
  ERROR: 'ERROR',
  RESONANCE_LOADING: 'resonance-loading',
  RESONANCE_READY: 'resonance-ready',
  RESONANCE_TICK: 'resonance-tick',
  RESONANCE_UNAVAILABLE: 'resonance-unavailable',
  RESONANCE_ERROR: 'resonance-error',
});

function contract(domain, eventName, required = [], optional = []) {
  return Object.freeze({
    domain,
    eventName,
    required: Object.freeze([...required]),
    optional: Object.freeze([...optional]),
  });
}

const CONTRACTS = [
  contract(EVENT_DOMAINS.RUNTIME, RUNTIME_EVENTS.WORD_LOOKUP_REQUEST, ['word'], ['responseEvent', 'requestId']),
  contract(EVENT_DOMAINS.RUNTIME, RUNTIME_EVENTS.WORD_LOOKUP_RESPONSE, [], ['word', 'requestId', 'data', 'source']),
  contract(EVENT_DOMAINS.RUNTIME, RUNTIME_EVENTS.WORD_LOOKUP_ERROR, [], ['word', 'requestId', 'error', 'code']),
  contract(EVENT_DOMAINS.RUNTIME, RUNTIME_EVENTS.COMBAT_ACTION_REQUEST, [], ['responseEventName', 'action']),
  contract(EVENT_DOMAINS.RUNTIME, RUNTIME_EVENTS.COMBAT_ACTION_RESPONSE, [], ['result']),

  contract(EVENT_DOMAINS.PROGRESSION, PROGRESSION_EVENTS.LEVEL_UP, ['level'], ['previousLevel', 'xp']),
  contract(EVENT_DOMAINS.PROGRESSION, PROGRESSION_EVENTS.SCHOOL_UNLOCKED, ['schoolId'], ['school', 'xp']),
  contract(EVENT_DOMAINS.PROGRESSION, PROGRESSION_EVENTS.XP_GAINED, ['amount'], ['source']),
  contract(EVENT_DOMAINS.PROGRESSION, PROGRESSION_EVENTS.WORD_DISCOVERED, ['word'], ['schoolId', 'xp']),

  contract(EVENT_DOMAINS.COMBAT_BRIDGE, COMBAT_BRIDGE_EVENTS.STATE_UPDATE, [], ['state', 'snapshot']),
  contract(EVENT_DOMAINS.COMBAT_BRIDGE, COMBAT_BRIDGE_EVENTS.ACTION_INSCRIBE),
  contract(EVENT_DOMAINS.COMBAT_BRIDGE, COMBAT_BRIDGE_EVENTS.PLAYER_ANIMATION_DONE),
  contract(EVENT_DOMAINS.COMBAT_BRIDGE, COMBAT_BRIDGE_EVENTS.GODOT_SPELL_IMPACT, [], ['timeline']),
  contract(EVENT_DOMAINS.COMBAT_BRIDGE, COMBAT_BRIDGE_EVENTS.GODOT_SCENE_LOAD, [], ['scene']),

  ...Object.values(AMBIENT_EVENTS).map((eventName) => contract(EVENT_DOMAINS.AMBIENT, eventName)),
  ...Object.values(SFX_EVENT_TYPES).map((eventName) => contract(EVENT_DOMAINS.SFX, eventName)),
];

export const SCHOL_EVENT_MAP = Object.freeze(
  Object.fromEntries(CONTRACTS.map((entry) => [entry.eventName, entry]))
);

export function getEventContract(eventName) {
  return SCHOL_EVENT_MAP[String(eventName || '')] || null;
}

export function isKnownScholomanceEvent(eventName) {
  return Boolean(getEventContract(eventName));
}

export function validateEventPayload(eventName, payload = {}) {
  const contractEntry = getEventContract(eventName);
  if (!contractEntry) {
    return Object.freeze({
      ok: false,
      eventName: String(eventName || ''),
      code: 'UNKNOWN_EVENT',
      missing: Object.freeze([]),
    });
  }

  const subject = payload && typeof payload === 'object' ? payload : {};
  const missing = contractEntry.required.filter((field) => !(field in subject));

  return Object.freeze({
    ok: missing.length === 0,
    eventName: contractEntry.eventName,
    domain: contractEntry.domain,
    code: missing.length === 0 ? 'OK' : 'MISSING_REQUIRED',
    missing: Object.freeze(missing),
  });
}

export function createEventEnvelope(eventName, payload = {}, options = {}) {
  const contractEntry = getEventContract(eventName);

  return Object.freeze({
    contract: 'SCHOL-EVENT-v1',
    eventName: String(eventName || ''),
    domain: contractEntry?.domain || 'unknown',
    payload,
    traceId: options.traceId || null,
    source: options.source || null,
    timestampMs: Number.isFinite(options.timestampMs) ? options.timestampMs : null,
  });
}

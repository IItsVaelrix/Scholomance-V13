export const OVERLOAD_LEXEMES = Object.freeze([
  'bolt',
  'thunder',
  'arc',
  'surge',
  'resonate',
  'echo',
  'overload',
]);

export const SIPHON_LEXEMES = Object.freeze([
  'drain',
  'siphon',
  'hollow',
  'pull',
  'leech',
  'quiet',
  'consume',
  'electrical',
  'electric',
  'power',
  'obelisk',
]);

export const OVERLOAD_WEAVE_INTENTS = Object.freeze([
  'OFFENSIVE',
  'RESONATE',
  'SHATTER',
  'ECHO',
  'DETONATE',
]);

export const SIPHON_WEAVE_INTENTS = Object.freeze([
  'DISRUPTION',
  'DEFENSIVE',
  'HOLLOW',
  'DEPLETE',
  'SIPHON',
  'DRAIN',
  'LEECH',
]);

export const OVERLOAD_MODIFIERS = Object.freeze([
  'UTTER',
  'BURNING',
  'SUNDERED',
]);

export const SIPHON_MODIFIERS = Object.freeze([
  'SILENT',
  'DEEP',
]);

export const OBELISK_DISCOVERY_EVENTS = Object.freeze({
  OVERLOAD: 'DISCOVERY_OBELISK_OVERLOAD',
  SIPHON: 'DISCOVERY_OBELISK_SIPHON',
});

export const STORMHEART_ORB_ITEM_ID = 'item.stormheart-orb';

/** Center-screen discovery banner XP line when the obelisk puzzle resolves. */
export const OBELISK_DISCOVERY_FLASH_XP = 100;

/** One-time scholomance XP discovery ids for the obelisk tutorial loop. */
export const OBELISK_TUTORIAL_XP_UNIQUE_IDS = Object.freeze([
  'xp:obelisk:siphon',
  'xp:obelisk:overload',
  'xp:stormheart-orb',
]);

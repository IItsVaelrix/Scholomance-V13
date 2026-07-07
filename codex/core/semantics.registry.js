/**
 * Authoritative semantic law for spellweave and combat only.
 *
 * Spellweave grammar is intent-first: the weave names force (INTENT), not verb
 * predicates. Verse predicates remain for Syntax Chess / VerseIR; they are not
 * weave tokens. Higher-order interpretation such as metaphor, semantic fields,
 * archetypes, and register tension belongs on the VerseIR amplifier substrate.
 */

import { INTENTS } from './intent-classes.js';

export { INTENTS };

import {
  flattenWeaveIntentRegistry,
  formatIntentPath,
  getIntentClassTree,
  getIntentForest,
  listAllWeaveIntentTokens,
  listOctantsForClass,
  lookupWeaveIntent,
  resolveIntentPath,
  WEAVE_INTENT_FOREST,
} from './weave-intent-octree.js';

/**
 * Flat weave-intent registry (325 tokens) built from the per-class octrees.
 * School is resolved from the Verse (dominantSchool), not from the weave token.
 */
export const WEAVE_INTENTS = flattenWeaveIntentRegistry();

export {
  WEAVE_INTENT_FOREST,
  formatIntentPath,
  getIntentClassTree,
  getIntentForest,
  listAllWeaveIntentTokens,
  listOctantsForClass,
  lookupWeaveIntent,
  resolveIntentPath,
};

export const SEMANTIC_TIER_COUNT = 5;

export const PREDICATES = {
  // --- ALCHEMY (TRANSFORMATION/HEALING) ---
  MEND: { intent: INTENTS.HEALING, school: "ALCHEMY", power: 1.0 },
  PURGE: { intent: INTENTS.DISRUPTION, school: "ALCHEMY", power: 0.8 },
  TRANSMUTE: { intent: INTENTS.UTILITY, school: "ALCHEMY", power: 0.9 },
  IGNITE: { intent: INTENTS.OFFENSIVE, school: "ALCHEMY", power: 1.1 },

  // --- SONIC (VIBRATION/WAVES) ---
  ECHO: { intent: INTENTS.OFFENSIVE, school: "SONIC", power: 0.9 },
  RESONATE: { intent: INTENTS.OFFENSIVE, school: "SONIC", power: 1.2 },
  QUIET: { intent: INTENTS.DEFENSIVE, school: "SONIC", power: 1.0 },
  SHATTER: { intent: INTENTS.OFFENSIVE, school: "SONIC", power: 1.5 },

  // --- PSYCHIC (MIND/CONTROL) ---
  GAZE: { intent: INTENTS.UTILITY, school: "PSYCHIC", power: 0.7 },
  SCISSION: { intent: INTENTS.OFFENSIVE, school: "PSYCHIC", power: 1.3 },
  CALM: { intent: INTENTS.DEFENSIVE, school: "PSYCHIC", power: 1.0 },
  FEAR: { intent: INTENTS.DISRUPTION, school: "PSYCHIC", power: 1.1 },

  // --- VOID (ENTROPY/EMPTY) ---
  CONSUME: { intent: INTENTS.OFFENSIVE, school: "VOID", power: 1.4 },
  HOLLOW: { intent: INTENTS.DISRUPTION, school: "VOID", power: 1.2 },
  NULLIFY: { intent: INTENTS.DEFENSIVE, school: "VOID", power: 1.1 },

  // --- WILL (FORCE/REALITY) ---
  STRIKE: { intent: INTENTS.OFFENSIVE, school: "WILL", power: 1.2 },
  SHIELD: { intent: INTENTS.DEFENSIVE, school: "WILL", power: 1.3 },
  SURGE: { intent: INTENTS.UTILITY, school: "WILL", power: 1.1 }
};

export const OBJECTS = {
  SOUL: { category: "METAPHYSICAL", multiplier: 1.2 },
  FLESH: { category: "PHYSICAL", multiplier: 1.0 },
  MIND: { category: "MENTAL", multiplier: 1.1 },
  SINEW: { category: "PHYSICAL", multiplier: 1.0 },
  SPIRIT: { category: "METAPHYSICAL", multiplier: 1.2 },
  BLOOD: { category: "PHYSICAL", multiplier: 1.3 },
  STONE: { category: "ELEMENTAL", multiplier: 0.9 },
  AIR: { category: "ELEMENTAL", multiplier: 0.8 },
  FIRE: { category: "ELEMENTAL", multiplier: 1.1 },
  OBELISK: { category: "STRUCTURE", multiplier: 1.0 },
};

/**
 * MODIFIERS bind to the nearest predicate in their clause and scale its
 * delivery. `powerScale` multiplies weave resonance; `manner` is a semantic
 * tag downstream systems (status chains, animation cues) may bind to.
 */
export const MODIFIERS = {
  UTTER:    { powerScale: 1.25, manner: "ABSOLUTE" },
  SWIFT:    { powerScale: 1.08, manner: "HASTE" },
  TWICE:    { powerScale: 1.10, manner: "ECHO" },
  DEEP:     { powerScale: 1.15, manner: "PENETRATE" },
  SILENT:   { powerScale: 1.05, manner: "STEALTH" },
  BURNING:  { powerScale: 1.18, manner: "FLAME" },
  FROZEN:   { powerScale: 1.12, manner: "FROST" },
  SUNDERED: { powerScale: 1.20, manner: "REND" }
};

/**
 * CONNECTORS split the weave into clauses and set the chain discipline:
 * SIMULTANEOUS strikes land together, SEQUENCE combos escalate per link,
 * SUSTAINED trades immediate force for status pressure.
 */
export const CONNECTORS = {
  AND:   { chainType: "SIMULTANEOUS" },
  THEN:  { chainType: "SEQUENCE" },
  WHILE: { chainType: "SUSTAINED" }
};

const EMPTY_SCHOOL_REGISTRY = Object.freeze({});

/**
 * Per-school status chains. Shape matches the combat.profile consumer:
 * { [chainId]: { keywords: string[] } } — multi-word keywords legal, tier
 * escalation is driven by keyword corpus rarity + rarity ladder downstream.
 */
const SCHOOL_STATUS_CHAINS = Object.freeze({
  VOID: Object.freeze({
    HOLLOWING: Object.freeze({
      keywords: Object.freeze([
        'hollow', 'consume', 'devour', 'unmake', 'null', 'annihilate',
        'erase', 'empty vessel', 'void hunger', 'unbeing',
      ]),
    }),
  }),
  ALCHEMY: Object.freeze({
    TRANSMUTATION: Object.freeze({
      keywords: Object.freeze([
        'transmute', 'quicksilver', 'dissolve', 'calcine', 'ferment',
        'distill', 'leaden', 'golden ichor', 'philosopher stone', 'crucible',
      ]),
    }),
  }),
  SONIC: Object.freeze({
    RESONANCE: Object.freeze({
      keywords: Object.freeze([
        'resonate', 'overtone', 'harmonic', 'shatterpoint', 'tremor',
        'reverberate', 'crescendo', 'standing wave', 'sympathetic hum',
      ]),
    }),
  }),
  PSYCHIC: Object.freeze({
    DREAD: Object.freeze({
      keywords: Object.freeze([
        'dread', 'terror', 'whisper', 'paranoia', 'nightmare', 'phantasm',
        'mindworm', 'unravel the mind', 'creeping doubt',
      ]),
    }),
  }),
  WILL: Object.freeze({
    BULWARK: Object.freeze({
      keywords: Object.freeze([
        'bulwark', 'unyielding', 'adamant', 'bastion', 'aegis',
        'immovable', 'iron resolve', 'stand fast', 'unbroken line',
      ]),
    }),
  }),
});

function normalizeSchoolId(school) {
  return String(school || '').trim().toUpperCase();
}

export function normalizeSemanticKeyword(keyword) {
  return String(keyword || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getSemanticSchoolRegistry(school) {
  const normalizedSchool = normalizeSchoolId(school);
  if (!normalizedSchool) {
    return EMPTY_SCHOOL_REGISTRY;
  }

  // Missing registries still degrade to "no status chain" instead of
  // crashing the authoritative scorer.
  return SCHOOL_STATUS_CHAINS[normalizedSchool] || EMPTY_SCHOOL_REGISTRY;
}

export function getSemanticTierLabel(school, chainId, tier) {
  const normalizedSchool = normalizeSchoolId(school);
  const normalizedChain = String(chainId || '').trim().toUpperCase();
  const normalizedTier = Math.max(1, Number(tier) || 1);
  if (!normalizedSchool || !normalizedChain) return null;
  return `${normalizedSchool} ${normalizedChain} ${normalizedTier}`;
}

/**
 * Maps a word to a weave token (intent, object, modifier, connector).
 * Predicate verbs are excluded — spellweave is intent-based.
 * @param {string} word
 * @returns {Object|null}
 */
export function lookupWeaveToken(word) {
  const upper = word.toUpperCase();
  const weaveIntent = lookupWeaveIntent(upper);
  if (weaveIntent) {
    return {
      type: 'INTENT',
      token: upper,
      intent: weaveIntent.intent,
      intentClass: weaveIntent.intentClass,
      manner: weaveIntent.manner,
      powerScale: weaveIntent.powerScale,
      schoolAffinity: weaveIntent.schoolAffinity,
      path: weaveIntent.path,
      octantLabel: weaveIntent.octantLabel,
      description: weaveIntent.description,
    };
  }
  if (OBJECTS[upper]) return { type: 'OBJECT', ...OBJECTS[upper] };
  if (MODIFIERS[upper]) return { type: 'MODIFIER', ...MODIFIERS[upper] };
  if (CONNECTORS[upper]) return { type: 'CONNECTOR', ...CONNECTORS[upper] };
  return null;
}

/**
 * Maps a word to any semantic registry entry, including verse predicates.
 * @param {string} word
 * @returns {Object|null}
 */
export function lookupSemanticToken(word) {
  const upper = word.toUpperCase();
  if (PREDICATES[upper]) return { type: 'PREDICATE', ...PREDICATES[upper] };
  return lookupWeaveToken(word);
}

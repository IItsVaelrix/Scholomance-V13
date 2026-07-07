/**
 * Spellweave NLP Resolver
 *
 * Maps natural-language weave input to canonical registry tokens before
 * clause parsing. Registry hits win; synonyms and light inflection stripping
 * fill the gap for player-facing prose ("tear the flesh", "protect the soul").
 */

import {
  CONNECTORS,
  lookupWeaveToken,
  MODIFIERS,
  OBJECTS,
  PREDICATES,
} from './semantics.registry.js';
import { INTENTS } from './intent-classes.js';

/** @typedef {'registry'|'nlp'|'inflection'} WeaveLexemeSource */

/**
 * @typedef {Object} WeaveLexemeResolution
 * @property {string} original - Lowercase surface form from tokenize().
 * @property {string} token - Canonical uppercase weave token.
 * @property {WeaveLexemeSource} source
 */

const FILLER_TOKENS = new Set([
  'the', 'a', 'an', 'my', 'your', 'his', 'her', 'their', 'our', 'its',
  'of', 'for', 'from', 'into', 'through', 'upon', 'against', 'within',
  'this', 'that', 'these', 'those', 'to', 'at', 'on', 'in', 'by',
]);

/**
 * Intent-class roots and common player verbs mapped to canonical weave tokens.
 * Leaf-specific synonyms are listed first; broad class roots are the fallback.
 */
const LEXEME_SYNONYMS = Object.freeze({
  // ── Offensive ───────────────────────────────────────────────────────────
  attack: 'OFFENSIVE',
  assault: 'OFFENSIVE',
  harm: 'OFFENSIVE',
  hurt: 'OFFENSIVE',
  damage: 'OFFENSIVE',
  wound: 'OFFENSIVE',
  slay: 'OFFENSIVE',
  fight: 'OFFENSIVE',
  hit: 'STRIKE',
  batter: 'BATTER',
  tear: 'REND',
  rip: 'REND',
  shred: 'REND',
  slice: 'SLASH',
  cut: 'SLASH',
  cleave: 'CLEAVE',
  pierce: 'PIERCE',
  carve: 'CARVE',
  scorch: 'SCORCH',
  sear: 'SEAR',
  blaze: 'BLAZE',
  immolate: 'IMMOLATE',
  rot: 'ROT',
  wither: 'WITHER',
  corrode: 'CORRODE',
  acid: 'ACID',
  decay: 'DECAY',
  devour: 'DEVOUR',
  leech: 'LEECH',
  gnaw: 'GNAW',
  annihilate: 'ANNUL',
  barrage: 'BARRAGE',
  volley: 'VOLLEY',
  storm: 'STORM',
  flurry: 'FLURRY',

  // ── Defensive ───────────────────────────────────────────────────────────
  protect: 'SHIELD',
  defend: 'DEFENSIVE',
  guard: 'GUARD',
  block: 'SHIELD',
  cover: 'COVER',
  ward: 'WARDEN',
  fortify: 'FORTIFY',
  harden: 'HARDEN',
  brace: 'BRACE',
  absorb: 'ABSORB',
  soak: 'SOAK',
  cushion: 'CUSHION',
  reflect: 'REFLECT',
  deflect: 'DEFLECT',
  mirror: 'MIRROR',
  rebound: 'REBOUND',
  shelter: 'SHELTER',
  refuge: 'REFUGE',
  haven: 'HAVEN',
  anchor: 'ANCHOR',
  moor: 'MOOR',
  dissipate: 'DISSIPATE',
  scatter: 'SCATTER',
  fade: 'FADE',

  // ── Healing ─────────────────────────────────────────────────────────────
  heal: 'HEAL',
  cure: 'CURE',
  patch: 'PATCH',
  knit: 'KNIT',
  restore: 'RESTORE',
  repair: 'REPAIR',
  purify: 'PURIFY',
  cleanse: 'CLEANSE',
  wash: 'WASH',
  rinse: 'RINSE',
  regrow: 'REGROW',
  renew: 'RENEW',
  bloom: 'BLOOM',
  soothe: 'SOOTHE',
  ease: 'EASE',
  calm: 'CALM',
  balm: 'BALM',
  revive: 'REVIVE',
  rally: 'RALLY',
  rescue: 'RESCUE',
  stitch: 'STITCH',
  suture: 'SUTURE',
  infuse: 'INFUSE',
  imbue: 'IMBUE',
  nourish: 'NOURISH',
  sanctify: 'SANCTIFY',
  hallow: 'HALLOW',
  consecrate: 'CONSECRATE',

  // ── Utility ─────────────────────────────────────────────────────────────
  transmute: 'TRANSMUTE',
  transform: 'TRANSFORM',
  morph: 'MORPH',
  alter: 'ALTER',
  convert: 'CONVERT',
  change: 'CHANGE',
  reveal: 'REVEAL',
  expose: 'EXPOSE',
  unmask: 'UNMASK',
  glimpse: 'GLIMPSE',
  scan: 'SCAN',
  trap: 'TRAP',
  cage: 'CAGE',
  net: 'NET',
  grapple: 'GRAPPLE',
  summon: 'SUMMON',
  invoke: 'INVOKE',
  conjure: 'CONJURE',
  manifest: 'MANIFEST',
  raise: 'RAISE',
  push: 'PUSH',
  pull: 'PULL',
  lift: 'LIFT',
  warp: 'WARP',
  bend: 'BEND',
  port: 'PORT',
  amplify: 'AMPLIFY',
  boost: 'BOOST',
  magnify: 'MAGNIFY',
  intensify: 'INTENSIFY',
  scry: 'SCRY',
  peer: 'PEER',
  watch: 'WATCH',
  listen: 'LISTEN',
  seek: 'SEEK',
  find: 'FIND',
  locate: 'LOCATE',
  channel: 'CHANNEL',
  route: 'ROUTE',
  bridge: 'BRIDGE',
  conduct: 'CONDUCT',
  flow: 'FLOW',
  link: 'LINK',

  // ── Disruption ──────────────────────────────────────────────────────────
  disrupt: 'DISRUPTION',
  interrupt: 'DISRUPTION',
  silence: 'SILENCE',
  mute: 'MUTE',
  still: 'STILL',
  hush: 'HUSH',
  suppress: 'SUPPRESS',
  unravel: 'UNRAVEL',
  fray: 'FRAY',
  loosen: 'LOOSEN',
  dispel: 'DISPEL',
  banish: 'BANISH',
  strip: 'STRIP',
  cancel: 'CANCEL',
  nullify: 'NULL',
  terror: 'TERROR',
  panic: 'PANIC',
  haunt: 'HAUNT',
  confuse: 'CONFUSE',
  befuddle: 'BEFUDDLE',
  muddle: 'MUDDLE',
  fog: 'FOG',
  blur: 'BLUR',
  hollow: 'HOLLOW',
  empty: 'EMPTY',
  deplete: 'DEPLETE',
  sap: 'SAP',
  curse: 'CURSE',
  blight: 'BLIGHT',
  doom: 'DOOM',
  taint: 'TAINT',
  spoil: 'SPOIL',
  ruin: 'RUIN',
  sever: 'SEVER',
  split: 'SPLIT',
  divide: 'DIVIDE',
  isolate: 'ISOLATE',
  exile: 'EXILE',

  // ── Objects ─────────────────────────────────────────────────────────────
  body: 'FLESH',
  skin: 'FLESH',
  meat: 'FLESH',
  corpus: 'FLESH',
  psyche: 'MIND',
  brain: 'MIND',
  thoughts: 'MIND',
  thought: 'MIND',
  heart: 'BLOOD',
  lifeblood: 'BLOOD',
  ghost: 'SPIRIT',
  essence: 'SPIRIT',
  muscle: 'SINEW',
  tendon: 'SINEW',
  sinew: 'SINEW',
  rock: 'STONE',
  earth: 'STONE',
  granite: 'STONE',
  wind: 'AIR',
  breath: 'AIR',
  sky: 'AIR',
  flame: 'FIRE',
  inferno: 'FIRE',
  pillar: 'OBELISK',
  monument: 'OBELISK',
  tower: 'OBELISK',

  // ── Modifiers ───────────────────────────────────────────────────────────
  utterly: 'UTTER',
  absolute: 'UTTER',
  fully: 'UTTER',
  fast: 'SWIFT',
  quick: 'SWIFT',
  quickly: 'SWIFT',
  rapidly: 'SWIFT',
  haste: 'SWIFT',
  hastily: 'SWIFT',
  double: 'TWICE',
  deeply: 'DEEP',
  penetrating: 'DEEP',
  quietly: 'SILENT',
  stealthily: 'SILENT',
  fiery: 'BURNING',
  icy: 'FROZEN',
  frost: 'FROZEN',
  frozen: 'FROZEN',
  sunder: 'SUNDERED',
  broken: 'SUNDERED',

  // ── Connectors ──────────────────────────────────────────────────────────
  also: 'AND',
  plus: 'AND',
  next: 'THEN',
  after: 'THEN',
  during: 'WHILE',
  as: 'WHILE',
});

const PREDICATE_TO_WEAVE = Object.freeze(
  Object.fromEntries(
    Object.entries(PREDICATES).map(([token, meta]) => {
      const upper = token.toUpperCase();
      if (lookupWeaveToken(upper)) return [token.toLowerCase(), upper];
      const classRoot = String(meta?.intent || '').toUpperCase();
      return [token.toLowerCase(), INTENTS[classRoot] ? classRoot : upper];
    }),
  ),
);

const SYNONYM_INDEX = buildSynonymIndex();

function buildSynonymIndex() {
  const index = new Map();

  const register = (surface, canonical) => {
    const key = normalizeSurface(surface);
    if (!key || FILLER_TOKENS.has(key)) return;
    const token = String(canonical || '').trim().toUpperCase();
    if (!token || !lookupWeaveToken(token)) return;
    if (!index.has(key)) {
      index.set(key, token);
    }
  };

  Object.entries(LEXEME_SYNONYMS).forEach(([surface, canonical]) => register(surface, canonical));
  Object.entries(PREDICATE_TO_WEAVE).forEach(([surface, canonical]) => register(surface, canonical));
  Object.keys(OBJECTS).forEach((token) => register(token.toLowerCase(), token));
  Object.keys(MODIFIERS).forEach((token) => register(token.toLowerCase(), token));
  Object.keys(CONNECTORS).forEach((token) => register(token.toLowerCase(), token));

  return Object.freeze(index);
}

function normalizeSurface(word) {
  return String(word || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9'-]/g, '');
}

function inflectionVariants(word) {
  const base = normalizeSurface(word);
  if (!base || base.length < 3) return [];

  const variants = new Set();
  if (base.endsWith('ies') && base.length > 4) {
    variants.add(`${base.slice(0, -3)}y`);
  }
  if (base.endsWith('ly') && base.length > 4) {
    variants.add(base.slice(0, -2));
    if (base.endsWith('ily')) variants.add(`${base.slice(0, -3)}y`);
  }
  if (base.endsWith('ing') && base.length > 5) {
    variants.add(base.slice(0, -3));
    if (base.endsWith('ying')) variants.add(`${base.slice(0, -4)}y`);
    if (base.endsWith('ling')) variants.add(`${base.slice(0, -3)}e`);
  }
  if (base.endsWith('ed') && base.length > 4) {
    variants.add(base.slice(0, -2));
    if (base.endsWith('ied')) variants.add(`${base.slice(0, -3)}y`);
  }
  if (base.endsWith('es') && base.length > 4) {
    variants.add(base.slice(0, -2));
  }
  if (base.endsWith('s') && base.length > 3 && !base.endsWith('ss')) {
    variants.add(base.slice(0, -1));
  }

  return [...variants];
}

/**
 * Resolve one weave surface form to a canonical registry token.
 * @param {string} word
 * @returns {WeaveLexemeResolution|null}
 */
export function resolveWeaveLexeme(word) {
  const original = normalizeSurface(word);
  if (!original) return null;
  if (FILLER_TOKENS.has(original)) return null;

  const direct = original.toUpperCase();
  if (lookupWeaveToken(direct)) {
    return { original, token: direct, source: 'registry' };
  }

  const synonym = SYNONYM_INDEX.get(original);
  if (synonym) {
    return { original, token: synonym, source: 'nlp' };
  }

  for (const variant of inflectionVariants(original)) {
    const registryHit = variant.toUpperCase();
    if (lookupWeaveToken(registryHit)) {
      return { original, token: registryHit, source: 'inflection' };
    }
    const variantSynonym = SYNONYM_INDEX.get(variant);
    if (variantSynonym) {
      return { original, token: variantSynonym, source: 'inflection' };
    }
  }

  return null;
}

/**
 * Normalize tokenized weave words to canonical registry tokens.
 * @param {string[]} words
 * @returns {{ tokens: string[], resolutions: WeaveLexemeResolution[] }}
 */
export function normalizeWeaveTokens(words) {
  const tokens = [];
  const resolutions = [];

  (Array.isArray(words) ? words : []).forEach((word) => {
    const original = normalizeSurface(word);
    if (!original) return;
    if (FILLER_TOKENS.has(original)) return;

    const resolved = resolveWeaveLexeme(original);
    if (resolved) {
      tokens.push(resolved.token);
      if (resolved.source !== 'registry') {
        resolutions.push(resolved);
      }
    }
  });

  return { tokens, resolutions };
}

/**
 * Rewrite weave prose into a canonical token stream (for debugging / counsel).
 * @param {string} weave
 * @param {function(string): string[]} tokenizeFn
 * @returns {{ canonicalWeave: string, resolutions: WeaveLexemeResolution[] }}
 */
export function canonicalizeWeaveText(weave, tokenizeFn) {
  const words = tokenizeFn(weave);
  const { tokens, resolutions } = normalizeWeaveTokens(words);
  return {
    canonicalWeave: tokens.join(' ').toLowerCase(),
    resolutions,
  };
}

export { FILLER_TOKENS as WEAVE_FILLER_TOKENS };
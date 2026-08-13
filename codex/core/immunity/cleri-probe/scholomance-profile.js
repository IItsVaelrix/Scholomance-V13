/**
 * Cleri Probe Scholomance classification profile.
 *
 * The single place where "what counts as deterministic authority", "what counts
 * as UI atmosphere", and the approved adapter allow-lists are declared. Verifiers
 * consume this profile; they never invent their own classification.
 *
 * Pure core module: no process, fs, os, performance, or network access.
 */

import { deepFreeze } from './contracts.js';

export const PROFILE_VERSION = '1.0.0';

// ─── Path classification ─────────────────────────────────────────────────────

const TEST_PATH_RE = /(^|\/)(tests?|__tests__|__mocks__|spec|e2e|benchmarks?)(\/|$)|\.(test|spec|bench)\.[cm]?[jt]sx?$/i;
const DOC_PATH_RE = /(^|\/)(docs?|documentation|examples?|stories)(\/|$)|\.(md|mdx|stories\.[jt]sx?)$/i;
const LAB_PATH_RE = /(^|\/)(scripts\/labs|scratch|sandbox|playground)(\/|$)/i;

const UI_ATMOSPHERE_PATH_RE =
  /(^|\/)(effects?|atmosphere|particles?|shaders?|animations?|visuals?|decor|ambience|ambient|cosmetics?)(\/|$)/i;

const DETERMINISTIC_PATH_RE =
  /(^|\/)(game|combat|engine|simulation|sim|economy|loot|codex\/core|core\/immunity|physics|scoring|rules)(\/|$)/i;

// ─── Symbol classification ───────────────────────────────────────────────────

// Names that assert an authoritative, reproducible outcome.
const DETERMINISTIC_SYMBOL_RE =
  /(damage|combat|attack|defen[cs]e|dodge|crit|loot|drop|reward|score|balance|econom|price|seed|hash|checksum|simulat|resolv|calculat|comput|derive|roll|tick|schedul|shuffle|deal|spawnrate)/i;

// Names whose randomness is decorative: the outcome is already decided.
const UI_ATMOSPHERE_SYMBOL_RE =
  /(jitter|spark|particle|glow|shimmer|flicker|twinkle|wobble|sway|drift|bloom|ember|dust|sparkle|ripple|glitter|confetti|animate|tween|easing|atmosphere|ambient|decor|cosmetic|idlebreath|parallax)/i;

/**
 * Classifies a repository-relative path.
 *
 * @param {string} path
 * @returns {{isTest: boolean, isDocumentation: boolean, isLaboratory: boolean,
 *            isUiAtmosphere: boolean, isDeterministicAuthority: boolean}}
 */
export function classifyPath(path) {
  const value = String(path ?? '');
  return deepFreeze({
    isTest: TEST_PATH_RE.test(value),
    isDocumentation: DOC_PATH_RE.test(value),
    isLaboratory: LAB_PATH_RE.test(value),
    isUiAtmosphere: UI_ATMOSPHERE_PATH_RE.test(value),
    isDeterministicAuthority: DETERMINISTIC_PATH_RE.test(value)
  });
}

/**
 * Classifies a symbol (function or method name).
 *
 * @param {string|null} symbol
 * @returns {{isUiAtmosphere: boolean, isDeterministicAuthority: boolean}}
 */
export function classifySymbol(symbol) {
  const value = String(symbol ?? '');
  // UI atmosphere wins: a decorative symbol inside a deterministic module is
  // still decorative (playHitSpark inside combat/damage.js).
  const isUiAtmosphere = value.length > 0 && UI_ATMOSPHERE_SYMBOL_RE.test(value);
  return deepFreeze({
    isUiAtmosphere,
    isDeterministicAuthority:
      !isUiAtmosphere && value.length > 0 && DETERMINISTIC_SYMBOL_RE.test(value)
  });
}

// ─── Approved adapter allow-lists ────────────────────────────────────────────

const SEEDED_RNG_SYMBOL_RE = /(seeded|seedrandom|seed_?rng|mulberry|xorshift|xoshiro|pcg|alea|prng|deterministicrandom)/i;
const SEEDED_RNG_MODULE_RE = /(seedrandom|rng-seed|seeded-rng|pure-rand|random-seed|chance)/i;

export function isSeededRandomSymbol(name) {
  return SEEDED_RNG_SYMBOL_RE.test(String(name ?? ''));
}

export function isSeededRandomModule(source) {
  return SEEDED_RNG_MODULE_RE.test(String(source ?? ''));
}

const LOGGING_CALLEE_RE = /^(console\.\w+|logger?\.\w+|log|warn|debug|trace|report(To\w+)?|captureException|captureMessage|track(Error|Event)?|Sentry\.\w+|telemetry\.\w+|metrics\.\w+)$/i;

/** A call that only observes the error: logging, telemetry, crash reporting. */
export function isLoggingOnlyCallee(callee) {
  return LOGGING_CALLEE_RE.test(String(callee ?? ''));
}

const RECOVERY_ADAPTER_RE = /(retry|backoff|fallback|recover|reconnect|requeue|rollback|compensate|degrade|circuitbreaker|withretries)/i;

/** A call that actually performs recovery rather than discarding the error. */
export function isRecoveryAdapterCallee(callee) {
  return RECOVERY_ADAPTER_RE.test(String(callee ?? ''));
}

/**
 * Keys that make a catch-clause return an explicit, documented fallback rather
 * than a silent one. A bare `return null` is not recovery; `return { ok: false,
 * error }` is.
 */
export const RECOVERY_RETURN_KEYS = deepFreeze([
  'code',
  'error',
  'errors',
  'failed',
  'fallback',
  'ok',
  'reason',
  'status',
  'success'
]);

const SCHEMA_VALIDATOR_RE = /(^|\.)(parse|safeParse|validate|assert|decode|check)$/;
const SCHEMA_LIBRARY_RE = /(zod|yup|joi|ajv|superstruct|valibot|io-ts|schema)/i;

/**
 * True when a call validates an external payload against a schema.
 * Requires both a validating method and a schema-shaped receiver so that a bare
 * `JSON.parse` is not mistaken for validation.
 */
export function isSchemaValidationCall(callee) {
  const value = String(callee ?? '');
  if (value === 'JSON.parse') return false;
  // safeParse has no meaning outside schema validation, so it needs no receiver.
  if (/(^|\.)safeParse$/.test(value)) return true;
  return SCHEMA_VALIDATOR_RE.test(value) && SCHEMA_LIBRARY_RE.test(value);
}

const NORMALIZATION_ADAPTER_RE = /(normali[sz]e|sanitiz|coerce|toDomain|fromApi|fromDto|mapResponse|adaptResponse|deserialize)/i;

export function isNormalizationAdapterCallee(callee) {
  return NORMALIZATION_ADAPTER_RE.test(String(callee ?? ''));
}

const SYNCHRONIZATION_ADAPTER_RE = /(mutex|semaphore|withlock|acquirelock|critical(section)?|serialize|queue\.(add|push)|atomic)/i;

export function isSynchronizationAdapterCallee(callee) {
  return SYNCHRONIZATION_ADAPTER_RE.test(String(callee ?? ''));
}

// ─── External clients ────────────────────────────────────────────────────────

/** v1 supports global fetch and imported axios identifiers only. */
export const SUPPORTED_EXTERNAL_CLIENTS = deepFreeze(['axios', 'fetch']);

export function isSupportedExternalClient(client) {
  return SUPPORTED_EXTERNAL_CLIENTS.includes(String(client ?? ''));
}

/** Response methods that turn an HTTP response into a domain payload. */
export const PAYLOAD_ACCESSORS = deepFreeze(['json', 'text', 'data']);

/** Response properties that carry transport status, not payload. */
export const STATUS_PROPERTIES = deepFreeze(['ok', 'status', 'statusText']);

// ─── Listener lifecycle vocabulary ───────────────────────────────────────────

export const REGISTRATION_METHODS = deepFreeze([
  'addEventListener',
  'addListener',
  'addObserver',
  'on',
  'subscribe'
]);

export const REMOVAL_METHODS = deepFreeze([
  'off',
  'removeEventListener',
  'removeListener',
  'removeObserver',
  'unsubscribe'
]);

/** Registrations that terminate on their own and cannot leak. */
export const SELF_TERMINATING_METHODS = deepFreeze(['once']);

export function isRegistrationMethod(name) {
  return REGISTRATION_METHODS.includes(String(name ?? ''));
}

export function isRemovalMethod(name) {
  return REMOVAL_METHODS.includes(String(name ?? ''));
}

// ─── Concurrency vocabulary ──────────────────────────────────────────────────

/** Primitives whose callbacks may interleave. Sequential loops are excluded. */
export const CONCURRENT_PRIMITIVES = deepFreeze(['Promise.all', 'Promise.allSettled']);

export function isConcurrentPrimitive(primitive) {
  return CONCURRENT_PRIMITIVES.includes(String(primitive ?? ''));
}

/** Iteration methods that make a callback run more than once. */
export const REPEATING_ITERATORS = deepFreeze(['filter', 'flatMap', 'forEach', 'map']);

// ─── Immune annotations ──────────────────────────────────────────────────────

/**
 * An operator may waive a pathology class on the adjacent line with
 * `IMMUNE_ALLOW: <token>`. The token is fixed per pathology class so that a
 * blanket waiver cannot silence every verifier at once.
 */
export const IMMUNE_ALLOW_TOKENS = deepFreeze({
  UNSEEDED_RANDOMNESS: 'math-random',
  LEAKED_LISTENER_SUBSCRIPTION: 'listener-lifecycle',
  SWALLOWED_ERROR: 'swallowed-error',
  UNSAFE_EXTERNAL_RESPONSE_ACCESS: 'external-response',
  CONCURRENT_SHARED_STATE_MUTATION: 'concurrent-mutation',
  EMPTY_COLLECTION_TRUTHINESS: 'empty-collection-truthiness'
});

const ANNOTATION_PROXIMITY_LINES = 1;

/**
 * True when an approved `IMMUNE_ALLOW: <token>` comment sits on, or immediately
 * above, the reported line.
 *
 * @param {Array<{value: string, startLine: number, endLine: number}>} comments
 * @param {string} pathologyClass
 * @param {number} line - one-based line of the finding.
 */
export function hasApprovedImmuneAllow(comments, pathologyClass, line) {
  const token = IMMUNE_ALLOW_TOKENS[String(pathologyClass)];
  if (!token || !Array.isArray(comments)) return false;
  const target = Number(line);
  if (!Number.isFinite(target)) return false;

  return comments.some(comment => {
    if (!comment || typeof comment.value !== 'string') return false;
    if (!comment.value.includes(`IMMUNE_ALLOW: ${token}`)) return false;
    const start = Number(comment.startLine);
    const end = Number(comment.endLine);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    return start >= target - ANNOTATION_PROXIMITY_LINES && start <= target + ANNOTATION_PROXIMITY_LINES ||
      (end >= target - ANNOTATION_PROXIMITY_LINES && end <= target + ANNOTATION_PROXIMITY_LINES);
  });
}

/**
 * Cleri Probe deterministic investigation planner.
 *
 * Maps a free-form listener hypothesis to a visible, deterministic plan
 * using the canonical pathology lexicon. No vector inference: unsupported
 * hypotheses are reported as inconclusive before any scanning occurs.
 */

import { deepFreeze, normalizeRepositoryPath } from './contracts.js';

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Normalizes free-form text for deterministic matching.
 *
 * - Lowercases.
 * - Decomposes Unicode (NFKD) and strips combining marks.
 * - Replaces punctuation and non-alphanumeric tokens with a single space.
 * - Collapses whitespace.
 */
function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// ─── Canonical pathology lexicon ─────────────────────────────────────────────

export const DEFAULT_PATHOLOGY_PROFILE = deepFreeze({
  profileId: 'scholomance/default',
  version: '1.0.0',
  pathologies: [
    {
      pathologyClass: 'LEAKED_LISTENER_SUBSCRIPTION',
      verifierId: 'listener-lifecycle/v1',
      terms: ['event listener', 'listener leak', 'subscription leak', 'useeffect cleanup'],
      counterchecks: ['MATCHING_EFFECT_CLEANUP', 'CAPTURED_UNSUBSCRIBE']
    },
    {
      pathologyClass: 'UNSEEDED_RANDOMNESS',
      verifierId: 'unseeded-randomness/v1',
      terms: ['math random', 'unseeded random', 'non deterministic random'],
      counterchecks: ['NO_SEEDED_RNG_ADAPTER', 'SEED_INJECTED']
    },
    {
      pathologyClass: 'SWALLOWED_ERROR',
      verifierId: 'swallowed-error/v1',
      terms: ['swallowed error', 'swallow error', 'silent failure', 'empty catch', 'catch block', 'error is ignored'],
      counterchecks: ['APPROVED_RECOVERY_RETURN', 'ERROR_RETHROWN']
    },
    {
      pathologyClass: 'UNSAFE_EXTERNAL_RESPONSE_ACCESS',
      verifierId: 'external-response/v1',
      terms: ['unsafe external response', 'unguarded response', 'api response', 'fetch response', 'response data', 'axios response'],
      counterchecks: ['HTTP_STATUS_GUARDED', 'PAYLOAD_SCHEMA_PARSED']
    },
    {
      pathologyClass: 'CONCURRENT_SHARED_STATE_MUTATION',
      verifierId: 'concurrent-mutation/v1',
      terms: ['race condition', 'concurrent mutation', 'promise all', 'parallel mutation', 'concurrent writes'],
      counterchecks: ['APPROVED_SYNCHRONIZATION_ADAPTER', 'TARGET_IS_CALLBACK_LOCAL']
    },
    {
      pathologyClass: 'EMPTY_COLLECTION_TRUTHINESS',
      verifierId: 'empty-collection-truthiness/v1',
      terms: [
        'empty array',
        'empty collection',
        'empty list',
        'empty result',
        'empty map',
        'truthy empty',
        'is always truthy'
      ],
      counterchecks: ['SIZE_READ_IN_SAME_GUARD', 'GUARD_IS_A_NULLISH_BAILOUT']
    },
    {
      pathologyClass: 'NON_DETERMINISTIC_DATETIME',
      verifierId: 'datetime-lifecycle/v1',
      terms: ['new date', 'date now', 'performance now', 'current time'],
      counterchecks: ['CLOCK_SOURCE_IS_PARAMETERIZED', 'TIME_IS_FROZEN_IN_TEST']
    },
    {
      pathologyClass: 'MUTABLE_SHARED_STATE',
      verifierId: 'shared-state-lifecycle/v1',
      terms: ['global variable', 'shared state', 'mutable singleton', 'module level state'],
      counterchecks: ['STATE_IS_IMMUTABLE', 'STATE_IS_ISOLATED']
    },
    {
      pathologyClass: 'HARDCODED_SECRET',
      verifierId: 'secret-lifecycle/v1',
      terms: ['api key', 'password', 'secret', 'token hardcoded', 'private key'],
      counterchecks: ['SECRET_IS_ENVIRONMENT_DRIVEN', 'SECRET_IS_VAULTED']
    }
  ]
});

// ─── Plan compilation ────────────────────────────────────────────────────────

/**
 * Compiles a deterministic investigation plan from a hypothesis.
 *
 * @param {string} hypothesis - Free-form listener hypothesis.
 * @param {object} options - Planning options.
 * @param {string[]} [options.paths] - Repository-relative scope paths.
 * @returns {object} Frozen, sorted plan.
 */
export function compileInvestigationPlan(hypothesis, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const normalizedHypothesis = normalizeText(hypothesis);

  const matched = DEFAULT_PATHOLOGY_PROFILE.pathologies.filter(pathology =>
    pathology.terms.some(term => normalizedHypothesis.includes(term))
  );

  if (matched.length === 0) {
    return deepFreeze({
      profileId: DEFAULT_PATHOLOGY_PROFILE.profileId,
      version: DEFAULT_PATHOLOGY_PROFILE.version,
      supported: false,
      reasonCode: 'NO_REGISTERED_PATHOLOGY_CLASS',
      pathologyClasses: [],
      verifierIds: [],
      counterchecks: [],
      paths: normalizePaths(opts.paths)
    });
  }

  const pathologyClasses = [...new Set(matched.map(p => p.pathologyClass))].sort();
  const verifierIds = [...new Set(matched.map(p => p.verifierId))].sort();
  const counterchecks = [...new Set(matched.flatMap(p => p.counterchecks))].sort();

  return deepFreeze({
    profileId: DEFAULT_PATHOLOGY_PROFILE.profileId,
    version: DEFAULT_PATHOLOGY_PROFILE.version,
    supported: true,
    reasonCode: null,
    pathologyClasses,
    verifierIds,
    counterchecks,
    paths: normalizePaths(opts.paths)
  });
}

function normalizePaths(paths) {
  if (!Array.isArray(paths)) return [];
  return [...paths]
    .map(normalizeRepositoryPath)
    .filter(Boolean)
    .sort();
}

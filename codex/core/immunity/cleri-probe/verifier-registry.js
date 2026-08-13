/**
 * Cleri Probe structural verifier registry.
 *
 * Maintains the authoritative set of registered structural verifiers.
 * Only registered structural verifiers may emit VERIFIED findings.
 */

import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  ERROR_CODES,
  MODULE_IDS
} from '../../pixelbrain/bytecode-error.js';
import { createEvidence, deepFreeze, EVIDENCE_KINDS } from './contracts.js';
import { concurrentMutationVerifier } from './verifiers/concurrent-mutation.verifier.js';
import { emptyCollectionTruthinessVerifier } from './verifiers/empty-collection-truthiness.verifier.js';
import { externalResponseVerifier } from './verifiers/external-response.verifier.js';
import { listenerLifecycleVerifier } from './verifiers/listener-lifecycle.verifier.js';
import { swallowedErrorVerifier } from './verifiers/swallowed-error.verifier.js';
import { unseededRandomnessVerifier } from './verifiers/unseeded-randomness.verifier.js';

// ─── Internal helpers ────────────────────────────────────────────────────────

function validationError(message, context = {}) {
  const error = new BytecodeError(
    ERROR_CATEGORIES.VALUE,
    ERROR_SEVERITY.CRIT,
    MODULE_IDS.IMMUNITY,
    ERROR_CODES.INVALID_VALUE,
    { message, ...context }
  );
  error.message = message;
  return error;
}

function isThenable(value) {
  return value !== null && typeof value === 'object' && typeof value.then === 'function';
}

function isDeeplyFrozen(value) {
  if (value === null || typeof value !== 'object') return true;
  if (!Object.isFrozen(value)) return false;
  if (Array.isArray(value)) {
    return value.every(isDeeplyFrozen);
  }
  return Object.values(value).every(isDeeplyFrozen);
}

const STABILITY_ITERATIONS = 25;
const RUNTIME_BUDGET_MS = 100;

function stableStringify(value) {
  return JSON.stringify(value, (key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const sorted = {};
      for (const k of Object.keys(val).sort()) {
        sorted[k] = val[k];
      }
      return sorted;
    }
    return val;
  });
}

function measureCall(label, id, fn, args) {
  const start = Date.now();
  let result;
  try {
    result = fn(...args);
  } catch (error) {
    throw validationError(
      `Verifier ${label} threw during stability harness: ${error.message}`,
      { id, error }
    );
  }
  if (isThenable(result)) {
    throw validationError(`Verifier ${label} must be synchronous: ${id}`, { id });
  }
  const elapsed = Date.now() - start;
  if (elapsed > RUNTIME_BUDGET_MS) {
    throw validationError(
      `Verifier ${label} exceeded ${RUNTIME_BUDGET_MS}ms runtime budget: ${elapsed}ms`,
      { id, elapsed }
    );
  }
  return result;
}

function assertStable(label, id, fn, argsList) {
  const expected = argsList.map(args => stableStringify(measureCall(label, id, fn, args)));

  for (let i = 1; i < STABILITY_ITERATIONS; i++) {
    for (let index = 0; index < argsList.length; index++) {
      const args = argsList[index];
      const serialized = stableStringify(measureCall(label, id, fn, args));
      if (serialized !== expected[index]) {
        throw validationError(
          `Verifier ${label} produced divergent output on repetition ${i}`,
          { id, repetition: i, expected: expected[index], actual: serialized }
        );
      }
    }
  }
}

function runStabilityHarness(verifier, id, pathologyClass) {
  const plan = deepFreeze({
    profileId: 'scholomance/default',
    version: '1.0.0',
    pathologyClasses: [pathologyClass],
    verifierIds: [id],
    counterchecks: [],
    paths: ['src']
  });

  const candidate = deepFreeze({
    source: 'function useEffect() { addEventListener("click", handler); }',
    spans: [
      { path: 'src/app.js', startLine: 1, startColumn: 1, endLine: 1, endColumn: 60 },
      { path: 'src/app.js', startLine: 5, startColumn: 1, endLine: 5, endColumn: 40 }
    ]
  });

  const context = deepFreeze({
    pathologyClass,
    repositoryRoot: 'src',
    counterchecks: ['MATCHING_EFFECT_CLEANUP', 'CAPTURED_UNSUBSCRIBE']
  });

  const hostileCandidate = deepFreeze({
    span: { path: null, startLine: -1, startColumn: 0, endLine: 0, endColumn: -1 },
    broken: true
  });

  assertStable('retrieveHints', id, verifier.retrieveHints, [[plan]]);

  const sampleResult = measureCall('verify', id, verifier.verify, [candidate, context]);
  validateResultShape(sampleResult);
  assertStable('verify', id, verifier.verify, [
    [candidate, context],
    [hostileCandidate, context]
  ]);
}

function validateEvidenceItem(item) {
  if (!item || typeof item !== 'object') {
    throw validationError('Evidence item must be an object', { item });
  }
  if (!EVIDENCE_KINDS.includes(item.kind)) {
    throw validationError(
      `Invalid evidence kind: ${item.kind}. Allowed evidence kinds: ${EVIDENCE_KINDS.join(', ')}`,
      { kind: item.kind }
    );
  }
  createEvidence(item);
}

function validateResultShape(result) {
  if (!result || typeof result !== 'object') {
    throw validationError('Verifier result must be an object', { result });
  }

  if (result.verdict !== 'VERIFIED' && result.verdict !== 'NO_FINDING') {
    throw validationError(
      `Verifier verdict must be VERIFIED or NO_FINDING, got ${result.verdict}`,
      { verdict: result.verdict }
    );
  }

  if ('score' in result) {
    throw validationError(
      'Candidate score is not a finding verdict',
      { result }
    );
  }

  const evidence = result.evidence;
  if (evidence !== undefined) {
    if (!Array.isArray(evidence)) {
      throw validationError('Verifier evidence must be an array', { evidence });
    }
    for (const item of evidence) {
      validateEvidenceItem(item);
    }
  }
}

// ─── Registry constructors ───────────────────────────────────────────────────

export function createVerifierRegistry() {
  return deepFreeze({
    verifiers: new Map(),
    classVersions: new Map(),
    metadata: deepFreeze({})
  });
}

// ─── Registration ────────────────────────────────────────────────────────────

/**
 * Registers a structural verifier in an immutable registry.
 *
 * @param {object} registry - Existing registry.
 * @param {object} verifier - Verifier to register.
 * @returns {object} New registry including the verifier.
 */
export function registerVerifier(registry, verifier) {
  if (!registry || typeof registry !== 'object' || !(registry.verifiers instanceof Map)) {
    throw validationError('Registry must be created with createVerifierRegistry', { registry });
  }

  if (!verifier || typeof verifier !== 'object') {
    throw validationError('Verifier must be an object', { verifier });
  }

  const id = String(verifier.id ?? '');
  const pathologyClass = String(verifier.pathologyClass ?? '');
  const version = String(verifier.version ?? '');

  if (!id) {
    throw validationError('Verifier id is required', { verifier });
  }
  if (!pathologyClass) {
    throw validationError('Verifier pathologyClass is required', { verifier });
  }
  if (!version) {
    throw validationError('Verifier version is required', { verifier });
  }
  if (typeof verifier.retrieveHints !== 'function') {
    throw validationError('Verifier retrieveHints must be a function', { verifier });
  }
  if (typeof verifier.verify !== 'function') {
    throw validationError('Verifier verify must be a function', { verifier });
  }

  if (registry.verifiers.has(id)) {
    throw validationError(`Duplicate verifier id: ${id}`, { id });
  }

  const classVersionKey = `${pathologyClass}@${version}`;
  if (registry.classVersions.has(classVersionKey)) {
    throw validationError(
      `Duplicate verifier class/version pair: ${classVersionKey}`,
      { pathologyClass, version }
    );
  }

  if ('metadata' in verifier) {
    if (verifier.metadata === null || typeof verifier.metadata !== 'object' || !isDeeplyFrozen(verifier.metadata)) {
      throw validationError('Verifier metadata must be a deeply frozen object or absent', { verifier });
    }
  }

  const frozenVerifier = deepFreeze({ ...verifier });

  runStabilityHarness(frozenVerifier, id, pathologyClass);

  const verifiers = new Map(registry.verifiers);
  const classVersions = new Map(registry.classVersions);

  verifiers.set(id, frozenVerifier);
  classVersions.set(classVersionKey, id);

  return deepFreeze({
    verifiers,
    classVersions,
    metadata: deepFreeze({ ...registry.metadata })
  });
}

// ─── Selection ───────────────────────────────────────────────────────────────

/**
 * Selects registered verifiers matching the plan's pathology classes.
 *
 * @param {object} registry - Verifier registry.
 * @param {object} plan - Investigation plan.
 * @returns {object[]} Sorted matching verifiers.
 */
export function selectVerifiers(registry, plan) {
  if (!registry || typeof registry !== 'object' || !(registry.verifiers instanceof Map)) {
    throw validationError('Registry must be created with createVerifierRegistry', { registry });
  }

  const classes = new Set((plan && Array.isArray(plan.pathologyClasses)) ? plan.pathologyClasses : []);
  const selected = [];

  for (const verifier of registry.verifiers.values()) {
    if (classes.has(verifier.pathologyClass)) {
      selected.push(verifier);
    }
  }

  return deepFreeze(selected.sort((a, b) => String(a.id).localeCompare(String(b.id))));
}

// ─── Result validation ───────────────────────────────────────────────────────

/**
 * Validates that a verifier result conforms to structural rules.
 *
 * Rejects candidate scores presented as verdicts and any verdict other than
 * VERIFIED or NO_FINDING. Evidence, when present, must be well-formed.
 *
 * @param {object} result - Verifier result.
 * @returns {object} { valid: true }
 */
export function validateVerifierResult(result) {
  validateResultShape(result);
  return deepFreeze({ valid: true });
}

// ─── Default registry ────────────────────────────────────────────────────────

/**
 * The verifier families installed by default.
 *
 * A family only appears here once it has met its labeled precision gate. A
 * verifier that regresses below the gate is removed from this list before
 * release; the CLI then reports its absence as a coverage limitation rather
 * than silently claiming the pathology is not present.
 */
export const DEFAULT_VERIFIERS = deepFreeze([
  concurrentMutationVerifier,
  emptyCollectionTruthinessVerifier,
  externalResponseVerifier,
  listenerLifecycleVerifier,
  swallowedErrorVerifier,
  unseededRandomnessVerifier
]);

export function createDefaultRegistry(verifiers = DEFAULT_VERIFIERS) {
  let registry = createVerifierRegistry();
  for (const verifier of verifiers) {
    registry = registerVerifier(registry, verifier);
  }
  return registry;
}

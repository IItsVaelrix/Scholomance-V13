/**
 * Cleri Probe canonical remediation lookup.
 *
 * Maps a pathology class to the repair the Scholomance already knows about.
 * Where an entry exists in repair.recommendations.js it is the authority; the
 * rest of the guide is canonical here.
 *
 * Verification steps are selected from an allow-listed command catalog. Report
 * content — a hypothesis, a symbol, a path — never reaches a shell fragment.
 *
 * Pure core module: no process, fs, os, performance, or network access.
 */

import { deepFreeze } from './contracts.js';
import { getRepair } from '../repair.recommendations.js';

/**
 * The only commands a remediation guide may print. A step that is not in this
 * catalog cannot be emitted, so a crafted symbol name cannot smuggle a command
 * into an operator's terminal.
 */
export const VERIFICATION_COMMANDS = deepFreeze([
  'npm run lint',
  'npm run test:qa',
  'npm run typecheck',
  'npx vitest run tests/qa/cleri-probe',
  'npx vitest run tests/qa/cleri-probe/verifiers'
]);

const UNKNOWN = deepFreeze({
  recommendationId: 'repair.unknown',
  summary: 'No canonical remediation is registered for this pathology class.',
  safePattern: '',
  unsafePattern: '',
  verificationSteps: deepFreeze(['npm run test:qa']),
  autoFixAvailable: false
});

/**
 * Canonical guides, keyed by pathology class.
 *
 * `repairKey` links a class to an existing repair recommendation. When present,
 * its title becomes the summary, so the Scholomance keeps one voice for a repair
 * it already documents.
 */
const GUIDES = deepFreeze({
  UNSEEDED_RANDOMNESS: {
    repairKey: 'repair.math-random.seeded',
    summary: 'Draw from a seeded RNG owned by the deterministic authority instead of Math.random().',
    unsafePattern: 'const roll = Math.random();',
    safePattern: 'const roll = rng.next(); // rng seeded from the encounter or session seed',
    verificationSteps: ['npm run test:qa', 'npx vitest run tests/qa/cleri-probe']
  },
  LEAKED_LISTENER_SUBSCRIPTION: {
    repairKey: null,
    recommendationId: 'cleri.listener-cleanup',
    summary: 'Return a cleanup from the effect that removes the exact receiver, event, and handler it registered.',
    unsafePattern: "useEffect(() => { window.addEventListener('resize', handler); }, []);",
    safePattern: "useEffect(() => { window.addEventListener('resize', handler); return () => window.removeEventListener('resize', handler); }, []);",
    verificationSteps: ['npm run test:qa']
  },
  SWALLOWED_ERROR: {
    repairKey: null,
    recommendationId: 'cleri.error-propagation',
    summary: 'Rethrow, translate into a BytecodeError, or return a documented fallback that names the error.',
    unsafePattern: 'catch (error) { console.log(error); }',
    safePattern: 'catch (error) { throw new BytecodeError(CATEGORY, SEVERITY, MODULE_ID, CODE, { cause: error }); }',
    verificationSteps: ['npm run test:qa']
  },
  UNSAFE_EXTERNAL_RESPONSE_ACCESS: {
    repairKey: null,
    recommendationId: 'cleri.external-response-validation',
    summary: 'Guard the HTTP status and validate the payload shape before it crosses into domain logic.',
    unsafePattern: 'const data = await response.json(); return data.profile.name;',
    safePattern: 'if (!response.ok) throw new BytecodeError(...); const data = ProfileSchema.parse(await response.json());',
    verificationSteps: ['npm run test:qa', 'npm run typecheck']
  },
  EMPTY_COLLECTION_TRUTHINESS: {
    repairKey: null,
    recommendationId: 'cleri.empty-collection-test',
    summary: 'Ask a collection about its size. `!items` answers "is it missing", never "is it empty".',
    unsafePattern: 'const tags = posMap.get(word); if (!tags) return unknownWord();',
    safePattern: 'const tags = posMap.get(word); if (!tags?.length) return unknownWord();',
    verificationSteps: ['npm run test:qa']
  },
  CONCURRENT_SHARED_STATE_MUTATION: {
    repairKey: null,
    recommendationId: 'cleri.concurrent-shared-state',
    summary: 'Return a value from each callback and aggregate after the join, or serialize the write behind an approved synchronization adapter.',
    unsafePattern: 'await Promise.all(items.map(async item => { shared[item.id] = await work(item); }));',
    safePattern: 'const entries = await Promise.all(items.map(async item => [item.id, await work(item)]));',
    verificationSteps: ['npm run test:qa']
  }
});

/** Drops any step that is not in the allow-listed catalog. */
function allowListedSteps(steps) {
  const selected = [...new Set((steps || []).filter(step => VERIFICATION_COMMANDS.includes(step)))].sort();
  return selected.length > 0 ? selected : ['npm run test:qa'];
}

/**
 * Resolves the canonical remediation guide for a pathology class.
 *
 * An unregistered class returns the unknown guide rather than throwing: a
 * missing remediation must never suppress a proven finding.
 */
export function getRemediation(pathologyClass) {
  const guide = GUIDES[String(pathologyClass)];
  if (!guide) return UNKNOWN;

  const repair = guide.repairKey ? getRepair(guide.repairKey) : null;
  const registered = repair && repair.key !== 'repair.unknown';

  return deepFreeze({
    recommendationId: registered ? repair.key : (guide.recommendationId ?? 'repair.unknown'),
    summary: registered ? `${repair.title}: ${guide.summary}` : guide.summary,
    safePattern: guide.safePattern,
    unsafePattern: guide.unsafePattern,
    verificationSteps: deepFreeze(allowListedSteps(guide.verificationSteps)),
    autoFixAvailable: false
  });
}

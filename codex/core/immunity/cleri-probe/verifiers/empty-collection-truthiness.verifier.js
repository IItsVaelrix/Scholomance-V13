/**
 * EMPTY_COLLECTION_TRUTHINESS structural verifier.
 *
 * `[]` is truthy. `new Map()` is truthy. So `if (!results)` asks "did the
 * producer hand me nothing at all", never "did it hand me an empty result" —
 * and in a parsing pipeline those two questions have opposite answers. The
 * branch reads like an escape hatch for the empty case and cannot fire for it.
 *
 * The verifier only reports the shape where the file argues with itself: the
 * same binding, in the same function, is asked about with `x.length` in one
 * place and with a bare `!x` in another. The length-aware test is the author's
 * own statement that an empty collection is reachable; the bare negation is the
 * place that forgot. A binding never length-tested might genuinely only ever be
 * nullish, so v1 leaves it alone.
 *
 * Pure core module: no process, fs, os, performance, or network access.
 */

import { deepFreeze } from '../contracts.js';
import { getRemediation } from '../remediation.js';
import { hasApprovedImmuneAllow } from '../scholomance-profile.js';
import {
  bySpan,
  countercheck,
  enclosingNamedFunction,
  hasFacts,
  noFinding,
  spanWithSymbol,
  supporting,
  verified
} from './verifier-kit.js';

const PATHOLOGY_CLASS = 'EMPTY_COLLECTION_TRUTHINESS';

const REMEDIATION = getRemediation(PATHOLOGY_CLASS);

const LIMITATIONS = deepFreeze([
  'Only a binding the same function also tests by length or size is proven; a bare negation with no length-aware sibling test is not reported.',
  'Collection identity is proven from Array/Map/Set-exclusive evidence only, so a collection that is only ever indexed or measured with .length is out of scope.',
  'A guard whose branch returns, throws, breaks, or continues is read as a nullish bail-out and is never reported.'
]);

/** Size reads that make a test length-aware, whatever the collection kind. */
function sizeProperties(name) {
  return [`${name}.length`, `${name}.size`];
}

/**
 * True when the test this guard belongs to reads the binding's size anywhere.
 *
 * The scoped reads matter as much as the guard's own: a guard recorded from the
 * left operand of `!items || items.length === 0` asks nothing about size by
 * itself, and reporting it would convict the correct idiom.
 */
function readsSize(guard, name) {
  const wanted = sizeProperties(name);
  const reads = [...(guard.properties || []), ...(guard.scopeProperties || [])];
  return reads.some(entry => wanted.includes(entry));
}

/**
 * A guard is an emptiness question when it negates the binding itself and asks
 * nothing about its size. `!items.length` is already the correct test and reads
 * here as a size-aware guard, not as a bare one.
 */
function isBareNegation(guard, name) {
  return guard.negated === true && !readsSize(guard, name);
}

/**
 * One guard per binding per line.
 *
 * `if (a && !x)` emits a guard for the if-statement and another for the nested
 * logical expression. They are the same question asked once, so reporting both
 * would count one defect twice. The widest test wins, since it is the one that
 * can see every countercheck.
 */
function widestPerLine(guards) {
  const seen = new Map();
  for (const guard of guards) {
    const key = guard.span.startLine;
    const held = seen.get(key);
    if (!held || guard.span.startColumn < held.span.startColumn) seen.set(key, guard);
  }
  return [...seen.values()];
}

function describeEvidence(evidence) {
  const kinds = [...new Set(evidence.map(item => item.kind))].sort();
  return kinds.join(', ');
}

export const emptyCollectionTruthinessVerifier = deepFreeze({
  id: 'empty-collection-truthiness/v1',
  version: '1.0.0',
  pathologyClass: PATHOLOGY_CLASS,
  supportingPredicates: deepFreeze([
    'BINDING_IS_PROVEN_COLLECTION',
    'BINDING_TESTED_BY_BARE_NEGATION',
    'SAME_FUNCTION_TESTS_BINDING_BY_SIZE'
  ]),
  counterchecks: deepFreeze([
    'SIZE_READ_IN_SAME_GUARD',
    'GUARD_IS_A_NULLISH_BAILOUT',
    'NO_APPROVED_IMMUNE_ALLOW'
  ]),
  limitations: LIMITATIONS,

  retrieveHints() {
    return ['length', 'size'];
  },

  verify(candidate, context) {
    if (!hasFacts(candidate)) return noFinding();

    const facts = candidate.facts;
    void context;

    const evidenceByBinding = new Map();
    for (const item of facts.collectionEvidence || []) {
      if (!item || !item.bindingId) continue;
      if (!evidenceByBinding.has(item.bindingId)) evidenceByBinding.set(item.bindingId, []);
      evidenceByBinding.get(item.bindingId).push(item);
    }
    if (evidenceByBinding.size === 0) return noFinding();

    const guardsByBinding = new Map();
    for (const guard of facts.guards || []) {
      if (!guard || !guard.bindingId) continue;
      if (!guardsByBinding.has(guard.bindingId)) guardsByBinding.set(guard.bindingId, []);
      guardsByBinding.get(guard.bindingId).push(guard);
    }

    const findings = [];

    for (const binding of facts.bindings || []) {
      const evidence = evidenceByBinding.get(binding.id);
      if (!evidence || evidence.length === 0) continue;

      const guards = widestPerLine(guardsByBinding.get(binding.id) || []);
      if (guards.length === 0) continue;

      const sizeAware = guards.filter(guard => readsSize(guard, binding.name));
      if (sizeAware.length === 0) continue;

      const sizeAwareFunctions = new Set(sizeAware.map(guard => guard.functionId));

      for (const guard of guards) {
        if (!isBareNegation(guard, binding.name)) continue;
        // The size-aware test has to be the same author making the same
        // decision: a length check in a different function is a different
        // contract, not a contradiction.
        if (!sizeAwareFunctions.has(guard.functionId)) continue;
        if (guard.consequent === 'BAILOUT') continue;
        if (hasApprovedImmuneAllow(facts.comments, PATHOLOGY_CLASS, guard.span.startLine)) continue;

        const owner = enclosingNamedFunction(facts.functions, guard.functionId);
        const symbol = owner ? owner.name : null;
        const span = spanWithSymbol(guard.span, symbol);
        const sibling = sizeAware.find(item => item.functionId === guard.functionId) || sizeAware[0];

        findings.push({
          span,
          symbol,
          summary:
            `\`!${binding.name}\` tests a proven collection for emptiness, but an empty collection is truthy, ` +
            `so this branch can only fire when ${binding.name} is null or undefined`,
          // The defect's own span leads: a consumer that reads only the first
          // piece of evidence must land on the guard, not on the proof that the
          // binding is a collection.
          supportingEvidence: [
            supporting(
              'BINDING_TESTED_BY_BARE_NEGATION',
              true,
              span,
              `The guard negates ${binding.name} itself and reads neither its length nor its size`
            ),
            supporting(
              'BINDING_IS_PROVEN_COLLECTION',
              true,
              spanWithSymbol(evidence[0].span, symbol),
              `${binding.name} holds an Array, Map, or Set (${describeEvidence(evidence)})`
            ),
            supporting(
              'SAME_FUNCTION_TESTS_BINDING_BY_SIZE',
              true,
              spanWithSymbol(sibling.span, symbol),
              `Line ${sibling.span.startLine} tests ${binding.name} by size, so an empty ${binding.name} is reachable here`
            )
          ],
          counterEvidenceChecked: [
            countercheck(
              'SIZE_READ_IN_SAME_GUARD',
              false,
              span,
              `The guard never reads ${binding.name}.length or ${binding.name}.size`
            ),
            countercheck(
              'GUARD_IS_A_NULLISH_BAILOUT',
              false,
              span,
              guard.consequent === 'WORK'
                ? 'The guarded branch does work rather than returning, so it is not a nullish bail-out'
                : 'The guard is an expression rather than a bail-out statement'
            ),
            countercheck(
              'NO_APPROVED_IMMUNE_ALLOW',
              true,
              span,
              'No approved IMMUNE_ALLOW: empty-collection-truthiness annotation sits on this line'
            )
          ],
          remediation: REMEDIATION,
          limitations: LIMITATIONS,
          verificationSteps: REMEDIATION.verificationSteps
        });
      }
    }

    if (findings.length === 0) return noFinding();
    return verified(findings.sort(bySpan));
  }
});

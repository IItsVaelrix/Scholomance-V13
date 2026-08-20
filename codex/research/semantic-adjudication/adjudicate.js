/**
 * Gold records, disagreement resolution, Pass B.
 *
 * Two independent Pass A labels are never silently majority-voted.
 *
 * @module codex/research/semantic-adjudication/adjudicate
 */

import {
  DISAGREEMENT_REASONS,
  GOLD_REFUSALS,
  PREDICATE_FAMILIES,
  assertNoBallistics,
  isGoldRefusal,
  validateGoldLabel,
} from './adjudication-schema.js';
import { blindCase } from './blind-case.js';
import { classifyHole } from './classify-hole.js';
import { discriminativeFamily } from './cue-lexicon.js';

export function recordGold({
  caseId,
  adjudicatorId,
  gold,
  candidateSenses,
  notes = null,
} = {}) {
  const check = validateGoldLabel(gold, candidateSenses);
  if (!check.ok) throw new Error('not a legal gold label');
  return Object.freeze({
    caseId,
    adjudicatorId,
    gold,
    notes,
  });
}

function classifyWhy(a, b) {
  if (a.gold === 'AMBIGUOUS' || b.gold === 'AMBIGUOUS') return 'context_genuinely_ambiguous';
  if (a.gold === 'INSUFFICIENT_CONTEXT' || b.gold === 'INSUFFICIENT_CONTEXT') {
    return 'gloss_underspecified';
  }
  if (a.gold === 'NONE_OF_THE_ABOVE' || b.gold === 'NONE_OF_THE_ABOVE'
    || a.gold === 'BAD_CANDIDATE_SET' || b.gold === 'BAD_CANDIDATE_SET') {
    return 'candidate_senses_overlap';
  }
  if (isGoldRefusal(a.gold) || isGoldRefusal(b.gold)) return 'gloss_underspecified';
  return 'candidate_senses_overlap';
}

/**
 * Written pilot policy. Not a majority vote.
 *
 * A sense vs INSUFFICIENT_CONTEXT means one rubric found an observable
 * the other declined to use. Accept the sense and name the reason.
 * A sense vs AMBIGUOUS stays unresolved: the second pass saw two readings.
 */
export function applyPilotResolution(a, b) {
  if (a.gold === b.gold) {
    return resolveDisagreement(a, b);
  }
  const aSense = !isGoldRefusal(a.gold);
  const bSense = !isGoldRefusal(b.gold);
  if (!aSense && !bSense) {
    const labels = [a.gold, b.gold];
    let gold = 'INSUFFICIENT_CONTEXT';
    let classifiedWhy = 'gloss_underspecified';
    if (labels.includes('BAD_CANDIDATE_SET')) {
      gold = 'BAD_CANDIDATE_SET';
      classifiedWhy = 'candidate_senses_overlap';
    } else if (labels.includes('NONE_OF_THE_ABOVE')) {
      gold = 'NONE_OF_THE_ABOVE';
      classifiedWhy = 'candidate_senses_overlap';
    } else if (labels.includes('AMBIGUOUS')) {
      gold = 'AMBIGUOUS';
      classifiedWhy = 'context_genuinely_ambiguous';
    }
    return Object.freeze({
      agreement: false,
      gold,
      needsResolution: false,
      classifiedWhy,
      resolverId: 'R-both-refused-no-sense',
    });
  }
  if (a.gold === 'INSUFFICIENT_CONTEXT' && bSense) {
    return Object.freeze({
      agreement: false,
      gold: b.gold,
      needsResolution: false,
      classifiedWhy: 'domain_knowledge_required',
      resolverId: 'R-commonsense-when-strict-abstains',
    });
  }
  if (b.gold === 'INSUFFICIENT_CONTEXT' && aSense) {
    return Object.freeze({
      agreement: false,
      gold: a.gold,
      needsResolution: false,
      classifiedWhy: 'domain_knowledge_required',
      resolverId: 'R-strict-recovery-when-commonsense-abstains',
    });
  }
  return resolveDisagreement(a, b);
}

export function resolveDisagreement(a, b, resolution) {
  if (a.gold === b.gold) {
    return Object.freeze({
      agreement: true,
      gold: a.gold,
      needsResolution: false,
      classifiedWhy: null,
      resolverId: null,
    });
  }
  const classifiedWhy = resolution?.classifiedWhy ?? classifyWhy(a, b);
  if (classifiedWhy && !DISAGREEMENT_REASONS.includes(classifiedWhy)) {
    throw new Error(`unknown disagreement reason: ${classifiedWhy}`);
  }
  if (resolution && Object.prototype.hasOwnProperty.call(resolution, 'gold') && resolution.gold != null) {
    return Object.freeze({
      agreement: false,
      gold: resolution.gold,
      needsResolution: false,
      classifiedWhy,
      resolverId: resolution.resolverId ?? null,
    });
  }
  return Object.freeze({
    agreement: false,
    gold: null,
    needsResolution: true,
    classifiedWhy,
    resolverId: null,
  });
}

export function adjudicatePassB({ blind, gold } = {}) {
  const leaked = assertNoBallistics(blind);
  if (!leaked.ok) throw new Error(`Pass B saw Ballistics (${leaked.reason})`);

  const failureLayer = classifyHole({ frozen: blind, gold });
  let predicateFamily = 'OTHER';
  if (!isGoldRefusal(gold)) {
    const goldSense = (blind.candidateSenses || []).find((c) => c.senseId === gold);
    const competitors = (blind.candidateSenses || []).filter((c) => c.senseId !== gold);
    if (goldSense) {
      predicateFamily = discriminativeFamily(
        blind.query,
        goldSense.gloss,
        competitors.map((c) => c.gloss),
      );
    }
    if (blind.frameEvidence?.framePos && failureLayer === 'TYPE_IV_UNUSED_EVIDENCE') {
      predicateFamily = 'SYNTACTIC_FRAME';
    }
  }
  if (!PREDICATE_FAMILIES.includes(predicateFamily)) predicateFamily = 'OTHER';

  return Object.freeze({
    caseId: blind.caseId,
    gold,
    failureLayer,
    predicateFamily,
    notes: null,
  });
}

export function runTwoPass({ frozen, passA, resolutionPolicy = null } = {}) {
  const blind = blindCase(frozen);
  const records = (passA || []).map((fn, i) => {
    const out = fn(blind);
    return recordGold({
      caseId: frozen.caseId,
      adjudicatorId: out.adjudicatorId ?? `rubric-${i}`,
      gold: out.gold,
      candidateSenses: blind.candidateSenses,
      notes: out.notes ?? null,
    });
  });
  const resolved = records.length >= 2
    ? (resolutionPolicy === 'pilot'
      ? applyPilotResolution(records[0], records[1])
      : resolveDisagreement(records[0], records[1]))
    : {
      agreement: true,
      gold: records[0]?.gold ?? null,
      needsResolution: false,
      classifiedWhy: null,
    };
  const passB = resolved.gold
    ? adjudicatePassB({ blind, gold: resolved.gold })
    : null;
  return Object.freeze({
    passA: Object.freeze(records),
    passB,
    agreement: resolved.agreement,
    gold: resolved.gold,
    needsResolution: resolved.needsResolution,
    classifiedWhy: resolved.classifiedWhy,
    resolverId: resolved.resolverId ?? null,
    blind,
  });
}

export { GOLD_REFUSALS };

/**
 * Gold adjudication research harness.
 *
 * Consumes production inquiry evidence. Never writes a selection.
 *
 * @module codex/research/semantic-adjudication
 */

export {
  ADJUDICATION_CONTRACT,
  DISAGREEMENT_REASONS,
  FAILURE_LAYERS,
  GOLD_REFUSALS,
  PREDICATE_FAMILIES,
  QA_CHECKLIST,
  SPLIT_BANDS,
  assertNoBallistics,
  isGoldRefusal,
  isOpportunity,
  isRecoverableGold,
  validateGoldLabel,
} from './adjudication-schema.js';

export { collectFromQueries, coverageOf, selectOpportunities } from './collect-opportunities.js';
export { freezeCase } from './freeze-case.js';
export { blindCase, labelToSenseId, revealBallistics } from './blind-case.js';
export {
  assignSplits,
  describeStratum,
  splitBandOf,
  splitOfCase,
  stratifiedSample,
} from './stratify.js';
export {
  adjudicatePassB,
  applyPilotResolution,
  recordGold,
  resolveDisagreement,
  runTwoPass,
} from './adjudicate.js';
export { classifyHole, unusedExistingEvidence } from './classify-hole.js';
export {
  clusterPredicates,
  rankPredicateOpportunity,
  refuseHoldout,
  topRecurringHoles,
} from './cluster-predicates.js';
export {
  ballisticsTopSenseId,
  calibrateBallistics,
  flipBallisticsScores,
} from './evaluate-ballistics.js';
export { buildHoleLedger } from './build-hole-ledger.js';
export { makeHypothesisCard } from './hypothesis-card.js';
export { adjudicateRubricA, adjudicateRubricB } from './rubric-adjudicator.js';

/**
 * Compatibility waterfall and silence taxonomy for decision-bearing edges.
 *
 * OBSERVE-only. Explains WHERE T1 starvation happens instead of guessing:
 * relation projection -> oriented left value -> oriented right value ->
 * authored mapping present -> actual value match (fire).
 *
 * Labels and classes are frozen by
 * docs/superpowers/evidence/2026-08-17-PREREG-semantic-competition-coverage.md.
 * Does not rank. Does not admit bonds. Does not author relations.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/compat-waterfall
 */

import { UNKNOWN, featuresFor } from './feature-provider.js';
import { knownFeatureCount } from './experimental-inventory.js';
import { FEATURE_COMPAT, ends, projectRelation } from './feature-score.js';
import {
  isComplementRelation,
  scoreComplementCompat,
} from './complement-compat.js';
import { observeDerivationCoverage, diagnoseT1Edge } from './observe-coverage.js';
import { leafMeaning } from './compositional-semantics.js';
import { sensesFor } from './lexical-semantics.js';
import { asLeaf, bondFamily, derivationSignature, lemmaOf } from './decision-bearing.js';

export const WATERFALL_STAGES = Object.freeze([
  'relationAvailable',
  'leftValueAvailable',
  'rightValueAvailable',
  'compatMappingAvailable',
  'actualCompatFire',
]);

export const SILENCE_CLASSES = Object.freeze([
  'C1-composition-missing',
  'C2-lexical-missing',
  'C3-feature-missing',
  'C4-intentional-silence',
]);

function valueOf(features, kind) {
  const row = (features || []).find((f) => f.kind === kind);
  if (!row || row.value === UNKNOWN || row.confidence == null) return null;
  return row.value;
}

/**
 * Cumulative funnel over the oriented ends of one projected relation.
 * Every later stage implies every earlier one.
 */
export function waterfallStages({ leftFeats, rightFeats, relation }) {
  if (relation == null) {
    return Object.freeze({
      relationAvailable: false,
      leftValueAvailable: false,
      rightValueAvailable: false,
      compatMappingAvailable: false,
      actualCompatFire: false,
    });
  }
  const leftLit = knownFeatureCount(leftFeats) > 0;
  const rightLit = knownFeatureCount(rightFeats) > 0;
  if (isComplementRelation(relation)) {
    const hit = scoreComplementCompat({ leftFeats, rightFeats, relation });
    return Object.freeze({
      relationAvailable: true,
      leftValueAvailable: leftLit,
      rightValueAvailable: rightLit,
      compatMappingAvailable: hit.mappingAvailable,
      actualCompatFire: hit.fired > 0,
    });
  }
  let compatMappingAvailable = false;
  let actualCompatFire = false;
  for (const rule of FEATURE_COMPAT) {
    if (rule.relation !== relation) continue;
    const lv = valueOf(leftFeats, rule.left.kind);
    const rv = valueOf(rightFeats, rule.right.kind);
    if (lv == null || rv == null) continue;
    compatMappingAvailable = true;
    if (lv === rule.left.value && rv === rule.right.value) actualCompatFire = true;
  }
  return Object.freeze({
    relationAvailable: true,
    leftValueAvailable: leftLit,
    rightValueAvailable: rightLit,
    compatMappingAvailable,
    actualCompatFire,
  });
}

/**
 * One silence class per edge. null means the edge is not a target:
 * it is already a live T1 competitor.
 *
 * C1 composition missing/incomplete; C2 lexical starvation;
 * C3 composition present but T1 dark; C4 glue/lift by design.
 */
export function classifySilence({ family, named, complete, starvation, couldFire }) {
  if (family === 'glue' || family === 'lift') return 'C4-intentional-silence';
  if (!named || starvation === 'compositional') return 'C1-composition-missing';
  if (starvation === 'lexical') return 'C2-lexical-missing';
  if (named && complete && !couldFire) return 'C3-feature-missing';
  return null;
}

/**
 * Full per-edge diagnosis for one derivation of a packed cell.
 * t1Status/t1Score come from the frozen diagnoseT1Edge so this census
 * can never drift from the reference T1 number; actualCompatFire must
 * equal (t1Status === 'could-fire') and the tests pin that.
 */
export function diagnoseCompetitionEdge(derivation, lexicon, provider) {
  const signature = derivationSignature(derivation);
  if (derivation?.lift) {
    return Object.freeze({
      signature,
      family: 'lift',
      bond: null,
      leftType: derivation.child?.type || null,
      rightType: null,
      resultType: derivation.lift,
      named: false,
      complete: false,
      starvation: 'intentional',
      relation: null,
      stages: null,
      t1Status: 'no-relation',
      t1Score: null,
      leftSenseCount: 0,
      rightSenseCount: 0,
      leftKnownFeatures: 0,
      rightKnownFeatures: 0,
      silenceClass: 'C4-intentional-silence',
    });
  }
  const bond = derivation?.bond;
  const family = bondFamily(bond);
  if (family === 'glue') {
    return Object.freeze({
      signature,
      family,
      bond,
      leftType: derivation.left?.type || null,
      rightType: derivation.right?.type || null,
      resultType: bond ? bond[2] : null,
      named: false,
      complete: false,
      starvation: 'intentional',
      relation: null,
      stages: null,
      t1Status: 'no-relation',
      t1Score: null,
      leftSenseCount: 0,
      rightSenseCount: 0,
      leftKnownFeatures: 0,
      rightKnownFeatures: 0,
      silenceClass: 'C4-intentional-silence',
    });
  }

  const leftLemma = lemmaOf(derivation.left);
  const rightLemma = lemmaOf(derivation.right);
  const leftType = derivation.left?.type;
  const rightType = derivation.right?.type;

  const coverage = observeDerivationCoverage(
    leafMeaning(asLeaf(derivation.left), lexicon),
    leafMeaning(asLeaf(derivation.right), lexicon),
    bond,
  );
  const relation = projectRelation(leftType, rightType, 'right');
  const selfFeats = featuresFor(leftLemma, leftType, provider);
  const otherFeats = featuresFor(rightLemma, rightType, provider);
  const oriented = ends(leftType, rightType, selfFeats, otherFeats);
  const stages = waterfallStages({
    leftFeats: oriented.left,
    rightFeats: oriented.right,
    relation,
  });
  const edge = diagnoseT1Edge(
    { lemma: leftLemma, type: leftType },
    { lemma: rightLemma, type: rightType, side: 'right' },
    provider,
  );
  const couldFire = edge.status === 'could-fire';

  return Object.freeze({
    signature,
    family,
    bond,
    leftType: leftType || null,
    rightType: rightType || null,
    resultType: bond ? bond[2] : null,
    rule: coverage.rule,
    named: coverage.named,
    complete: coverage.complete,
    starvation: coverage.starvation,
    relation,
    stages,
    t1Status: edge.status,
    t1Score: edge.score,
    leftSenseCount: sensesFor(leftLemma, leftType, lexicon).length,
    rightSenseCount: sensesFor(rightLemma, rightType, lexicon).length,
    leftKnownFeatures: knownFeatureCount(selfFeats),
    rightKnownFeatures: knownFeatureCount(otherFeats),
    silenceClass: classifySilence({
      family,
      named: coverage.named,
      complete: coverage.complete,
      starvation: coverage.starvation,
      couldFire,
    }),
  });
}

function rate(n, d) {
  return d > 0 ? n / d : 0;
}

/**
 * Aggregate the frozen prereg metrics from raw census tallies.
 * Empty denominators return 0, never NaN, never null-as-number.
 */
export function summarizeWaterfall(raw) {
  const edges = Number(raw.edges) || 0;
  const cells = Number(raw.cells) || 0;
  const funnel = Object.fromEntries(
    WATERFALL_STAGES.map((stage) => [stage, rate(Number(raw.funnel?.[stage]) || 0, edges)]),
  );
  return Object.freeze({
    silentCompetitorRate: rate(Number(raw.silent) || 0, edges),
    t1DecisionCouldFireRate: rate(Number(raw.couldFire) || 0, edges),
    namedCompleteRate: rate(Number(raw.namedComplete) || 0, edges),
    bothAlternativesNamedRate: rate(Number(raw.bothNamed) || 0, cells),
    bothAlternativesT1Rate: rate(Number(raw.bothT1) || 0, cells),
    decisionBearingEdges: edges,
    decisionCompetitiveCells: cells,
    waterfall: Object.freeze(funnel),
    silence: Object.freeze({ ...(raw.silence || {}) }),
  });
}

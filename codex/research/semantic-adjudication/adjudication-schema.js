/**
 * Gold-adjudication contract and taxonomies.
 *
 * Research-only. Nothing here is a production warranting signal.
 *
 * @module codex/research/semantic-adjudication/adjudication-schema
 */

export const ADJUDICATION_CONTRACT = 'PB-SEMANTIC-ADJUDICATION-v1';

export const GOLD_REFUSALS = Object.freeze([
  'AMBIGUOUS',
  'NONE_OF_THE_ABOVE',
  'INSUFFICIENT_CONTEXT',
  'BAD_CANDIDATE_SET',
]);

export const PREDICATE_FAMILIES = Object.freeze([
  'ANIMACY',
  'HUMANNESS',
  'CONCRETENESS',
  'TEMPORALITY',
  'LOCATION',
  'MOTION',
  'AGENCY',
  'INSTRUMENTALITY',
  'MATERIALITY',
  'EVENT_STRUCTURE',
  'SELECTIONAL_ROLE',
  'NUMBER',
  'MORPHOLOGY',
  'SYNTACTIC_FRAME',
  'DOMAIN',
  'ENTITY_TYPE',
  'PART_WHOLE',
  'CAUSE_EFFECT',
  'STATE_CHANGE',
  'SOCIAL_ROLE',
  'PHONETIC_ONLY',
  'OTHER',
]);

export const FAILURE_LAYERS = Object.freeze([
  'TYPE_I_PROBE_HOLE',
  'TYPE_II_BALLISTICS_ARTIFACT',
  'TYPE_III_CANDIDATE_GENERATION',
  'TYPE_IV_UNUSED_EVIDENCE',
]);

export const SPLIT_BANDS = Object.freeze([
  Object.freeze({ id: 'weak', min: 0.01, max: 0.03 }),
  Object.freeze({ id: 'moderate', min: 0.03, max: 0.07 }),
  Object.freeze({ id: 'strong', min: 0.07, max: 0.15 }),
  Object.freeze({ id: 'very-strong', min: 0.15, max: Infinity }),
]);

export const DISAGREEMENT_REASONS = Object.freeze([
  'context_genuinely_ambiguous',
  'gloss_underspecified',
  'candidate_senses_overlap',
  'annotation_mistake',
  'domain_knowledge_required',
]);

export function isOpportunity(coverage) {
  return Boolean(
    coverage
    && coverage.semantic === 'measured-unwarranted'
    && coverage.instrumentation === 'exposed'
    && coverage.opportunity === true,
  );
}

export function isGoldRefusal(gold) {
  return GOLD_REFUSALS.includes(gold);
}

export function isRecoverableGold(gold) {
  return typeof gold === 'string' && gold.length > 0 && !isGoldRefusal(gold);
}

export function validateGoldLabel(gold, candidateSenses) {
  if (isGoldRefusal(gold)) return Object.freeze({ ok: true });
  const ids = new Set((candidateSenses || []).map((c) => c?.senseId).filter(Boolean));
  if (ids.has(gold)) return Object.freeze({ ok: true });
  return Object.freeze({ ok: false, reason: 'not a legal gold label' });
}

function walkForBallistics(value, path, hits) {
  if (value == null) return;
  if (typeof value === 'string') {
    if (value === 'semanticScore' || /semanticScore/.test(value)) hits.push(path || 'string');
    return;
  }
  if (typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkForBallistics(item, `${path}[${i}]`, hits));
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    const next = path ? `${path}.${k}` : k;
    if (k === 'ballistics' || k === 'semanticScore' || k === 'winner' || k === 'preferredSense') {
      hits.push(next);
    }
    walkForBallistics(v, next, hits);
  }
}

/**
 * A gold-facing object must not carry Ballistics scores, split, or a winner.
 * Used as the contamination tripwire for blind views, Pass B, and cards.
 */
export function assertNoBallistics(obj) {
  const json = JSON.stringify(obj ?? null);
  if (json && /semanticScore/.test(json)) {
    return Object.freeze({ ok: false, reason: 'semanticScore' });
  }
  const hits = [];
  walkForBallistics(obj, '', hits);
  if (hits.length) return Object.freeze({ ok: false, reason: hits[0] });
  return Object.freeze({ ok: true });
}

export const QA_CHECKLIST = Object.freeze([
  'only-measured-unwarranted-exposed-enters',
  'gold-annotators-cannot-see-ballistics',
  'refusal-labels-are-legal',
  'candidate-generation-separated-from-probe',
  'unused-evidence-is-its-own-class',
  'missing-predicates-labeled-without-ballistics',
  'discovery-separated-from-holdout',
  'proposed-predicate-cannot-read-ballistics',
  'false-warrant-measured-explicitly',
  'receipt-determinism-stays-green',
  'flipping-ballistics-cannot-change-selection',
  'holdout-sealed-until-design-freeze',
]);

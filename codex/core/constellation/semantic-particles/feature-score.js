/**
 * T1 relational reading score.
 *
 * LAW: a single lexical feature earns zero by existing alone.
 * A feature affects rank only through an authored value-to-value relation.
 * UNKNOWN contributes nothing. A weak pairing is not illegal.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/feature-score
 */

import { UNKNOWN, featuresFor } from './feature-provider.js';
import { knownFeatureCount } from './experimental-inventory.js';

function isNom(type) {
  return type === 'N' || type === 'NP' || type === 'NC' || type === 'PROPN' || type === 'NPO';
}
function isVerb(type) {
  return type === 'V' || type === 'VP';
}
function isAdj(type) {
  return type === 'ADJ' || type === 'A';
}
function isP(type) { return type === 'P'; }
function isTo(type) { return type === 'TO'; }
function isPrt(type) { return type === 'PRT'; }
function isAdv(type) { return type === 'ADV'; }
function isDet(type) { return type === 'DET'; }
function isRel(type) { return type === 'REL'; }
function isAux(type) { return type === 'AUX'; }
function isCop(type) { return type === 'COP'; }
function isPron(type) { return type === 'PRON' || type === 'PRONACC'; }

function valueOf(features, kind) {
  const row = (features || []).find((f) => f.kind === kind);
  if (!row || row.value === UNKNOWN || row.confidence == null) return null;
  return row.value;
}

/**
 * Authored preferences. Not grammar. Not gold.
 * left/right are feature values on the two ends of a coarse relation.
 */
export const FEATURE_COMPAT = Object.freeze([
  Object.freeze({
    left: Object.freeze({ kind: 'entity.animate', value: true }),
    relation: 'subject-like',
    right: Object.freeze({ kind: 'event.motion', value: true }),
    weight: 2,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'entity.animate', value: false }),
    relation: 'subject-like',
    right: Object.freeze({ kind: 'event.motion', value: true }),
    weight: 0.25,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'entity.animal', value: true }),
    relation: 'subject-like',
    right: Object.freeze({ kind: 'event.motion', value: true }),
    weight: 1.5,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'entity.animal', value: false }),
    relation: 'subject-like',
    right: Object.freeze({ kind: 'event.motion', value: true }),
    weight: 0.25,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'entity.human', value: true }),
    relation: 'subject-like',
    right: Object.freeze({ kind: 'event.motion', value: true }),
    weight: 1.5,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'entity.human', value: false }),
    relation: 'subject-like',
    right: Object.freeze({ kind: 'event.motion', value: true }),
    weight: 0.25,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'role.agentCapable', value: true }),
    relation: 'subject-like',
    right: Object.freeze({ kind: 'event.motion', value: true }),
    weight: 2,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'role.agentCapable', value: false }),
    relation: 'subject-like',
    right: Object.freeze({ kind: 'event.motion', value: true }),
    weight: 0.25,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'entity.abstract', value: true }),
    relation: 'subject-like',
    right: Object.freeze({ kind: 'event.cognition', value: true }),
    weight: 2,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'entity.concrete', value: true }),
    relation: 'object-like',
    right: Object.freeze({ kind: 'event.possession', value: true }),
    weight: 1.5,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'entity.concrete', value: true }),
    relation: 'object-like',
    right: Object.freeze({ kind: 'event.creation', value: true }),
    weight: 1.5,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'entity.concrete', value: true }),
    relation: 'modified-by',
    right: Object.freeze({ kind: 'property.color', value: true }),
    weight: 2,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'entity.concrete', value: true }),
    relation: 'modified-by',
    right: Object.freeze({ kind: 'property.size', value: true }),
    weight: 2,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'entity.concrete', value: true }),
    relation: 'modified-by',
    right: Object.freeze({ kind: 'property.age', value: true }),
    weight: 2,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'property.color', value: true }),
    relation: 'modifies',
    right: Object.freeze({ kind: 'entity.concrete', value: true }),
    weight: 2,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'property.size', value: true }),
    relation: 'modifies',
    right: Object.freeze({ kind: 'entity.concrete', value: true }),
    weight: 2,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'property.age', value: true }),
    relation: 'modifies',
    right: Object.freeze({ kind: 'entity.concrete', value: true }),
    weight: 2,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'function.determiner', value: true }),
    relation: 'determines',
    right: Object.freeze({ kind: 'entity.concrete', value: true }),
    weight: 1.5,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'function.determiner', value: true }),
    relation: 'determines',
    right: Object.freeze({ kind: 'entity.abstract', value: true }),
    weight: 1,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'function.infinitival', value: true }),
    relation: 'infinitival-mark',
    right: Object.freeze({ kind: 'event.motion', value: true }),
    weight: 2,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'function.infinitival', value: true }),
    relation: 'infinitival-mark',
    right: Object.freeze({ kind: 'event.cognition', value: true }),
    weight: 2,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'function.infinitival', value: true }),
    relation: 'infinitival-mark',
    right: Object.freeze({ kind: 'event.creation', value: true }),
    weight: 1.5,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'function.adposition', value: true }),
    relation: 'adposition-of',
    right: Object.freeze({ kind: 'entity.location', value: true }),
    weight: 2,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'function.adposition', value: true }),
    relation: 'adposition-of',
    right: Object.freeze({ kind: 'entity.concrete', value: true }),
    weight: 1,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'function.auxiliary', value: true }),
    relation: 'auxiliates',
    right: Object.freeze({ kind: 'event.motion', value: true }),
    weight: 1.5,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'function.auxiliary', value: true }),
    relation: 'auxiliates',
    right: Object.freeze({ kind: 'event.cognition', value: true }),
    weight: 1.5,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'function.copula', value: true }),
    relation: 'copular',
    right: Object.freeze({ kind: 'property.evaluation', value: true }),
    weight: 1.5,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'function.pronominal', value: true }),
    relation: 'subject-like',
    right: Object.freeze({ kind: 'event.motion', value: true }),
    weight: 1.5,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'function.pronominal', value: true }),
    relation: 'subject-like',
    right: Object.freeze({ kind: 'event.cognition', value: true }),
    weight: 1.5,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'function.particle', value: true }),
    relation: 'particle-of',
    right: Object.freeze({ kind: 'event.motion', value: true }),
    weight: 1.5,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'function.adverbial', value: true }),
    relation: 'adverbial',
    right: Object.freeze({ kind: 'event.motion', value: true }),
    weight: 1.5,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'function.adverbial', value: true }),
    relation: 'adverbial',
    right: Object.freeze({ kind: 'event.cognition', value: true }),
    weight: 1.5,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'function.adverbial', value: true }),
    relation: 'adverbial',
    right: Object.freeze({ kind: 'event.creation', value: true }),
    weight: 1,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'entity.concrete', value: true }),
    relation: 'compound',
    right: Object.freeze({ kind: 'entity.concrete', value: true }),
    weight: 1.5,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'entity.abstract', value: true }),
    relation: 'compound',
    right: Object.freeze({ kind: 'entity.abstract', value: true }),
    weight: 1.5,
  }),
  Object.freeze({
    left: Object.freeze({ kind: 'entity.human', value: true }),
    relation: 'compound',
    right: Object.freeze({ kind: 'entity.abstract', value: true }),
    weight: 1,
  }),
]);

export function projectRelation(selfType, neighborType, neighborSide) {
  if (isNom(selfType) && isVerb(neighborType)) {
    return neighborSide === 'right' ? 'subject-like' : 'object-like';
  }
  if (isVerb(selfType) && isNom(neighborType)) {
    return neighborSide === 'left' ? 'subject-like' : 'object-like';
  }
  if (isPron(selfType) && isVerb(neighborType) && neighborSide === 'right') return 'subject-like';
  if (isVerb(selfType) && isPron(neighborType) && neighborSide === 'left') return 'subject-like';
  if (isNom(selfType) && isAdj(neighborType)) return 'modified-by';
  if (isAdj(selfType) && isNom(neighborType)) return 'modifies';
  if (isDet(selfType) && isNom(neighborType)) return 'determines';
  if (isNom(selfType) && isDet(neighborType)) return 'determines';
  if (isTo(selfType) && isVerb(neighborType)) return 'infinitival-mark';
  if (isVerb(selfType) && isTo(neighborType)) return 'infinitival-mark';
  if (isP(selfType) && isNom(neighborType)) return 'adposition-of';
  if (isNom(selfType) && isP(neighborType)) return 'adposition-of';
  if (isAux(selfType) && isVerb(neighborType)) return 'auxiliates';
  if (isVerb(selfType) && isAux(neighborType)) return 'auxiliates';
  if (isCop(selfType) && (isAdj(neighborType) || isNom(neighborType))) return 'copular';
  if ((isAdj(selfType) || isNom(selfType)) && isCop(neighborType)) return 'copular';
  if (isPrt(selfType) && isVerb(neighborType)) return 'particle-of';
  if (isVerb(selfType) && isPrt(neighborType)) return 'particle-of';
  if (isAdv(selfType) && (isVerb(neighborType) || isAdj(neighborType))) return 'adverbial';
  if ((isVerb(selfType) || isAdj(selfType)) && isAdv(neighborType)) return 'adverbial';
  if (isNom(selfType) && isNom(neighborType)) return 'compound';
  return null;
}

export function ends(selfType, neighborType, selfFeats, otherFeats) {
  if ((isNom(selfType) || isPron(selfType)) && isVerb(neighborType)) {
    return { left: selfFeats, right: otherFeats };
  }
  if (isVerb(selfType) && (isNom(neighborType) || isPron(neighborType))) {
    return { left: otherFeats, right: selfFeats };
  }
  if (isDet(selfType) && isNom(neighborType)) return { left: selfFeats, right: otherFeats };
  if (isNom(selfType) && isDet(neighborType)) return { left: otherFeats, right: selfFeats };
  if (isTo(selfType) && isVerb(neighborType)) return { left: selfFeats, right: otherFeats };
  if (isVerb(selfType) && isTo(neighborType)) return { left: otherFeats, right: selfFeats };
  if (isP(selfType) && isNom(neighborType)) return { left: selfFeats, right: otherFeats };
  if (isNom(selfType) && isP(neighborType)) return { left: otherFeats, right: selfFeats };
  if (isAux(selfType) && isVerb(neighborType)) return { left: selfFeats, right: otherFeats };
  if (isVerb(selfType) && isAux(neighborType)) return { left: otherFeats, right: selfFeats };
  if (isCop(selfType)) return { left: selfFeats, right: otherFeats };
  if (isCop(neighborType)) return { left: otherFeats, right: selfFeats };
  if (isPrt(selfType) && isVerb(neighborType)) return { left: selfFeats, right: otherFeats };
  if (isVerb(selfType) && isPrt(neighborType)) return { left: otherFeats, right: selfFeats };
  if (isNom(selfType) && isAdj(neighborType)) return { left: selfFeats, right: otherFeats };
  if (isAdj(selfType) && isNom(neighborType)) return { left: selfFeats, right: otherFeats };
  if (isAdv(selfType) && (isVerb(neighborType) || isAdj(neighborType))) {
    return { left: selfFeats, right: otherFeats };
  }
  if ((isVerb(selfType) || isAdj(selfType)) && isAdv(neighborType)) {
    return { left: otherFeats, right: selfFeats };
  }
  if (isNom(selfType) && isNom(neighborType)) return { left: selfFeats, right: otherFeats };
  return { left: selfFeats, right: otherFeats };
}

export function edgeCompatibility({ left, right, relation, provider }) {
  const leftFeats = featuresFor(left.lemma, left.type, provider);
  const rightFeats = featuresFor(right.lemma, right.type, provider);
  let score = 0;
  let fired = 0;
  for (const rule of FEATURE_COMPAT) {
    if (rule.relation !== relation) continue;
    const lv = valueOf(leftFeats, rule.left.kind);
    const rv = valueOf(rightFeats, rule.right.kind);
    if (lv == null || rv == null) continue;
    if (lv !== rule.left.value || rv !== rule.right.value) continue;
    score += rule.weight;
    fired += 1;
  }
  return Object.freeze({
    score,
    fired,
    illegal: false,
    relation,
  });
}

export function scoreLexicalReading({ lemma, type, neighbors = [], provider }) {
  const self = featuresFor(lemma, type, provider);
  let score = 0;
  let used = false;
  for (const nb of neighbors) {
    if (!nb?.lemma) continue;
    const relation = projectRelation(type, nb.type, nb.side || 'right');
    if (!relation) continue;
    const other = featuresFor(nb.lemma, nb.type, provider);
    const oriented = ends(type, nb.type, self, other);
    let local = 0;
    let fired = 0;
    for (const rule of FEATURE_COMPAT) {
      if (rule.relation !== relation) continue;
      const lv = valueOf(oriented.left, rule.left.kind);
      const rv = valueOf(oriented.right, rule.right.kind);
      if (lv == null || rv == null) continue;
      if (lv !== rule.left.value || rv !== rule.right.value) continue;
      local += rule.weight;
      fired += 1;
    }
    if (fired > 0) {
      score += local;
      used = true;
    }
  }
  return Object.freeze({
    score: used ? score : null,
    used,
    known: knownFeatureCount(self),
    allUnknown: knownFeatureCount(self) === 0,
  });
}

export function pickScoredReading(atoms, neighbors, provider) {
  let best = atoms[0];
  let bestScore = -Infinity;
  let any = false;
  const rows = [];
  for (const atom of atoms) {
    const lemma = String(atom.token || '').toLowerCase();
    const row = scoreLexicalReading({ lemma, type: atom.type, neighbors, provider });
    rows.push({ type: atom.type, ...row });
    if (row.score == null) continue;
    any = true;
    if (row.score > bestScore) {
      bestScore = row.score;
      best = atom;
    }
  }
  return Object.freeze({
    pick: any ? best : atoms[0],
    abstained: !any,
    rows: Object.freeze(rows),
  });
}

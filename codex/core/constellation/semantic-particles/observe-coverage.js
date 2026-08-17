/**
 * Observe-only coverage of lexical senses, compositional structures,
 * and T1 correspondence readiness. Does not rank. Does not admit bonds.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/observe-coverage
 */

import { featuresFor } from './feature-provider.js';
import { knownFeatureCount } from './experimental-inventory.js';
import { projectRelation, scoreLexicalReading } from './feature-score.js';
import { sensesFor } from './lexical-semantics.js';
import { composeMeanings } from './compositional-semantics.js';

export function rolesComplete(rule, roles = {}) {
  if (rule === 'clause-predication') {
    return Boolean(roles.Event && (roles.Agent || roles.Experiencer));
  }
  if (rule === 'object-predication') {
    return Boolean(roles.Event && (roles.Theme || roles.Stimulus || roles.Patient));
  }
  if (rule === 'intersective-modification') {
    return Boolean(roles.Entity && roles.Property);
  }
  if (rule === 'determination') return Boolean(roles.Entity && roles.Determiner);
  if (rule === 'adposition') return Boolean(roles.Relatum && roles.Relator);
  if (rule === 'copular-predication') return Boolean(roles.Event && roles.State);
  if (rule === 'adverbial-modification') return Boolean(roles.Event && roles.Adverbial);
  if (rule === 'compound-nominal') return Boolean(roles.Entity && roles.Modifier);
  if (rule === 'nominal-adjunction' || rule === 'relative-adjunction' || rule === 'infinitival-adjunction') {
    return Boolean(roles.Entity && roles.Adjunct);
  }
  if (rule === 'verbal-adjunction') return Boolean(roles.Event && roles.Adjunct);
  if (rule === 'infinitival-composition' || rule === 'auxiliary-composition' || rule === 'relativization' || rule === 'subordination') {
    return Boolean(roles.Event && roles.Marker);
  }
  if (rule === 'coordination') return Boolean(roles.Conjunct);
  return false;
}

export function observeAtomCoverage({ lemma, type }, lexicon, provider) {
  const senses = sensesFor(lemma, type, lexicon);
  const known = knownFeatureCount(featuresFor(lemma, type, provider));
  return Object.freeze({
    lemma,
    type,
    senseHit: senses.length > 0,
    senseCount: senses.length,
    featureHit: known > 0,
    known,
    lexicalAny: senses.length > 0 || known > 0,
  });
}

function starvationOf(named, complete, unknown) {
  if (!named) return 'compositional';
  if (unknown) return 'lexical';
  if (!complete) return 'compositional';
  return null;
}

export function observeDerivationCoverage(leftMeaning, rightMeaning, bond) {
  const composed = composeMeanings(leftMeaning, rightMeaning, bond);
  const top = composed.readings[0] || {};
  const named = composed.rule !== 'uninterpreted-bond';
  const complete = rolesComplete(composed.rule, top.roles || {});
  const unknown = Boolean(top.unknown);
  return Object.freeze({
    rule: composed.rule,
    named,
    complete,
    unknown,
    roles: top.roles || Object.freeze({}),
    starvation: starvationOf(named, complete, unknown),
  });
}

function neighborKnown(lemma, type, provider) {
  return knownFeatureCount(featuresFor(lemma, type, provider)) > 0;
}

export function diagnoseT1Edge(self, neighbor, provider) {
  const relation = projectRelation(self.type, neighbor.type, neighbor.side || 'right');
  if (!relation) {
    return Object.freeze({ relation: null, status: 'no-relation', score: null });
  }
  const scored = scoreLexicalReading({
    lemma: self.lemma,
    type: self.type,
    neighbors: [neighbor],
    provider,
  });
  if (scored.used) {
    return Object.freeze({ relation, status: 'could-fire', score: scored.score });
  }
  const selfLit = scored.known > 0;
  const otherLit = neighborKnown(neighbor.lemma, neighbor.type, provider);
  if (selfLit !== otherLit) {
    return Object.freeze({ relation, status: 'one-side-missing', score: null });
  }
  if (!selfLit && !otherLit) {
    return Object.freeze({ relation, status: 'both-missing', score: null });
  }
  return Object.freeze({ relation, status: 'no-correspondence', score: null });
}

export function summarizeObserveCoverage(raw) {
  const amb = Number(raw.ambiguousAtoms) || 0;
  const deriv = Number(raw.derivations) || 0;
  const edges = Number(raw.t1Edges) || 0;
  const rate = (n, d) => (d > 0 ? n / d : 0);
  return Object.freeze({
    senseRate: rate(raw.senseHits, amb),
    featureRate: rate(raw.featureHits, amb),
    namedRate: rate(raw.namedDerivations, deriv),
    completeRate: rate(raw.completeDerivations, deriv),
    t1FireRate: rate(raw.t1CouldFire, edges),
    t1MissingSideRate: rate(raw.t1OneSideMissing, edges),
    lexicalStarvation: raw.lexicalStarvation || 0,
    compositionalStarvation: raw.compositionalStarvation || 0,
  });
}



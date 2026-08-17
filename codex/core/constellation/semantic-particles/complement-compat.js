/**
 * Phase 8 — relation-keyed complement COMPAT.
 *
 * Not a generic feature matcher. Governor class × complement class,
 * scoped to INFINITIVAL_COMPLEMENT and PROPOSITIONAL_COMPLEMENT.
 * UNKNOWN abstains. illegal is always false.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/complement-compat
 */

import { UNKNOWN } from './feature-provider.js';
import { knownFeatureCount } from './experimental-inventory.js';

export const COMPLEMENT_COMPAT_VERSION = '1.0.0';

export const COMPLEMENT_COMPAT_RELATIONS = Object.freeze([
  'INFINITIVAL_COMPLEMENT',
  'PROPOSITIONAL_COMPLEMENT',
]);

export const GOVERNOR_CLASSES = Object.freeze([
  'cognition', 'communication', 'perception', 'creation',
  'state', 'motion', 'possession', 'change',
]);

export const COMPLEMENT_CLASSES = Object.freeze([
  'infinitival-event',
  'abstract-proposition',
]);

export const EVENT_KIND_TO_GOVERNOR_CLASS = Object.freeze({
  'event.cognition': 'cognition',
  'event.communication': 'communication',
  'event.perception': 'perception',
  'event.creation': 'creation',
  'event.state': 'state',
  'event.motion': 'motion',
  'event.possession': 'possession',
  'event.change': 'change',
});

export const COMPLEMENT_KIND_BY_CLASS = Object.freeze({
  'infinitival-event': 'function.infinitival',
  'abstract-proposition': 'entity.abstract',
});

export const COMPLEMENT_COMPAT = Object.freeze({
  INFINITIVAL_COMPLEMENT: Object.freeze([
    Object.freeze({ governor: 'cognition', complement: 'infinitival-event', weight: 2 }),
    Object.freeze({ governor: 'communication', complement: 'infinitival-event', weight: 2 }),
    Object.freeze({ governor: 'creation', complement: 'infinitival-event', weight: 1.5 }),
    Object.freeze({ governor: 'perception', complement: 'infinitival-event', weight: 1.5 }),
    Object.freeze({ governor: 'state', complement: 'infinitival-event', weight: 1.5 }),
  ]),
  PROPOSITIONAL_COMPLEMENT: Object.freeze([
    Object.freeze({ governor: 'cognition', complement: 'abstract-proposition', weight: 2 }),
    Object.freeze({ governor: 'communication', complement: 'abstract-proposition', weight: 2 }),
    Object.freeze({ governor: 'perception', complement: 'abstract-proposition', weight: 1.5 }),
  ]),
});

function valueOf(features, kind) {
  const row = (features || []).find((f) => f.kind === kind);
  if (!row || row.value === UNKNOWN || row.confidence == null) return null;
  return row.value;
}

export function isComplementRelation(relation) {
  return COMPLEMENT_COMPAT_RELATIONS.includes(relation);
}

export function governorClasses(features) {
  const out = [];
  for (const [kind, cls] of Object.entries(EVENT_KIND_TO_GOVERNOR_CLASS)) {
    if (valueOf(features, kind) === true) out.push(cls);
  }
  return out.length ? out : [UNKNOWN];
}

export function complementClass(features, relation) {
  if (relation === 'INFINITIVAL_COMPLEMENT') {
    return valueOf(features, 'function.infinitival') === true ? 'infinitival-event' : UNKNOWN;
  }
  if (relation === 'PROPOSITIONAL_COMPLEMENT') {
    return valueOf(features, 'entity.abstract') === true ? 'abstract-proposition' : UNKNOWN;
  }
  return UNKNOWN;
}

export function lookupComplementCompat(relation, govClass, compClass) {
  if (!isComplementRelation(relation)) return null;
  if (govClass === UNKNOWN || compClass === UNKNOWN) return null;
  const rows = COMPLEMENT_COMPAT[relation] || [];
  return rows.find((r) => r.governor === govClass && r.complement === compClass) || null;
}

export function scoreComplementCompat({ leftFeats, rightFeats, relation }) {
  const govs = governorClasses(leftFeats);
  const comp = complementClass(rightFeats, relation);
  let score = 0;
  let fired = 0;
  if (isComplementRelation(relation)) {
    for (const gov of govs) {
      const hit = lookupComplementCompat(relation, gov, comp);
      if (!hit) continue;
      score += hit.weight;
      fired += 1;
    }
  }
  const mappingAvailable = isComplementRelation(relation)
    && (COMPLEMENT_COMPAT[relation] || []).some((row) => {
      const gk = Object.entries(EVENT_KIND_TO_GOVERNOR_CLASS).find(([, c]) => c === row.governor)?.[0];
      const ck = COMPLEMENT_KIND_BY_CLASS[row.complement];
      return gk && ck && valueOf(leftFeats, gk) != null && valueOf(rightFeats, ck) != null;
    });
  return Object.freeze({
    score,
    fired,
    illegal: false,
    governorClasses: Object.freeze(govs),
    complementClass: comp,
    mappingAvailable,
    abstained: fired === 0,
  });
}

export function diagnoseComplementMapping({ leftFeats, rightFeats, relation }) {
  const relationExists = isComplementRelation(relation);
  const bothValuesExist = knownFeatureCount(leftFeats) > 0 && knownFeatureCount(rightFeats) > 0;
  const mappingExists = relationExists && (COMPLEMENT_COMPAT[relation] || []).length > 0;
  const scored = scoreComplementCompat({ leftFeats, rightFeats, relation });
  const mappingFires = scored.fired > 0;
  return Object.freeze({
    relationExists,
    bothValuesExist,
    mappingExists,
    mappingFires,
    mappingAbstains: bothValuesExist && mappingExists && !mappingFires,
    governorClasses: scored.governorClasses,
    complementClass: scored.complementClass,
  });
}

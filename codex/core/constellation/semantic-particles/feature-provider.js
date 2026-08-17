/**
 * T1 — TYPED SEMANTIC MICROFEATURE LATTICE
 *
 * A bounded, authored feature schema attached to lexical atoms after the
 * chart freezes. UNKNOWN is not false. Contradiction cannot reject a bond.
 *
 * PURE AND ZERO-I/O. No chart I/O. The atomizer receives a preloaded provider.
 *
 * @module codex/core/constellation/semantic-particles/feature-provider
 */

import { internParticle } from './schema.js';

export const FEATURE_SCHEMA_VERSION = '1.0.0';
export const UNKNOWN = 'UNKNOWN';

export const FEATURE_DIMENSIONS = Object.freeze({
  'entity.exists': Object.freeze(['true', 'false']),
  'entity.animacy': Object.freeze(['animate', 'inanimate']),
  'entity.concreteness': Object.freeze(['concrete', 'abstract']),
  'entity.human': Object.freeze(['true', 'false']),
  'entity.countability': Object.freeze(['countable', 'mass']),
  'entity.proper': Object.freeze(['true', 'false']),
  'event.exists': Object.freeze(['true', 'false']),
  'event.motion': Object.freeze(['true', 'false']),
  'event.changeOfState': Object.freeze(['true', 'false']),
  'event.communication': Object.freeze(['true', 'false']),
  'event.perception': Object.freeze(['true', 'false']),
  'event.causation': Object.freeze(['true', 'false']),
  'event.aspect': Object.freeze(['stative', 'dynamic']),
  'event.volition': Object.freeze(['true', 'false']),
  'property.exists': Object.freeze(['true', 'false']),
  'property.dimension': Object.freeze(['color', 'size', 'quality', 'quantity', 'shape']),
  'property.polarity': Object.freeze(['positive', 'negative']),
  'role.capacity': Object.freeze(['Agent', 'Theme', 'Experiencer', 'Location']),
  'time.deixis': Object.freeze(['past', 'present', 'future']),
  'space.direction': Object.freeze(['source', 'goal', 'path']),
  'space.location': Object.freeze(['true', 'false']),
  'quantity.magnitude': Object.freeze(['small', 'large']),
  'social.institution': Object.freeze(['true', 'false']),
  'artifact.tool': Object.freeze(['true', 'false']),
  'mental.content': Object.freeze(['true', 'false']),
  'discourse.connective': Object.freeze(['true', 'false']),
  'force.physical': Object.freeze(['true', 'false']),
  'substance.material': Object.freeze(['true', 'false']),
});

export const FEATURE_INHERITANCE = Object.freeze({
  'entity.animacy:animate': Object.freeze(['entity.exists:true']),
  'entity.human:true': Object.freeze(['entity.animacy:animate', 'entity.exists:true']),
  'event.motion:true': Object.freeze(['event.exists:true']),
  'event.communication:true': Object.freeze(['event.exists:true']),
  'property.dimension:color': Object.freeze(['property.exists:true']),
  'property.dimension:quality': Object.freeze(['property.exists:true']),
  'property.dimension:shape': Object.freeze(['property.exists:true']),
});

function boolish(value) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
}

/**
 * Integration fixture only. Not an experimental ontology.
 * Type overrides use `lemma::TYPE`.
 */
export const MICROFEATURE_SMOKE_SEED = Object.freeze({
  man: Object.freeze({
    'entity.exists': true,
    'entity.animacy': 'animate',
    'entity.concreteness': 'concrete',
    'entity.human': true,
    'entity.countability': 'countable',
  }),
  men: Object.freeze({
    'entity.exists': true,
    'entity.animacy': 'animate',
    'entity.concreteness': 'concrete',
    'entity.human': true,
    'entity.countability': 'countable',
  }),
  cat: Object.freeze({
    'entity.exists': true,
    'entity.animacy': 'animate',
    'entity.concreteness': 'concrete',
    'entity.human': false,
    'entity.countability': 'countable',
  }),
  idea: Object.freeze({
    'entity.exists': true,
    'entity.concreteness': 'abstract',
    'mental.content': true,
  }),
  ran: Object.freeze({
    'event.exists': true,
    'event.motion': true,
    'event.aspect': 'dynamic',
    'event.volition': true,
  }),
  run: Object.freeze({
    'event.exists': true,
    'event.motion': true,
    'event.aspect': 'dynamic',
    'event.volition': true,
  }),
  old: Object.freeze({
    'property.exists': true,
    'property.dimension': 'quality',
  }),
  dark: Object.freeze({
    'property.exists': true,
    'property.dimension': 'color',
  }),
  'round::V': Object.freeze({
    'event.exists': true,
    'event.motion': true,
    'event.aspect': 'dynamic',
  }),
  'round::N': Object.freeze({
    'entity.exists': true,
    'entity.concreteness': 'concrete',
    'property.exists': true,
    'property.dimension': 'shape',
  }),
  'round::ADJ': Object.freeze({
    'property.exists': true,
    'property.dimension': 'quality',
  }),
  'round::ADV': Object.freeze({
    'space.direction': 'path',
  }),
});

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function lookupSeed(map, lemma, type) {
  const typed = map[`${lemma}::${type}`];
  const typedDefault = type ? map[`*::${type}`] : null;
  const bare = map[lemma];
  if (typed && typedDefault) return { ...typedDefault, ...typed };
  return typed || typedDefault || bare || null;
}

export function createFeatureProvider(seedMap = MICROFEATURE_SMOKE_SEED, options = {}) {
  const map = Object.create(null);
  for (const [key, values] of Object.entries(seedMap || {})) {
    map[key] = Object.freeze({ ...values });
  }
  const dimensions = options.dimensions || FEATURE_DIMENSIONS;
  return Object.freeze({
    version: options.version || FEATURE_SCHEMA_VERSION,
    role: options.role || 'smoke',
    dimensions: Object.freeze({ ...dimensions }),
    seed: Object.freeze(map),
  });
}

export const DEFAULT_FEATURE_PROVIDER = createFeatureProvider();

export function dimensionKeys(provider) {
  return Object.keys(provider?.dimensions || FEATURE_DIMENSIONS).sort();
}

export function featuresFor(lemma, type, provider = DEFAULT_FEATURE_PROVIDER) {
  const key = String(lemma || '').toLowerCase();
  const assigned = lookupSeed(provider?.seed || {}, key, type) || {};
  const particles = dimensionKeys(provider).map((kind) => {
    const raw = Object.prototype.hasOwnProperty.call(assigned, kind)
      ? boolish(assigned[kind])
      : UNKNOWN;
    const known = raw !== UNKNOWN;
    return internParticle({
      scope: 'LEXICAL',
      kind,
      value: raw,
      polarity: 'OBSERVE',
      confidence: known ? 1 : null,
      evidence: known
        ? [{ source: 'authored-seed', ref: key, type: type || null }]
        : [{ source: 'authored-seed', ref: 'absent' }],
      provenance: [],
      permissions: ['OBSERVE'],
      createdBy: 'authoredRule',
      corpusHash: null,
    });
  });
  return Object.freeze(particles);
}

export function compatibility(leftFeatures, rightFeatures) {
  const rightByKind = new Map((rightFeatures || []).map((f) => [f.kind, f]));
  let agreements = 0;
  let contradictions = 0;
  let abstentions = 0;
  for (const left of leftFeatures || []) {
    const right = rightByKind.get(left.kind);
    if (!right) {
      abstentions += 1;
      continue;
    }
    const lUnknown = left.value === UNKNOWN || left.confidence == null;
    const rUnknown = right.value === UNKNOWN || right.confidence == null;
    if (lUnknown || rUnknown) {
      abstentions += 1;
      continue;
    }
    if (left.value === right.value) agreements += 1;
    else contradictions += 1;
  }
  let verdict = 'unknown';
  if (contradictions > 0 && agreements > 0) verdict = 'contested';
  else if (contradictions > 0) verdict = 'incompatible';
  else if (agreements > 0) verdict = 'compatible';
  return Object.freeze({
    agreements,
    contradictions,
    abstentions,
    verdict,
  });
}

/**
 * Within-dimension derangement that preserves known-count per lemma and
 * the multiset of values on each dimension.
 */
export function derangeFeatureValues(provider, seed) {
  const src = provider?.seed || {};
  const keys = Object.keys(src).sort();
  const next = Object.create(null);
  for (const key of keys) next[key] = { ...src[key] };
  const dims = dimensionKeys(provider);

  const rand = lcg(seed >>> 0);
  for (const dim of dims) {
    const holders = keys.filter((key) => Object.prototype.hasOwnProperty.call(src[key], dim));
    if (holders.length < 2) continue;
    const values = holders.map((key) => src[key][dim]);
    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = values[i];
      values[i] = values[j];
      values[j] = tmp;
    }
    // A pure shuffle can be the identity. Rotate once if so, so the
    // correspondence actually breaks while the multiset stays put.
    const identical = values.every((value, i) => value === src[holders[i]][dim]);
    if (identical) values.push(values.shift());
    holders.forEach((key, i) => {
      next[key][dim] = values[i];
    });
  }

  // Guarantee every lemma that *can* change does: swap one dimension with a
  // partner that holds a different legal value. Marginals stay a permutation.
  for (const key of keys) {
    const changed = dims.some((dim) => next[key][dim] !== src[key][dim]);
    if (changed) continue;
    for (const dim of dims) {
      if (!Object.prototype.hasOwnProperty.call(src[key], dim)) continue;
      const partner = keys.find((other) => (
        other !== key
        && Object.prototype.hasOwnProperty.call(next[other], dim)
        && next[other][dim] !== next[key][dim]
      ));
      if (!partner) continue;
      const tmp = next[key][dim];
      next[key][dim] = next[partner][dim];
      next[partner][dim] = tmp;
      break;
    }
  }
  return createFeatureProvider(next, {
    version: provider?.version,
    role: provider?.role === 'experimental' ? 'experimental-deranged' : 'smoke-deranged',
    dimensions: provider?.dimensions || FEATURE_DIMENSIONS,
  });
}

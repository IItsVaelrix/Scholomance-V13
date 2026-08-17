/**
 * LEXICAL SEMANTICS
 *
 * Word-level senses, synonym classes, polysemy, and proto-role frames.
 * A missing lemma abstains. A type-conditioned feature bag is not a sense
 * inventory: two meanings of the same lemma::TYPE are two senses.
 *
 * PURE AND ZERO-I/O. No gold syntax. No ADMIT_BOND.
 *
 * @module codex/core/constellation/semantic-particles/lexical-semantics
 */

import { classifyLemma } from './experimental-inventory.js';

export const LEXICAL_SEMANTICS_VERSION = '1.0.0';

const SEMANTIC_ROLES = Object.freeze([
  'Agent', 'Theme', 'Patient', 'Experiencer', 'Stimulus',
  'Recipient', 'Location', 'Instrument', 'Path',
]);

function freezeSense(raw, lemma, type) {
  return Object.freeze({
    id: raw.id,
    lemma,
    type,
    synset: raw.synset || null,
    features: Object.freeze({ ...(raw.features || {}) }),
    frame: raw.frame
      ? Object.freeze({
        roles: Object.freeze([...(raw.frame.roles || [])]),
        optional: Object.freeze([...(raw.frame.optional || [])]),
      })
      : null,
  });
}

export function createLexicalLexicon(entries = {}, options = {}) {
  const senses = Object.create(null);
  const bySynset = new Map();
  for (const [key, list] of Object.entries(entries || {})) {
    const split = key.indexOf('::');
    const lemma = split >= 0 ? key.slice(0, split) : key;
    const type = split >= 0 ? key.slice(split + 2) : '';
    const frozen = (list || []).map((row) => freezeSense(row, lemma, type));
    senses[key] = Object.freeze(frozen);
    for (const sense of frozen) {
      if (!sense.synset) continue;
      const bucket = bySynset.get(sense.synset) || new Set();
      bucket.add(lemma);
      bySynset.set(sense.synset, bucket);
    }
  }
  const synsetIndex = Object.create(null);
  for (const [id, members] of bySynset) {
    synsetIndex[id] = Object.freeze([...members].sort());
  }
  return Object.freeze({
    version: LEXICAL_SEMANTICS_VERSION,
    classFallback: Boolean(options.classFallback),
    senses: Object.freeze(senses),
    synsets: Object.freeze(synsetIndex),
  });
}

function compileDefaultLexicon() {
  return createLexicalLexicon({
    'bank::N': [
      {
        id: 'bank.n.money',
        synset: 'financial-institution',
        features: {
          'entity.organization': true,
          'entity.abstract': true,
          'entity.location': false,
          'entity.concrete': false,
        },
      },
      {
        id: 'bank.n.river',
        synset: 'river-edge',
        features: {
          'entity.location': true,
          'entity.concrete': true,
          'entity.organization': false,
          'role.locationCapable': true,
        },
      },
    ],
    'cat::N': [
      {
        id: 'cat.n.animal',
        synset: 'felid',
        features: {
          'entity.animal': true,
          'entity.animate': true,
          'entity.concrete': true,
          'entity.human': false,
          'role.experiencerCapable': true,
        },
      },
    ],
    'feline::N': [
      {
        id: 'feline.n.animal',
        synset: 'felid',
        features: {
          'entity.animal': true,
          'entity.animate': true,
          'entity.concrete': true,
          'entity.human': false,
          'role.experiencerCapable': true,
        },
      },
    ],
    'man::N': [
      {
        id: 'man.n.human',
        synset: 'adult-human',
        features: {
          'entity.human': true,
          'entity.animate': true,
          'entity.concrete': true,
          'role.agentCapable': true,
          'role.experiencerCapable': true,
        },
        frame: { roles: [], optional: ['Agent', 'Experiencer'] },
      },
    ],
    'men::N': [
      {
        id: 'men.n.human',
        synset: 'adult-human',
        features: {
          'entity.human': true,
          'entity.animate': true,
          'entity.concrete': true,
          'role.agentCapable': true,
          'role.experiencerCapable': true,
        },
        frame: { roles: [], optional: ['Agent', 'Experiencer'] },
      },
    ],
    'run::V': [
      {
        id: 'run.v.motion',
        synset: 'fast-motion',
        features: { 'event.motion': true, 'event.state': false },
        frame: { roles: ['Agent'], optional: ['Path'] },
      },
    ],
    'ran::V': [
      {
        id: 'ran.v.motion',
        synset: 'fast-motion',
        features: { 'event.motion': true, 'event.state': false },
        frame: { roles: ['Agent'], optional: ['Path'] },
      },
    ],
    'sprint::V': [
      {
        id: 'sprint.v.motion',
        synset: 'fast-motion',
        features: { 'event.motion': true },
        frame: { roles: ['Agent'], optional: ['Path'] },
      },
    ],
    'see::V': [
      {
        id: 'see.v.perceive',
        synset: 'visual-perception',
        features: { 'event.perception': true, 'event.motion': false },
        frame: { roles: ['Experiencer', 'Stimulus'] },
      },
    ],
    'saw::V': [
      {
        id: 'saw.v.perceive',
        synset: 'visual-perception',
        features: { 'event.perception': true, 'event.motion': false },
        frame: { roles: ['Experiencer', 'Stimulus'] },
      },
    ],
    'give::V': [
      {
        id: 'give.v.transfer',
        synset: 'transfer-possession',
        features: { 'event.possession': true, 'event.motion': false },
        frame: { roles: ['Agent', 'Theme', 'Recipient'] },
      },
    ],
    'old::ADJ': [
      {
        id: 'old.a.age',
        synset: 'aged',
        features: { 'property.age': true, 'property.color': false },
      },
    ],
    'steep::ADJ': [
      {
        id: 'steep.a.slope',
        synset: 'inclined',
        features: { 'property.physicalState': true, 'entity.location': true },
      },
    ],
    'federal::ADJ': [
      {
        id: 'federal.a.institutional',
        synset: 'governmental',
        features: { 'entity.organization': true, 'entity.abstract': true },
      },
    ],
  }, { classFallback: true });
}

export const DEFAULT_LEXICAL_LEXICON = compileDefaultLexicon();

const TYPE_ALIASES = Object.freeze({
  NP: Object.freeze(['NP', 'N', 'PROPN', 'PRON', 'PRONACC']),
  NPO: Object.freeze(['NPO', 'N', 'PRONACC', 'PRON']),
  NC: Object.freeze(['NC', 'N']),
  VP: Object.freeze(['VP', 'V']),
});

function frameFromFeatures(type, features) {
  const verbal = type === 'V' || type === 'VP';
  if (!verbal) return null;
  if (features['event.perception']) return { roles: ['Experiencer', 'Stimulus'] };
  if (features['event.communication'] || features['event.possession'] || features['event.creation']) {
    return { roles: ['Agent', 'Theme'] };
  }
  if (features['event.cognition']) return { roles: ['Experiencer'] };
  if (features['event.motion'] || features['event.change']) return { roles: ['Agent'] };
  return { roles: ['Agent'] };
}

function classSense(lemma, type, features) {
  return freezeSense({
    id: `${lemma}.${String(type || 'x').toLowerCase()}.class`,
    synset: null,
    features,
    frame: frameFromFeatures(type, features),
  }, lemma, type);
}

export function sensesFor(lemma, type, lexicon = DEFAULT_LEXICAL_LEXICON) {
  const L = String(lemma || '').toLowerCase();
  const key = `${L}::${type || ''}`;
  const hit = lexicon?.senses?.[key];
  if (hit) return hit;
  if (!lexicon?.classFallback) return Object.freeze([]);
  const types = TYPE_ALIASES[type] || [type];
  for (const candidate of types) {
    const feats = classifyLemma(L, candidate);
    if (feats) return Object.freeze([classSense(L, type, feats)]);
  }
  return Object.freeze([]);
}

export function polysemyCount(lemma, type, lexicon = DEFAULT_LEXICAL_LEXICON) {
  return sensesFor(lemma, type, lexicon).length;
}

export function synsetMembers(synsetId, lexicon = DEFAULT_LEXICAL_LEXICON) {
  return lexicon?.synsets?.[synsetId] ? lexicon.synsets[synsetId] : Object.freeze([]);
}

export function areSynonyms(lemmaA, typeA, lemmaB, typeB, lexicon = DEFAULT_LEXICAL_LEXICON) {
  const left = sensesFor(lemmaA, typeA, lexicon);
  const right = sensesFor(lemmaB, typeB, lexicon);
  if (left.length === 0 || right.length === 0) return false;
  const rightSets = new Set(right.map((s) => s.synset).filter(Boolean));
  return left.some((s) => s.synset && rightSets.has(s.synset));
}

export function roleFrame(lemma, type, lexicon = DEFAULT_LEXICAL_LEXICON) {
  const senses = sensesFor(lemma, type, lexicon);
  const framed = senses.find((s) => s.frame && s.frame.roles && s.frame.roles.length);
  return framed ? framed.frame : null;
}

export { SEMANTIC_ROLES };

/**
 * Remaining-UNKNOWN buckets.
 *
 * A key is a lemma::TYPE the current substrate still scores as all-UNKNOWN.
 * This module does not decide whether a particle should exist. It only says
 * why the key is unknown, so later arms do not teach the semantic layer to
 * score a candidate the atomizer should not have emitted.
 *
 * PURE AND ZERO-I/O. No gold values. No TEST.
 *
 * @module codex/core/constellation/semantic-particles/unknown-remainder
 */

import {
  AUXILIARIES,
  CONJUNCTIONS,
  COPULAS,
  DETERMINERS,
  INTERROGATIVE_ADVERBS,
  MODALS,
  PARTICLES,
  PREPOSITION_CUES,
  PRONOUNS,
  RELATIVIZERS,
  SUBORDINATORS,
} from '../../lexical-analysis/closed-class.js';


export const UNKNOWN_BUCKETS = Object.freeze({
  A_FUNCTION: 'A_FUNCTION',
  B_CONTENT: 'B_CONTENT',
  C_SPURIOUS: 'C_SPURIOUS',
  UNCERTAIN: 'UNCERTAIN',
});

const FUNCTION_TYPES = new Set([
  'P', 'TO', 'PRT', 'DET', 'REL', 'AUX', 'COP', 'PRON', 'PRONACC',
  'POSS', 'CONJ', 'SUB', 'THAN', 'MODAL', 'PUNCT', 'COMMA',
]);

const CONTENT_TYPES = new Set([
  'N', 'V', 'ADJ', 'ADV', 'PROPN', 'NC', 'NP', 'NPO', 'VP',
]);

/**
 * Degree / locative / connective adverbs. These are systematic, not a
 * lemma-by-lemma ontology problem.
 */
const DISCOURSE_ADV = new Set([
  'so', 'then', 'just', 'well', 'now', 'also', 'too', 'even', 'only',
  'not', 'never', 'always', 'here', 'there', 'thus', 'therefore',
  'however', 'instead', 'else', 'rather', 'quite', 'still', 'yet',
  'already', 'again', 'once', 'ever', 'maybe', 'perhaps', 'indeed',
  'anyway', 'ago', 'very', 'really', 'actually', 'almost', 'enough',
]);

/** Discourse words that are not nouns or verbs in any ordinary reading. */
const NEVER_NOMINAL_OR_VERBAL = new Set([
  'so', 'then', 'also', 'too', 'even', 'not', 'never', 'always',
  'thus', 'therefore', 'however', 'instead', 'else', 'quite',
  'already', 'again', 'ever', 'maybe', 'perhaps', 'indeed',
  'anyway', 'ago', 'very', 'really', 'actually', 'almost',
  'here', 'there',
]);

/** Discourse words that are not adjectives. just/only/still/well can be. */
const NEVER_ADJECTIVAL = new Set([
  'so', 'then', 'also', 'too', 'not', 'never', 'always', 'here', 'there',
  'thus', 'therefore', 'however', 'instead', 'else', 'already', 'again',
  'ever', 'maybe', 'perhaps', 'indeed', 'anyway', 'ago', 'very', 'really',
  'actually', 'almost', 'now',
]);

const LOOKUP_TYPES = Object.freeze([
  'N', 'V', 'ADJ', 'ADV', 'PROPN',
  'P', 'TO', 'PRT', 'DET', 'REL', 'AUX', 'COP', 'PRON', 'PRONACC',
  'POSS', 'CONJ', 'SUB', 'THAN', 'MODAL',
]);

function row(bucket, reason, action) {
  return Object.freeze({ bucket, reason, action });
}

function isTokenizerArtifact(lemma) {
  if (!lemma) return true;
  if (/^[.!?…;:,]+$/.test(lemma)) return true;
  if (/^https?:/.test(lemma) || /^www\./.test(lemma)) return true;
  if (/@/.test(lemma) || /^\d+$/.test(lemma)) return true;
  if (/^[^a-z0-9']+$/i.test(lemma)) return true;
  return false;
}

function closedForContent(lemma) {
  return DETERMINERS.has(lemma)
    || PREPOSITION_CUES.has(lemma)
    || CONJUNCTIONS.has(lemma)
    || RELATIVIZERS.has(lemma)
    || SUBORDINATORS.has(lemma)
    || COPULAS.has(lemma)
    || MODALS.has(lemma)
    || PRONOUNS.has(lemma)
    || lemma === 'to'
    || lemma === 'than';
}

export function classifyUnknownKey({ lemma, type } = {}) {
  const L = String(lemma || '').toLowerCase();
  const t = String(type || '');

  if (t === 'PROPN') {
    if (L.length <= 1) {
      return row(UNKNOWN_BUCKETS.C_SPURIOUS, 'single-letter-propn', 'fix-emission');
    }
    if (
      PRONOUNS.has(L)
      || DETERMINERS.has(L)
      || AUXILIARIES.has(L)
      || CONJUNCTIONS.has(L)
      || RELATIVIZERS.has(L)
    ) {
      return row(UNKNOWN_BUCKETS.C_SPURIOUS, 'closed-class-propn', 'fix-emission');
    }
  }

  if (FUNCTION_TYPES.has(t)) {
    return row(UNKNOWN_BUCKETS.A_FUNCTION, 'function-type', 'type-default');
  }

  if (t === 'ADV' && (INTERROGATIVE_ADVERBS.has(L) || DISCOURSE_ADV.has(L) || PARTICLES.has(L))) {
    return row(UNKNOWN_BUCKETS.A_FUNCTION, 'discourse-adverb', 'type-default');
  }

  if (isTokenizerArtifact(L) && CONTENT_TYPES.has(t)) {
    return row(UNKNOWN_BUCKETS.C_SPURIOUS, 'tokenizer-artifact', 'fix-emission');
  }

  if (PARTICLES.has(L) && (t === 'N' || t === 'ADJ')) {
    return row(UNKNOWN_BUCKETS.C_SPURIOUS, 'particle-as-content', 'fix-emission');
  }

  if (NEVER_NOMINAL_OR_VERBAL.has(L) && (t === 'N' || t === 'V')) {
    return row(UNKNOWN_BUCKETS.C_SPURIOUS, 'discourse-as-content', 'fix-emission');
  }

  if (NEVER_ADJECTIVAL.has(L) && t === 'ADJ') {
    return row(UNKNOWN_BUCKETS.C_SPURIOUS, 'discourse-as-adjective', 'fix-emission');
  }

  if (INTERROGATIVE_ADVERBS.has(L) && (t === 'N' || t === 'V' || t === 'ADJ' || t === 'PROPN')) {
    return row(UNKNOWN_BUCKETS.C_SPURIOUS, 'interrogative-as-content', 'fix-emission');
  }

  if (closedForContent(L) && (t === 'N' || t === 'V' || t === 'ADJ' || t === 'ADV' || t === 'PROPN')) {
    if (t === 'ADV' && SUBORDINATORS.has(L)) {
      return row(UNKNOWN_BUCKETS.A_FUNCTION, 'subordinator-adverb', 'type-default');
    }
    return row(UNKNOWN_BUCKETS.C_SPURIOUS, 'closed-class-content', 'fix-emission');
  }

  if (CONTENT_TYPES.has(t)) {
    return row(UNKNOWN_BUCKETS.B_CONTENT, 'legitimate-content', 'train-enrichment');
  }

  return row(UNKNOWN_BUCKETS.UNCERTAIN, 'unclassified-type', 'review');
}

function seedHas(provider, lemma, type) {
  const seed = provider?.seed || {};
  return Boolean(seed[`${lemma}::${type}`] || seed[lemma]);
}

function functionMemberships(lemma) {
  const hits = [];
  if (PREPOSITION_CUES.has(lemma)) hits.push('P');
  if (lemma === 'to') hits.push('TO');
  if (PARTICLES.has(lemma)) hits.push('PRT');
  if (DETERMINERS.has(lemma)) hits.push('DET');
  if (RELATIVIZERS.has(lemma)) hits.push('REL');
  if (AUXILIARIES.has(lemma)) hits.push('AUX');
  if (COPULAS.has(lemma)) hits.push('COP');
  if (PRONOUNS.has(lemma)) hits.push('PRON');
  if (lemma === "'s") hits.push('POSS');
  if (CONJUNCTIONS.has(lemma)) hits.push('CONJ');
  if (SUBORDINATORS.has(lemma)) hits.push('SUB');
  if (lemma === 'than') hits.push('THAN');
  if (MODALS.has(lemma)) hits.push('MODAL');
  return hits;
}

export function otherKnownTypes(lemma, type, provider) {
  const L = String(lemma || '').toLowerCase();
  const self = String(type || '');
  const others = [];
  for (const candidate of LOOKUP_TYPES) {
    if (candidate === self) continue;
    if (CONTENT_TYPES.has(candidate) && seedHas(provider, L, candidate)) {
      others.push(candidate);
    }
  }
  for (const candidate of functionMemberships(L)) {
    if (candidate !== self && !others.includes(candidate)) others.push(candidate);
  }
  return Object.freeze(others);
}

export function noveltyKind(lemma, type, provider) {
  const others = otherKnownTypes(lemma, type, provider);
  const content = others.filter((candidate) => CONTENT_TYPES.has(candidate));
  const fn = others.filter((candidate) => FUNCTION_TYPES.has(candidate));
  if (content.length) return 'known-elsewhere-content';
  if (fn.length) return 'known-elsewhere-function';
  return 'novel';
}

export function summarizeUnknownBuckets(rows) {
  const byBucket = {
    A_FUNCTION: { mass: 0, keys: 0, share: 0 },
    B_CONTENT: { mass: 0, keys: 0, share: 0 },
    C_SPURIOUS: { mass: 0, keys: 0, share: 0 },
    UNCERTAIN: { mass: 0, keys: 0, share: 0 },
  };
  let totalMass = 0;
  const classified = [];
  for (const raw of rows || []) {
    const hit = classifyUnknownKey(raw);
    const mass = Number(raw.unknownMass) || 0;
    totalMass += mass;
    const bucket = byBucket[hit.bucket];
    bucket.mass += mass;
    bucket.keys += 1;
    classified.push({ ...raw, ...hit });
  }
  for (const bucket of Object.values(byBucket)) {
    bucket.share = totalMass > 0 ? bucket.mass / totalMass : 0;
  }
  return Object.freeze({
    totalMass,
    keys: classified.length,
    byBucket: Object.freeze({
      A_FUNCTION: Object.freeze(byBucket.A_FUNCTION),
      B_CONTENT: Object.freeze(byBucket.B_CONTENT),
      C_SPURIOUS: Object.freeze(byBucket.C_SPURIOUS),
      UNCERTAIN: Object.freeze(byBucket.UNCERTAIN),
    }),
    rows: Object.freeze(classified),
  });
}

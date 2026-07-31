/**
 * SEMANTOTOPOGRAPHY ENGINE — Semantic Topography Word Map
 *
 * The semantic equivalent of phonotopography.js.
 *
 * Phonotopography maps text → phonemes → 256-dim topographic vector.
 * Semantotopography maps text → semantic primitives → 256-dim topographic vector.
 *
 *   Band 0 (dims   0– 63): Semantic primitive distribution
 *   Band 1 (dims  64–127): Semantic bigram transitions (gravity-weighted)
 *   Band 2 (dims 128–191): Semantic topology (argument structure, abstraction)
 *   Band 3 (dims 192–255): Domain signature (cross-domain transitions, register)
 *
 * Key property: "determinism" and "reproducibility" produce SIMILAR vectors
 * (both activate CAUSE, NECESSARY, FACTUAL), while "determinism" and "democracy"
 * produce DISTANT vectors despite similar spelling.
 *
 * "render" and "draw" produce SIMILAR vectors (both activate CREATION, ACTION).
 * "render" and "surrender" produce DISTANT vectors despite shared substring.
 *
 * Pure, deterministic, zero I/O. PDR §18 Core-law compliant.
 */

import {
  SEMANTIC_INVENTORY,
  SEMANTIC_INDEX,
  SEMANTIC_FEATURES_V1,
  SEMANTIC_GRAVITY,
  SEMANTIC_DOMAINS,
  PRIMITIVE_TO_DOMAIN,
} from './semantic.constants.js';
import { quantizeVectorJS, estimateInnerProduct } from '../quantization/turboquant.js';
import { wordnetPrimitives } from './wordnet-senses.js';

// ── Deterministic hash for n-gram keys ───────────────────────────────────────

function fnv1aHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** The vector is four equal bands, normalized and scored independently. */
export const BAND_COUNT = 4;

/**
 * Own-property lookup for word-keyed maps.
 *
 * These maps are keyed by ordinary English words, and English contains
 * `constructor`, `toString`, `valueOf` and `name`. A bare `MAP[word]` walks the
 * prototype chain and returns `Object` — a Function — where an array of
 * primitives belongs, which then propagates into the vector as a spread over a
 * non-iterable.
 */
function ownEntry(map, key) {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

// ── Closed-class word → primitive mapping ────────────────────────────────────
// Analogous to the CMU dictionary: a direct, deterministic lookup table.
// These words have fixed semantic roles regardless of context.

const CLOSED_CLASS_MAP = Object.freeze({
  // Determiners / articles → ENTITY (referential)
  the: ['PHYS_OBJ'], a: ['PHYS_OBJ'], an: ['PHYS_OBJ'],
  this: ['PHYS_OBJ'], that: ['PHYS_OBJ'], these: ['PHYS_OBJ'], those: ['PHYS_OBJ'],

  // Personal pronouns → PERSON
  i: ['PERSON'], you: ['PERSON'], he: ['PERSON'], she: ['PERSON'],
  we: ['PERSON', 'GROUP'], they: ['PERSON', 'GROUP'],
  me: ['PERSON'], him: ['PERSON'], her: ['PERSON'], us: ['PERSON', 'GROUP'], them: ['PERSON', 'GROUP'],

  // Prepositions → SPATIAL_REL / TEMPORAL_REL
  in: ['SPATIAL_REL'], on: ['SPATIAL_REL'], at: ['SPATIAL_REL'],
  to: ['MOTION'], from: ['MOTION'], into: ['MOTION'], onto: ['MOTION'],
  through: ['MOTION'], across: ['MOTION'], along: ['MOTION'],
  over: ['SPATIAL_REL'], under: ['SPATIAL_REL'], above: ['SPATIAL_REL'], below: ['SPATIAL_REL'],
  between: ['SPATIAL_REL'], among: ['SPATIAL_REL'],
  before: ['TEMPORAL_REL'], after: ['TEMPORAL_REL'], during: ['TEMPORAL_REL'],
  since: ['TEMPORAL_REL'], until: ['TEMPORAL_REL'],

  // Conjunctions → RELATION
  and: ['SIMILAR'], or: ['OPPOSITE'], but: ['OPPOSITE'],
  because: ['CAUSE_EFFECT'], so: ['CAUSE_EFFECT'], therefore: ['CAUSE_EFFECT'],
  if: ['HYPOTHETICAL'], unless: ['HYPOTHETICAL', 'NEGATED'],
  although: ['OPPOSITE'], while: ['TEMPORAL_REL'],

  // Modals → MODALITY
  can: ['POSSIBLE'], could: ['POSSIBLE', 'PAST'],
  will: ['FUTURE'], would: ['FUTURE', 'HYPOTHETICAL'],
  shall: ['OBLIGATIVE'], should: ['OBLIGATIVE'],
  must: ['NECESSARY'], may: ['POSSIBLE'], might: ['POSSIBLE'],
  cannot: ['NEGATED', 'POSSIBLE'],

  // Negation → NEGATED
  not: ['NEGATED'], no: ['NEGATED'], never: ['NEGATED', 'PAST'],
  neither: ['NEGATED'], nor: ['NEGATED'],

  // Quantifiers → QUANTITY
  all: ['QUANTITY'], every: ['QUANTITY'], each: ['QUANTITY'],
  some: ['QUANTITY'], any: ['QUANTITY'], many: ['QUANTITY'],
  few: ['QUANTITY'], much: ['QUANTITY'], more: ['QUANTITY'],
  most: ['QUANTITY'], less: ['QUANTITY'], least: ['QUANTITY'],

  // Existential / copular → STATE
  is: ['STATE'], are: ['STATE'], was: ['STATE', 'PAST'], were: ['STATE', 'PAST'],
  be: ['STATE'], been: ['STATE'], being: ['STATE'],
  have: ['POSSESSION'], has: ['POSSESSION'], had: ['POSSESSION', 'PAST'],

  // Deictic / temporal → TIME_REF
  now: ['TIME_REF'], then: ['TIME_REF', 'PAST'], today: ['TIME_REF'],
  tomorrow: ['TIME_REF', 'FUTURE'], yesterday: ['TIME_REF', 'PAST'],
  always: ['TIME_REF'], never: ['NEGATED', 'TIME_REF'],
  soon: ['TIME_REF', 'FUTURE'], already: ['TIME_REF', 'PAST'],
});

// ── Morphological decomposition rules ────────────────────────────────────────
// Analogous to heuristic G2P: deterministic rules that decompose words into
// semantic primitives based on affixes and roots.

const PREFIX_RULES = Object.freeze([
  // Negation / reversal
  ['un', ['NEGATED']],
  ['in', ['NEGATED']],
  ['im', ['NEGATED']],
  ['ir', ['NEGATED']],
  ['il', ['NEGATED']],
  ['dis', ['NEGATED', 'OPPOSITE']],
  ['non', ['NEGATED']],
  ['anti', ['OPPOSITE', 'NEGATED']],
  ['contra', ['OPPOSITE']],
  ['counter', ['OPPOSITE']],

  // Repetition / restoration
  ['re', ['PROCESS', 'PAST']],
  ['redo', ['ACTION', 'PAST']],

  // Temporal
  ['pre', ['TEMPORAL_REL', 'FUTURE']],
  ['post', ['TEMPORAL_REL', 'PAST']],
  ['fore', ['TEMPORAL_REL', 'FUTURE']],
  ['after', ['TEMPORAL_REL', 'PAST']],

  // Degree / scope
  ['over', ['QUANTITY']],
  ['under', ['QUANTITY']],
  ['super', ['QUANTITY']],
  ['hyper', ['QUANTITY']],
  ['hypo', ['QUANTITY']],
  ['mega', ['QUANTITY']],
  ['micro', ['QUANTITY']],
  ['macro', ['QUANTITY']],
  ['multi', ['QUANTITY', 'GROUP']],
  ['poly', ['QUANTITY', 'GROUP']],
  ['mono', ['QUANTITY']],
  ['uni', ['QUANTITY']],
  ['bi', ['QUANTITY']],
  ['tri', ['QUANTITY']],

  // Relation
  ['inter', ['SPATIAL_REL', 'GROUP']],
  ['trans', ['MOTION', 'TRANSFER']],
  ['sub', ['PART_WHOLE', 'SPATIAL_REL']],
  ['infra', ['PART_WHOLE']],
  ['meta', ['ABSTRACT', 'TYPE_OF']],
  ['para', ['SIMILAR']],
  ['proto', ['TYPE_OF', 'PAST']],
  ['neo', ['TYPE_OF', 'FUTURE']],

  // Causation
  ['en', ['CAUSE']],
  ['em', ['CAUSE']],
  ['be', ['CAUSE']],
]);

const SUFFIX_RULES = Object.freeze([
  // Nominalization → ABSTRACT / STATE
  ['tion', ['ABSTRACT', 'PROCESS']],
  ['sion', ['ABSTRACT', 'PROCESS']],
  ['ment', ['ABSTRACT', 'STATE']],
  ['ness', ['ABSTRACT', 'STATE']],
  ['ity', ['ABSTRACT', 'STATE']],
  ['ance', ['ABSTRACT', 'STATE']],
  ['ence', ['ABSTRACT', 'STATE']],
  ['hood', ['ABSTRACT', 'STATE']],
  ['ship', ['ABSTRACT', 'RELATION']],
  ['dom', ['ABSTRACT', 'STATE']],
  ['ism', ['ABSTRACT', 'BELIEVE']],
  ['ology', ['ABSTRACT', 'KNOW', 'CLASSIFY']],
  ['graphy', ['ABSTRACT', 'COMMUNICATE']],
  ['metry', ['ABSTRACT', 'QUANTITY', 'EVALUATE']],

  // Agentive → PERSON / ACTION
  ['er', ['PERSON', 'ACTION']],
  ['or', ['PERSON', 'ACTION']],
  ['ist', ['PERSON', 'BELIEVE']],
  ['ian', ['PERSON', 'KNOW']],
  ['ant', ['PERSON', 'ACTION']],
  ['ent', ['PERSON', 'ACTION']],

  // Adjectival → STATE / EVALUATE
  ['able', ['POSSIBLE', 'STATE']],
  ['ible', ['POSSIBLE', 'STATE']],
  ['ful', ['QUANTITY', 'STATE']],
  ['less', ['NEGATED', 'STATE']],
  ['ous', ['STATE', 'EVALUATE']],
  ['ious', ['STATE', 'EVALUATE']],
  ['ive', ['STATE', 'ACTION']],
  ['al', ['STATE', 'TYPE_OF']],
  ['ic', ['STATE', 'TYPE_OF']],
  ['ical', ['STATE', 'TYPE_OF']],

  // Verbal → ACTION / PROCESS
  ['ify', ['CAUSE', 'ACTION']],
  ['ize', ['CAUSE', 'ACTION']],
  ['ise', ['CAUSE', 'ACTION']],
  ['ate', ['CAUSE', 'ACTION']],
  ['en', ['PROCESS', 'STATE']],

  // Adverbial → MODALITY
  ['ly', ['FACTUAL']],

  // Diminutive / augmentative
  ['let', ['QUANTITY', 'PHYS_OBJ']],
  ['ling', ['QUANTITY', 'PHYS_OBJ']],
]);

// ── Root morpheme → primitive mapping ────────────────────────────────────────
// High-frequency Latin/Greek/Germanic roots with stable semantic content.
// This is the "CMU dictionary" of the semantic engine — a curated lookup table.

const ROOT_MAP = Object.freeze({
  // Causation / necessity
  'determin': ['CAUSE', 'NECESSARY'],
  'caus': ['CAUSE', 'CAUSE_EFFECT'],
  'necess': ['NECESSARY', 'CAUSE'],
  'compel': ['CAUSE', 'OBLIGATIVE'],
  'force': ['CAUSE', 'ACTION'],
  'drive': ['CAUSE', 'MOTION'],
  'compuls': ['CAUSE', 'OBLIGATIVE'],

  // Reproduction / repetition
  'reproduc': ['CREATION', 'PROCESS', 'PAST'],
  'replic': ['CREATION', 'SIMILAR'],
  'duplic': ['CREATION', 'SIMILAR', 'QUANTITY'],
  'repeat': ['PROCESS', 'PAST'],
  'recurr': ['PROCESS', 'TEMPORAL_REL'],
  'redund': ['QUANTITY', 'SIMILAR'],

  // Creation / production
  'render': ['CREATION', 'ACTION'],
  'draw': ['CREATION', 'ACTION'],
  'paint': ['CREATION', 'ACTION'],
  'build': ['CREATION', 'ACTION'],
  'construct': ['CREATION', 'ACTION'],
  'generat': ['CREATION', 'PROCESS'],
  'creat': ['CREATION', 'ACTION'],
  'produc': ['CREATION', 'ACTION'],
  'fabricat': ['CREATION', 'ACTION'],
  'synthes': ['CREATION', 'PROCESS'],
  'compos': ['CREATION', 'ACTION'],
  'form': ['CREATION', 'STATE'],
  'shap': ['CREATION', 'ACTION'],
  'mold': ['CREATION', 'ACTION'],
  'forg': ['CREATION', 'ACTION'],
  'cast': ['CREATION', 'ACTION'],
  'carv': ['CREATION', 'ACTION'],
  'sculpt': ['CREATION', 'ACTION'],
  'weav': ['CREATION', 'ACTION'],
  'knit': ['CREATION', 'ACTION'],

  // Verification / identity
  'verif': ['EVALUATE', 'FACTUAL'],
  'valid': ['EVALUATE', 'FACTUAL'],
  'confirm': ['EVALUATE', 'FACTUAL'],
  'checksum': ['EVALUATE', 'QUANTITY'],
  'hash': ['EVALUATE', 'PROCESS'],
  'digest': ['EVALUATE', 'PROCESS'],
  'authent': ['EVALUATE', 'FACTUAL'],
  'certif': ['EVALUATE', 'FACTUAL'],
  'prov': ['EVALUATE', 'FACTUAL'],
  'assert': ['COMMUNICATE', 'FACTUAL'],
  'attest': ['COMMUNICATE', 'FACTUAL'],

  // Knowledge / cognition
  'know': ['KNOW'],
  'understand': ['KNOW', 'CLASSIFY'],
  'comprehend': ['KNOW', 'CLASSIFY'],
  'learn': ['KNOW', 'PROCESS'],
  'teach': ['COMMUNICATE', 'KNOW'],
  'think': ['KNOW', 'BELIEVE'],
  'reason': ['KNOW', 'EVALUATE'],
  'analyz': ['KNOW', 'CLASSIFY'],
  'analys': ['KNOW', 'CLASSIFY'],
  'evaluat': ['EVALUATE', 'KNOW'],
  'judg': ['EVALUATE'],
  'assess': ['EVALUATE'],
  'measur': ['EVALUATE', 'QUANTITY'],
  'quantif': ['QUANTITY', 'EVALUATE'],
  'calculat': ['QUANTITY', 'PROCESS'],
  'comput': ['QUANTITY', 'PROCESS'],

  // Communication
  'speak': ['COMMUNICATE'],
  'talk': ['COMMUNICATE'],
  'say': ['COMMUNICATE'],
  'tell': ['COMMUNICATE'],
  'writ': ['COMMUNICATE'],
  'read': ['PERCEIVE', 'KNOW'],
  'listen': ['PERCEIVE'],
  'hear': ['PERCEIVE'],
  'see': ['PERCEIVE'],
  'look': ['PERCEIVE'],
  'watch': ['PERCEIVE'],
  'observ': ['PERCEIVE', 'KNOW'],
  'describ': ['COMMUNICATE'],
  'explain': ['COMMUNICATE', 'KNOW'],
  'defin': ['COMMUNICATE', 'CLASSIFY'],
  'label': ['COMMUNICATE', 'CLASSIFY'],
  'name': ['COMMUNICATE', 'CLASSIFY'],
  'call': ['COMMUNICATE'],
  'ask': ['COMMUNICATE'],
  'answer': ['COMMUNICATE'],
  'question': ['COMMUNICATE', 'KNOW'],
  'respond': ['COMMUNICATE'],
  'report': ['COMMUNICATE'],
  'document': ['COMMUNICATE', 'KNOW'],
  'record': ['COMMUNICATE', 'PAST'],

  // Motion / transfer
  'mov': ['MOTION'],
  'go': ['MOTION'],
  'come': ['MOTION'],
  'run': ['MOTION', 'ACTION'],
  'walk': ['MOTION', 'ACTION'],
  'fly': ['MOTION'],
  'fall': ['MOTION', 'PROCESS'],
  'rise': ['MOTION', 'PROCESS'],
  'send': ['TRANSFER', 'MOTION'],
  'receiv': ['TRANSFER'],
  'giv': ['TRANSFER'],
  'tak': ['TRANSFER'],
  'bring': ['TRANSFER', 'MOTION'],
  'carry': ['TRANSFER', 'MOTION'],
  'push': ['CAUSE', 'MOTION'],
  'pull': ['CAUSE', 'MOTION'],
  'throw': ['TRANSFER', 'MOTION'],
  'catch': ['TRANSFER', 'ACTION'],
  'hold': ['POSSESSION', 'STATE'],
  'keep': ['POSSESSION', 'STATE'],
  'own': ['POSSESSION'],
  'possess': ['POSSESSION'],
  'belong': ['POSSESSION'],

  // Destruction / negation
  'destroy': ['DESTRUCTION', 'ACTION'],
  'break': ['DESTRUCTION', 'ACTION'],
  'crush': ['DESTRUCTION', 'ACTION'],
  'shatter': ['DESTRUCTION', 'ACTION'],
  'annihilat': ['DESTRUCTION', 'ACTION'],
  'elimin': ['DESTRUCTION', 'ACTION'],
  'remov': ['DESTRUCTION', 'ACTION'],
  'delet': ['DESTRUCTION', 'ACTION'],
  'eras': ['DESTRUCTION', 'ACTION'],
  'cancel': ['NEGATED', 'ACTION'],
  'deny': ['NEGATED', 'COMMUNICATE'],
  'reject': ['NEGATED', 'EVALUATE'],
  'refus': ['NEGATED', 'ACTION'],

  // State / being
  'exist': ['STATE', 'FACTUAL'],
  'remain': ['STATE', 'TEMPORAL_REL'],
  'stay': ['STATE'],
  'persist': ['STATE', 'TEMPORAL_REL'],
  'endur': ['STATE', 'TEMPORAL_REL'],
  'last': ['STATE', 'TEMPORAL_REL'],
  'continu': ['STATE', 'PROCESS'],
  'stop': ['NEGATED', 'PROCESS'],
  'cease': ['NEGATED', 'PROCESS'],
  'begin': ['PROCESS', 'TEMPORAL_REL'],
  'start': ['PROCESS', 'TEMPORAL_REL'],
  'end': ['DESTRUCTION', 'TEMPORAL_REL'],
  'finish': ['DESTRUCTION', 'TEMPORAL_REL'],
  'complet': ['STATE', 'FACTUAL'],

  // Classification / type
  'class': ['CLASSIFY', 'TYPE_OF'],
  'categor': ['CLASSIFY', 'TYPE_OF'],
  'typ': ['TYPE_OF', 'CLASSIFY'],
  'kind': ['TYPE_OF', 'SIMILAR'],
  'sort': ['CLASSIFY', 'ACTION'],
  'group': ['GROUP', 'CLASSIFY'],
  'rank': ['CLASSIFY', 'EVALUATE'],
  'order': ['CLASSIFY', 'TEMPORAL_REL'],
  'arrang': ['CLASSIFY', 'ACTION'],
  'organiz': ['CLASSIFY', 'ACTION'],
  'structur': ['CLASSIFY', 'PART_WHOLE'],
  'system': ['CLASSIFY', 'PART_WHOLE'],
  'pattern': ['CLASSIFY', 'SIMILAR'],
  'model': ['CLASSIFY', 'SIMILAR'],
  'schema': ['CLASSIFY', 'ABSTRACT'],
  'framework': ['CLASSIFY', 'PART_WHOLE'],
  'architect': ['CLASSIFY', 'PART_WHOLE', 'CREATION'],

  // Similarity / opposition
  'similar': ['SIMILAR'],
  'like': ['SIMILAR'],
  'resembl': ['SIMILAR'],
  'match': ['SIMILAR', 'EVALUATE'],
  'equal': ['SIMILAR', 'QUANTITY'],
  'same': ['SIMILAR'],
  'ident': ['SIMILAR', 'FACTUAL'],
  'differ': ['OPPOSITE'],
  'opposit': ['OPPOSITE'],
  'contrar': ['OPPOSITE'],
  'contrast': ['OPPOSITE', 'EVALUATE'],
  'distinct': ['OPPOSITE', 'CLASSIFY'],
  'separat': ['OPPOSITE', 'ACTION'],
  'divid': ['OPPOSITE', 'ACTION'],

  // Emotion / feeling
  'feel': ['FEEL'],
  'emotion': ['FEEL', 'ABSTRACT'],
  'love': ['FEEL', 'WANT'],
  'hate': ['FEEL', 'OPPOSITE'],
  'fear': ['FEEL', 'BELIEVE'],
  'joy': ['FEEL'],
  'anger': ['FEEL', 'ACTION'],
  'sad': ['FEEL'],
  'happy': ['FEEL'],
  'hope': ['FEEL', 'BELIEVE', 'FUTURE'],
  'desire': ['WANT', 'FEEL'],
  'want': ['WANT'],
  'wish': ['WANT', 'HYPOTHETICAL'],
  'need': ['WANT', 'NECESSARY'],

  // Belief / epistemic
  'believ': ['BELIEVE'],
  'trust': ['BELIEVE', 'FEEL'],
  'doubt': ['BELIEVE', 'NEGATED'],
  'suspect': ['BELIEVE', 'HYPOTHETICAL'],
  'assume': ['BELIEVE', 'HYPOTHETICAL'],
  'presum': ['BELIEVE', 'HYPOTHETICAL'],
  'suppos': ['BELIEVE', 'HYPOTHETICAL'],
  'imagin': ['BELIEVE', 'HYPOTHETICAL'],
  'dream': ['BELIEVE', 'HYPOTHETICAL'],
  'predict': ['BELIEVE', 'FUTURE'],
  'forecast': ['BELIEVE', 'FUTURE'],
  'expect': ['BELIEVE', 'FUTURE'],

  // Spatial
  'place': ['PLACE', 'SPATIAL_REL'],
  'locat': ['PLACE', 'SPATIAL_REL'],
  'position': ['PLACE', 'SPATIAL_REL'],
  'site': ['PLACE'],
  'area': ['PLACE', 'QUANTITY'],
  'region': ['PLACE', 'QUANTITY'],
  'zone': ['PLACE'],
  'space': ['PLACE', 'ABSTRACT'],
  'distance': ['SPATIAL_REL', 'QUANTITY'],
  'near': ['SPATIAL_REL'],
  'far': ['SPATIAL_REL'],
  'adjacent': ['SPATIAL_REL'],
  'surround': ['SPATIAL_REL'],
  'contain': ['SPATIAL_REL', 'PART_WHOLE'],
  'inside': ['SPATIAL_REL', 'PART_WHOLE'],
  'outside': ['SPATIAL_REL', 'OPPOSITE'],
  'boundary': ['SPATIAL_REL', 'PART_WHOLE'],
  'edge': ['SPATIAL_REL', 'PART_WHOLE'],
  'center': ['SPATIAL_REL'],
  'surface': ['SPATIAL_REL', 'PART_WHOLE'],

  // Temporal
  'time': ['TIME_REF'],
  'moment': ['TIME_REF'],
  'period': ['TIME_REF', 'QUANTITY'],
  'duration': ['TIME_REF', 'QUANTITY'],
  'sequence': ['TIME_REF', 'TEMPORAL_REL'],
  'series': ['TIME_REF', 'TEMPORAL_REL'],
  'cycle': ['TIME_REF', 'PROCESS'],
  'phase': ['TIME_REF', 'STATE'],
  'stage': ['TIME_REF', 'STATE'],
  'step': ['TIME_REF', 'ACTION'],
  'early': ['TIME_REF', 'PAST'],
  'late': ['TIME_REF', 'FUTURE'],
  'ancient': ['TIME_REF', 'PAST'],
  'modern': ['TIME_REF', 'FUTURE'],
  'new': ['TIME_REF', 'FUTURE'],
  'old': ['TIME_REF', 'PAST'],
  'young': ['TIME_REF', 'FUTURE'],
  'recent': ['TIME_REF', 'PAST'],
  'current': ['TIME_REF', 'FACTUAL'],
  'immediat': ['TIME_REF', 'FACTUAL'],
  'eventual': ['TIME_REF', 'FUTURE'],
  'permanent': ['TIME_REF', 'STATE'],
  'temporar': ['TIME_REF', 'STATE'],

  // Quantity
  'number': ['QUANTITY'],
  'amount': ['QUANTITY'],
  'count': ['QUANTITY', 'ACTION'],
  'total': ['QUANTITY'],
  'sum': ['QUANTITY'],
  'averag': ['QUANTITY', 'EVALUATE'],
  'maximum': ['QUANTITY', 'EVALUATE'],
  'minimum': ['QUANTITY', 'EVALUATE'],
  'percent': ['QUANTITY'],
  'ratio': ['QUANTITY', 'SIMILAR'],
  'proport': ['QUANTITY', 'SIMILAR'],
  'scale': ['QUANTITY'],
  'size': ['QUANTITY'],
  'weight': ['QUANTITY'],
  'length': ['QUANTITY', 'SPATIAL_REL'],
  'width': ['QUANTITY', 'SPATIAL_REL'],
  'height': ['QUANTITY', 'SPATIAL_REL'],
  'depth': ['QUANTITY', 'SPATIAL_REL'],
  'volume': ['QUANTITY', 'SPATIAL_REL'],
  'mass': ['QUANTITY', 'PHYS_OBJ'],
  'densit': ['QUANTITY', 'SPATIAL_REL'],
  'frequenc': ['QUANTITY', 'TEMPORAL_REL'],
  'rate': ['QUANTITY', 'TEMPORAL_REL'],
  'speed': ['QUANTITY', 'MOTION'],
  'velocit': ['QUANTITY', 'MOTION'],
  'accelerat': ['QUANTITY', 'MOTION', 'PROCESS'],

  // Substance / material
  'material': ['SUBSTANCE'],
  'substance': ['SUBSTANCE'],
  'matter': ['SUBSTANCE', 'ABSTRACT'],
  'element': ['SUBSTANCE', 'PART_WHOLE'],
  'compound': ['SUBSTANCE', 'PART_WHOLE'],
  'mixture': ['SUBSTANCE', 'GROUP'],
  'solution': ['SUBSTANCE', 'STATE'],
  'liquid': ['SUBSTANCE', 'STATE'],
  'solid': ['SUBSTANCE', 'STATE'],
  'gas': ['SUBSTANCE', 'STATE'],
  'metal': ['SUBSTANCE'],
  'wood': ['SUBSTANCE'],
  'stone': ['SUBSTANCE'],
  'water': ['SUBSTANCE'],
  'fire': ['SUBSTANCE', 'PROCESS'],
  'earth': ['SUBSTANCE', 'PLACE'],
  'air': ['SUBSTANCE'],
  'light': ['SUBSTANCE', 'PERCEIVE'],
  'sound': ['SUBSTANCE', 'PERCEIVE'],
  'color': ['SUBSTANCE', 'PERCEIVE'],
  'colour': ['SUBSTANCE', 'PERCEIVE'],
  'texture': ['SUBSTANCE', 'PERCEIVE'],
  'shape': ['SUBSTANCE', 'SPATIAL_REL'],
  'form': ['SUBSTANCE', 'ABSTRACT'],
  'structure': ['SUBSTANCE', 'PART_WHOLE'],

  // Abstract / conceptual
  'concept': ['ABSTRACT'],
  'idea': ['ABSTRACT', 'KNOW'],
  'theory': ['ABSTRACT', 'KNOW', 'BELIEVE'],
  'principle': ['ABSTRACT', 'NECESSARY'],
  'law': ['ABSTRACT', 'NECESSARY', 'OBLIGATIVE'],
  'rule': ['ABSTRACT', 'OBLIGATIVE'],
  'axiom': ['ABSTRACT', 'NECESSARY', 'FACTUAL'],
  'theorem': ['ABSTRACT', 'NECESSARY', 'KNOW'],
  'hypothesis': ['ABSTRACT', 'HYPOTHETICAL', 'BELIEVE'],
  'paradigm': ['ABSTRACT', 'CLASSIFY'],
  'philosophy': ['ABSTRACT', 'BELIEVE', 'KNOW'],
  'logic': ['ABSTRACT', 'KNOW', 'NECESSARY'],
  'reason': ['ABSTRACT', 'KNOW', 'CAUSE'],
  'truth': ['ABSTRACT', 'FACTUAL'],
  'fact': ['ABSTRACT', 'FACTUAL'],
  'reality': ['ABSTRACT', 'FACTUAL'],
  'existence': ['ABSTRACT', 'STATE'],
  'essence': ['ABSTRACT', 'STATE'],
  'nature': ['ABSTRACT', 'STATE'],
  'quality': ['ABSTRACT', 'EVALUATE'],
  'property': ['ABSTRACT', 'STATE'],
  'attribute': ['ABSTRACT', 'STATE'],
  'feature': ['ABSTRACT', 'PART_WHOLE'],
  'characteristic': ['ABSTRACT', 'STATE'],
  'aspect': ['ABSTRACT', 'PART_WHOLE'],
  'dimension': ['ABSTRACT', 'QUANTITY'],
  'parameter': ['ABSTRACT', 'QUANTITY'],
  'variable': ['ABSTRACT', 'QUANTITY'],
  'constant': ['ABSTRACT', 'STATE', 'NECESSARY'],
  'function': ['ABSTRACT', 'PROCESS'],
  'relation': ['ABSTRACT', 'RELATION'],
  'operation': ['ABSTRACT', 'ACTION'],
  'algorithm': ['ABSTRACT', 'PROCESS'],
  'procedure': ['ABSTRACT', 'PROCESS'],
  'method': ['ABSTRACT', 'PROCESS'],
  'technique': ['ABSTRACT', 'ACTION'],
  'strategy': ['ABSTRACT', 'ACTION', 'FUTURE'],
  'plan': ['ABSTRACT', 'ACTION', 'FUTURE'],
  'design': ['ABSTRACT', 'CREATION'],
  'blueprint': ['ABSTRACT', 'CREATION'],
  'template': ['ABSTRACT', 'SIMILAR'],
  'prototype': ['ABSTRACT', 'SIMILAR', 'CREATION'],
  'instance': ['ABSTRACT', 'TYPE_OF'],
  'example': ['ABSTRACT', 'TYPE_OF'],
  'sample': ['ABSTRACT', 'TYPE_OF'],
  'specimen': ['ABSTRACT', 'TYPE_OF'],
  'case': ['ABSTRACT', 'TYPE_OF'],
  'scenario': ['ABSTRACT', 'HYPOTHETICAL'],
  'context': ['ABSTRACT', 'SPATIAL_REL'],
  'environment': ['ABSTRACT', 'SPATIAL_REL'],
  'situation': ['ABSTRACT', 'STATE'],
  'condition': ['ABSTRACT', 'STATE'],
  'circumstance': ['ABSTRACT', 'STATE'],
  'event': ['ABSTRACT', 'PROCESS'],
  'occurrence': ['ABSTRACT', 'PROCESS'],
  'phenomenon': ['ABSTRACT', 'PERCEIVE'],
  'experience': ['ABSTRACT', 'PERCEIVE', 'KNOW'],
  'memory': ['ABSTRACT', 'KNOW', 'PAST'],
  'history': ['ABSTRACT', 'KNOW', 'PAST'],
  'future': ['ABSTRACT', 'FUTURE'],
  'possibility': ['ABSTRACT', 'POSSIBLE'],
  'probability': ['ABSTRACT', 'POSSIBLE', 'QUANTITY'],
  'certainty': ['ABSTRACT', 'FACTUAL'],
  'necessity': ['ABSTRACT', 'NECESSARY'],
  'contingency': ['ABSTRACT', 'HYPOTHETICAL'],
  'dependency': ['ABSTRACT', 'CAUSE_EFFECT'],
  'independence': ['ABSTRACT', 'OPPOSITE', 'CAUSE_EFFECT'],
  'freedom': ['ABSTRACT', 'POSSIBLE'],
  'constraint': ['ABSTRACT', 'OBLIGATIVE'],
  'limit': ['ABSTRACT', 'QUANTITY', 'OBLIGATIVE'],
  'bound': ['ABSTRACT', 'QUANTITY', 'OBLIGATIVE'],
  'threshold': ['ABSTRACT', 'QUANTITY'],
  'margin': ['ABSTRACT', 'QUANTITY'],
  'range': ['ABSTRACT', 'QUANTITY'],
  'spectrum': ['ABSTRACT', 'QUANTITY'],
  'continuum': ['ABSTRACT', 'QUANTITY'],
  'gradient': ['ABSTRACT', 'QUANTITY', 'PROCESS'],
  'hierarchy': ['ABSTRACT', 'CLASSIFY', 'PART_WHOLE'],
  'taxonomy': ['ABSTRACT', 'CLASSIFY'],
  'ontology': ['ABSTRACT', 'CLASSIFY', 'KNOW'],
  'epistemology': ['ABSTRACT', 'KNOW', 'BELIEVE'],
  'semantics': ['ABSTRACT', 'KNOW', 'COMMUNICATE'],
  'syntax': ['ABSTRACT', 'CLASSIFY', 'COMMUNICATE'],
  'grammar': ['ABSTRACT', 'CLASSIFY', 'COMMUNICATE'],
  'language': ['ABSTRACT', 'COMMUNICATE'],
  'word': ['ABSTRACT', 'COMMUNICATE'],
  'sentence': ['ABSTRACT', 'COMMUNICATE'],
  'text': ['ABSTRACT', 'COMMUNICATE'],
  'discourse': ['ABSTRACT', 'COMMUNICATE'],
  'narrative': ['ABSTRACT', 'COMMUNICATE'],
  'story': ['ABSTRACT', 'COMMUNICATE'],
  'myth': ['ABSTRACT', 'COMMUNICATE', 'BELIEVE'],
  'symbol': ['ABSTRACT', 'COMMUNICATE'],
  'sign': ['ABSTRACT', 'COMMUNICATE'],
  'signal': ['ABSTRACT', 'COMMUNICATE'],
  'code': ['ABSTRACT', 'COMMUNICATE'],
  'cipher': ['ABSTRACT', 'COMMUNICATE'],
  'key': ['ABSTRACT', 'COMMUNICATE'],
  'index': ['ABSTRACT', 'CLASSIFY'],
  'catalog': ['ABSTRACT', 'CLASSIFY'],
  'list': ['ABSTRACT', 'CLASSIFY'],
  'table': ['ABSTRACT', 'CLASSIFY'],
  'matrix': ['ABSTRACT', 'CLASSIFY', 'QUANTITY'],
  'array': ['ABSTRACT', 'CLASSIFY', 'QUANTITY'],
  'vector': ['ABSTRACT', 'QUANTITY', 'MOTION'],
  'tensor': ['ABSTRACT', 'QUANTITY'],
  'scalar': ['ABSTRACT', 'QUANTITY'],
  'point': ['ABSTRACT', 'SPATIAL_REL'],
  'line': ['ABSTRACT', 'SPATIAL_REL'],
  'plane': ['ABSTRACT', 'SPATIAL_REL'],
  'curve': ['ABSTRACT', 'SPATIAL_REL'],
  'angle': ['ABSTRACT', 'SPATIAL_REL', 'QUANTITY'],
  'circle': ['ABSTRACT', 'SPATIAL_REL'],
  'sphere': ['ABSTRACT', 'SPATIAL_REL'],
  'field': ['ABSTRACT', 'SPATIAL_REL'],
  'network': ['ABSTRACT', 'PART_WHOLE'],
  'graph': ['ABSTRACT', 'PART_WHOLE'],
  'tree': ['ABSTRACT', 'PART_WHOLE'],
  'node': ['ABSTRACT', 'PART_WHOLE'],
  'edge': ['ABSTRACT', 'PART_WHOLE'],
  'path': ['ABSTRACT', 'MOTION', 'SPATIAL_REL'],
  'route': ['ABSTRACT', 'MOTION', 'SPATIAL_REL'],
  'channel': ['ABSTRACT', 'MOTION', 'SPATIAL_REL'],
  'flow': ['ABSTRACT', 'MOTION', 'PROCESS'],
  'stream': ['ABSTRACT', 'MOTION', 'PROCESS'],
  'current': ['ABSTRACT', 'MOTION', 'PROCESS'],
  'wave': ['ABSTRACT', 'MOTION', 'PROCESS'],
  'pulse': ['ABSTRACT', 'MOTION', 'PROCESS'],
  'rhythm': ['ABSTRACT', 'TEMPORAL_REL', 'PROCESS'],
  'cycle': ['ABSTRACT', 'TEMPORAL_REL', 'PROCESS'],
  'loop': ['ABSTRACT', 'TEMPORAL_REL', 'PROCESS'],
  'spiral': ['ABSTRACT', 'MOTION', 'PROCESS'],
  'fractal': ['ABSTRACT', 'SIMILAR', 'PART_WHOLE'],
  'chaos': ['ABSTRACT', 'PROCESS'],
  'order': ['ABSTRACT', 'STATE', 'CLASSIFY'],
  'entropy': ['ABSTRACT', 'PROCESS', 'QUANTITY'],
  'energy': ['ABSTRACT', 'CAUSE', 'QUANTITY'],
  'force': ['ABSTRACT', 'CAUSE', 'MOTION'],
  'power': ['ABSTRACT', 'CAUSE', 'QUANTITY'],
  'strength': ['ABSTRACT', 'QUANTITY', 'STATE'],
  'weakness': ['ABSTRACT', 'QUANTITY', 'STATE'],
  'balance': ['ABSTRACT', 'STATE', 'QUANTITY'],
  'equilibrium': ['ABSTRACT', 'STATE', 'QUANTITY'],
  'symmetry': ['ABSTRACT', 'SIMILAR', 'SPATIAL_REL'],
  'asymmetry': ['ABSTRACT', 'OPPOSITE', 'SPATIAL_REL'],
  'harmony': ['ABSTRACT', 'SIMILAR', 'FEEL'],
  'dissonance': ['ABSTRACT', 'OPPOSITE', 'FEEL'],
  'tension': ['ABSTRACT', 'STATE', 'FEEL'],
  'resolution': ['ABSTRACT', 'STATE', 'PROCESS'],
  'conflict': ['ABSTRACT', 'OPPOSITE', 'ACTION'],
  'cooperation': ['ABSTRACT', 'SIMILAR', 'ACTION'],
  'competition': ['ABSTRACT', 'OPPOSITE', 'ACTION'],
  'collaboration': ['ABSTRACT', 'SIMILAR', 'ACTION', 'GROUP'],
  'communication': ['ABSTRACT', 'COMMUNICATE'],
  'information': ['ABSTRACT', 'COMMUNICATE', 'KNOW'],
  'data': ['ABSTRACT', 'KNOW', 'QUANTITY'],
  'knowledge': ['ABSTRACT', 'KNOW'],
  'wisdom': ['ABSTRACT', 'KNOW', 'EVALUATE'],
  'intelligence': ['ABSTRACT', 'KNOW', 'EVALUATE'],
  'consciousness': ['ABSTRACT', 'KNOW', 'FEEL'],
  'awareness': ['ABSTRACT', 'PERCEIVE', 'KNOW'],
  'attention': ['ABSTRACT', 'PERCEIVE'],
  'focus': ['ABSTRACT', 'PERCEIVE'],
  'concentration': ['ABSTRACT', 'PERCEIVE', 'QUANTITY'],
  'distraction': ['ABSTRACT', 'PERCEIVE', 'OPPOSITE'],
  'intuition': ['ABSTRACT', 'KNOW', 'FEEL'],
  'instinct': ['ABSTRACT', 'KNOW', 'FEEL'],
  'reflex': ['ABSTRACT', 'ACTION', 'PROCESS'],
  'habit': ['ABSTRACT', 'ACTION', 'STATE'],
  'custom': ['ABSTRACT', 'ACTION', 'GROUP'],
  'tradition': ['ABSTRACT', 'ACTION', 'PAST', 'GROUP'],
  'culture': ['ABSTRACT', 'GROUP', 'BELIEVE'],
  'society': ['ABSTRACT', 'GROUP'],
  'community': ['ABSTRACT', 'GROUP'],
  'civilization': ['ABSTRACT', 'GROUP', 'CREATION'],
  'government': ['ABSTRACT', 'GROUP', 'OBLIGATIVE'],
  'authority': ['ABSTRACT', 'OBLIGATIVE', 'PERSON'],
  'power': ['ABSTRACT', 'CAUSE', 'OBLIGATIVE'],
  'control': ['ABSTRACT', 'CAUSE', 'OBLIGATIVE'],
  'influence': ['ABSTRACT', 'CAUSE', 'COMMUNICATE'],
  'persuasion': ['ABSTRACT', 'CAUSE', 'COMMUNICATE'],
  'manipulation': ['ABSTRACT', 'CAUSE', 'COMMUNICATE'],
  'coercion': ['ABSTRACT', 'CAUSE', 'OBLIGATIVE'],
  'violence': ['ABSTRACT', 'ACTION', 'DESTRUCTION'],
  'peace': ['ABSTRACT', 'STATE', 'FEEL'],
  'war': ['ABSTRACT', 'ACTION', 'DESTRUCTION', 'GROUP'],
  'justice': ['ABSTRACT', 'EVALUATE', 'OBLIGATIVE'],
  'fairness': ['ABSTRACT', 'EVALUATE', 'SIMILAR'],
  'equality': ['ABSTRACT', 'SIMILAR', 'QUANTITY'],
  'liberty': ['ABSTRACT', 'POSSIBLE', 'OBLIGATIVE'],
  'rights': ['ABSTRACT', 'OBLIGATIVE', 'PERSON'],
  'duty': ['ABSTRACT', 'OBLIGATIVE', 'ACTION'],
  'responsibility': ['ABSTRACT', 'OBLIGATIVE', 'CAUSE'],
  'obligation': ['ABSTRACT', 'OBLIGATIVE'],
  'permission': ['ABSTRACT', 'POSSIBLE', 'OBLIGATIVE'],
  'prohibition': ['ABSTRACT', 'NEGATED', 'OBLIGATIVE'],
  'law': ['ABSTRACT', 'OBLIGATIVE', 'NECESSARY'],
  'rule': ['ABSTRACT', 'OBLIGATIVE'],
  'regulation': ['ABSTRACT', 'OBLIGATIVE'],
  'policy': ['ABSTRACT', 'OBLIGATIVE', 'FUTURE'],
  'standard': ['ABSTRACT', 'EVALUATE', 'NECESSARY'],
  'norm': ['ABSTRACT', 'EVALUATE', 'GROUP'],
  'value': ['ABSTRACT', 'EVALUATE'],
  'worth': ['ABSTRACT', 'EVALUATE', 'QUANTITY'],
  'price': ['ABSTRACT', 'EVALUATE', 'QUANTITY'],
  'cost': ['ABSTRACT', 'EVALUATE', 'QUANTITY'],
  'benefit': ['ABSTRACT', 'EVALUATE', 'QUANTITY'],
  'profit': ['ABSTRACT', 'EVALUATE', 'QUANTITY'],
  'loss': ['ABSTRACT', 'EVALUATE', 'QUANTITY', 'NEGATED'],
  'gain': ['ABSTRACT', 'EVALUATE', 'QUANTITY'],
  'advantage': ['ABSTRACT', 'EVALUATE'],
  'disadvantage': ['ABSTRACT', 'EVALUATE', 'NEGATED'],
  'risk': ['ABSTRACT', 'HYPOTHETICAL', 'EVALUATE'],
  'danger': ['ABSTRACT', 'HYPOTHETICAL', 'FEEL'],
  'safety': ['ABSTRACT', 'STATE', 'FEEL'],
  'security': ['ABSTRACT', 'STATE', 'FEEL'],
  'threat': ['ABSTRACT', 'HYPOTHETICAL', 'FEEL'],
  'protection': ['ABSTRACT', 'ACTION', 'STATE'],
  'defense': ['ABSTRACT', 'ACTION', 'OPPOSITE'],
  'attack': ['ABSTRACT', 'ACTION', 'DESTRUCTION'],
  'resistance': ['ABSTRACT', 'ACTION', 'OPPOSITE'],
  'rebellion': ['ABSTRACT', 'ACTION', 'OPPOSITE', 'GROUP'],
  'revolution': ['ABSTRACT', 'ACTION', 'DESTRUCTION', 'GROUP'],
  'evolution': ['ABSTRACT', 'PROCESS', 'TEMPORAL_REL'],
  'development': ['ABSTRACT', 'PROCESS', 'CREATION'],
  'growth': ['ABSTRACT', 'PROCESS', 'QUANTITY'],
  'decay': ['ABSTRACT', 'PROCESS', 'DESTRUCTION'],
  'aging': ['ABSTRACT', 'PROCESS', 'TEMPORAL_REL'],
  'birth': ['ABSTRACT', 'CREATION', 'TEMPORAL_REL'],
  'death': ['ABSTRACT', 'DESTRUCTION', 'TEMPORAL_REL'],
  'life': ['ABSTRACT', 'STATE', 'PROCESS'],
  'health': ['ABSTRACT', 'STATE'],
  'disease': ['ABSTRACT', 'STATE', 'NEGATED'],
  'cure': ['ABSTRACT', 'ACTION', 'PROCESS'],
  'treatment': ['ABSTRACT', 'ACTION', 'PROCESS'],
  'therapy': ['ABSTRACT', 'ACTION', 'PROCESS'],
  'medicine': ['ABSTRACT', 'SUBSTANCE', 'PROCESS'],
  'science': ['ABSTRACT', 'KNOW', 'EVALUATE'],
  'technology': ['ABSTRACT', 'CREATION', 'KNOW'],
  'engineering': ['ABSTRACT', 'CREATION', 'KNOW'],
  'art': ['ABSTRACT', 'CREATION', 'FEEL'],
  'music': ['ABSTRACT', 'CREATION', 'PERCEIVE'],
  'literature': ['ABSTRACT', 'CREATION', 'COMMUNICATE'],
  'poetry': ['ABSTRACT', 'CREATION', 'COMMUNICATE'],
  'painting': ['ABSTRACT', 'CREATION', 'PERCEIVE'],
  'sculpture': ['ABSTRACT', 'CREATION', 'PERCEIVE'],
  'architecture': ['ABSTRACT', 'CREATION', 'SPATIAL_REL'],
  'mathematics': ['ABSTRACT', 'KNOW', 'QUANTITY'],
  'physics': ['ABSTRACT', 'KNOW', 'SUBSTANCE'],
  'chemistry': ['ABSTRACT', 'KNOW', 'SUBSTANCE'],
  'biology': ['ABSTRACT', 'KNOW', 'SUBSTANCE'],
  'psychology': ['ABSTRACT', 'KNOW', 'FEEL'],
  'sociology': ['ABSTRACT', 'KNOW', 'GROUP'],
  'economics': ['ABSTRACT', 'KNOW', 'TRANSFER'],
  'politics': ['ABSTRACT', 'KNOW', 'GROUP', 'OBLIGATIVE'],
  'history': ['ABSTRACT', 'KNOW', 'PAST'],
  'geography': ['ABSTRACT', 'KNOW', 'PLACE'],
  'astronomy': ['ABSTRACT', 'KNOW', 'PLACE'],
  'geology': ['ABSTRACT', 'KNOW', 'SUBSTANCE'],
  'ecology': ['ABSTRACT', 'KNOW', 'GROUP', 'PLACE'],
  'genetics': ['ABSTRACT', 'KNOW', 'SUBSTANCE'],
  'neuroscience': ['ABSTRACT', 'KNOW', 'SUBSTANCE'],
  'linguistics': ['ABSTRACT', 'KNOW', 'COMMUNICATE'],
  'philosophy': ['ABSTRACT', 'KNOW', 'BELIEVE'],
  'theology': ['ABSTRACT', 'KNOW', 'BELIEVE'],
  'religion': ['ABSTRACT', 'BELIEVE', 'GROUP'],
  'spirituality': ['ABSTRACT', 'BELIEVE', 'FEEL'],
  'faith': ['ABSTRACT', 'BELIEVE'],
  'doubt': ['ABSTRACT', 'BELIEVE', 'NEGATED'],
  'skepticism': ['ABSTRACT', 'BELIEVE', 'NEGATED'],
  'certainty': ['ABSTRACT', 'FACTUAL', 'KNOW'],
  'uncertainty': ['ABSTRACT', 'HYPOTHETICAL', 'KNOW'],
  'ambiguity': ['ABSTRACT', 'HYPOTHETICAL', 'OPPOSITE'],
  'clarity': ['ABSTRACT', 'FACTUAL', 'PERCEIVE'],
  'confusion': ['ABSTRACT', 'NEGATED', 'KNOW'],
  'understanding': ['ABSTRACT', 'KNOW', 'CLASSIFY'],
  'misunderstanding': ['ABSTRACT', 'KNOW', 'NEGATED'],
  'agreement': ['ABSTRACT', 'SIMILAR', 'COMMUNICATE'],
  'disagreement': ['ABSTRACT', 'OPPOSITE', 'COMMUNICATE'],
  'consensus': ['ABSTRACT', 'SIMILAR', 'GROUP'],
  'debate': ['ABSTRACT', 'OPPOSITE', 'COMMUNICATE'],
  'argument': ['ABSTRACT', 'OPPOSITE', 'COMMUNICATE'],
  'proof': ['ABSTRACT', 'FACTUAL', 'EVALUATE'],
  'evidence': ['ABSTRACT', 'FACTUAL', 'PERCEIVE'],
  'testimony': ['ABSTRACT', 'FACTUAL', 'COMMUNICATE'],
  'witness': ['ABSTRACT', 'FACTUAL', 'PERCEIVE', 'PERSON'],
  'observation': ['ABSTRACT', 'PERCEIVE', 'KNOW'],
  'experiment': ['ABSTRACT', 'ACTION', 'KNOW'],
  'hypothesis': ['ABSTRACT', 'HYPOTHETICAL', 'KNOW'],
  'theory': ['ABSTRACT', 'KNOW', 'BELIEVE'],
  'law': ['ABSTRACT', 'NECESSARY', 'KNOW'],
  'principle': ['ABSTRACT', 'NECESSARY', 'KNOW'],
  'axiom': ['ABSTRACT', 'NECESSARY', 'FACTUAL'],
  'postulate': ['ABSTRACT', 'HYPOTHETICAL', 'KNOW'],
  'conjecture': ['ABSTRACT', 'HYPOTHETICAL', 'BELIEVE'],
  'speculation': ['ABSTRACT', 'HYPOTHETICAL', 'BELIEVE'],
  'assumption': ['ABSTRACT', 'HYPOTHETICAL', 'BELIEVE'],
  'premise': ['ABSTRACT', 'HYPOTHETICAL', 'KNOW'],
  'conclusion': ['ABSTRACT', 'FACTUAL', 'KNOW'],
  'inference': ['ABSTRACT', 'KNOW', 'CAUSE_EFFECT'],
  'deduction': ['ABSTRACT', 'KNOW', 'NECESSARY'],
  'induction': ['ABSTRACT', 'KNOW', 'POSSIBLE'],
  'abduction': ['ABSTRACT', 'KNOW', 'HYPOTHETICAL'],
  'analogy': ['ABSTRACT', 'SIMILAR', 'KNOW'],
  'metaphor': ['ABSTRACT', 'SIMILAR', 'COMMUNICATE'],
  'simile': ['ABSTRACT', 'SIMILAR', 'COMMUNICATE'],
  'allegory': ['ABSTRACT', 'SIMILAR', 'COMMUNICATE'],
  'symbol': ['ABSTRACT', 'COMMUNICATE'],
  'icon': ['ABSTRACT', 'COMMUNICATE', 'SIMILAR'],
  'index': ['ABSTRACT', 'COMMUNICATE', 'CAUSE_EFFECT'],
  'sign': ['ABSTRACT', 'COMMUNICATE'],
  'signal': ['ABSTRACT', 'COMMUNICATE'],
  'message': ['ABSTRACT', 'COMMUNICATE'],
  'meaning': ['ABSTRACT', 'COMMUNICATE', 'KNOW'],
  'sense': ['ABSTRACT', 'COMMUNICATE', 'KNOW'],
  'reference': ['ABSTRACT', 'COMMUNICATE', 'KNOW'],
  'denotation': ['ABSTRACT', 'COMMUNICATE', 'FACTUAL'],
  'connotation': ['ABSTRACT', 'COMMUNICATE', 'FEEL'],
  'implication': ['ABSTRACT', 'COMMUNICATE', 'CAUSE_EFFECT'],
  'presupposition': ['ABSTRACT', 'COMMUNICATE', 'BELIEVE'],
  'entailment': ['ABSTRACT', 'COMMUNICATE', 'NECESSARY'],
  'contradiction': ['ABSTRACT', 'OPPOSITE', 'NEGATED'],
  'paradox': ['ABSTRACT', 'OPPOSITE', 'HYPOTHETICAL'],
  'irony': ['ABSTRACT', 'OPPOSITE', 'COMMUNICATE'],
  'sarcasm': ['ABSTRACT', 'OPPOSITE', 'COMMUNICATE'],
  'humor': ['ABSTRACT', 'FEEL', 'COMMUNICATE'],
  'wit': ['ABSTRACT', 'FEEL', 'COMMUNICATE'],
  'satire': ['ABSTRACT', 'OPPOSITE', 'COMMUNICATE'],
  'parody': ['ABSTRACT', 'SIMILAR', 'COMMUNICATE'],
  'travesty': ['ABSTRACT', 'OPPOSITE', 'COMMUNICATE'],
  'burlesque': ['ABSTRACT', 'SIMILAR', 'COMMUNICATE'],
  'farce': ['ABSTRACT', 'FEEL', 'COMMUNICATE'],
  'comedy': ['ABSTRACT', 'FEEL', 'COMMUNICATE'],
  'tragedy': ['ABSTRACT', 'FEEL', 'COMMUNICATE'],
  'drama': ['ABSTRACT', 'FEEL', 'COMMUNICATE'],
  'narrative': ['ABSTRACT', 'COMMUNICATE'],
  'plot': ['ABSTRACT', 'COMMUNICATE', 'TEMPORAL_REL'],
  'character': ['ABSTRACT', 'PERSON'],
  'setting': ['ABSTRACT', 'PLACE', 'TIME_REF'],
  'theme': ['ABSTRACT', 'KNOW'],
  'motif': ['ABSTRACT', 'SIMILAR'],
  'symbol': ['ABSTRACT', 'COMMUNICATE'],
  'imagery': ['ABSTRACT', 'PERCEIVE', 'COMMUNICATE'],
  'tone': ['ABSTRACT', 'FEEL', 'COMMUNICATE'],
  'mood': ['ABSTRACT', 'FEEL'],
  'atmosphere': ['ABSTRACT', 'FEEL', 'SPATIAL_REL'],
  'style': ['ABSTRACT', 'CLASSIFY', 'COMMUNICATE'],
  'genre': ['ABSTRACT', 'CLASSIFY', 'COMMUNICATE'],
  'form': ['ABSTRACT', 'CLASSIFY'],
  'structure': ['ABSTRACT', 'PART_WHOLE'],
  'composition': ['ABSTRACT', 'PART_WHOLE', 'CREATION'],
  'organization': ['ABSTRACT', 'PART_WHOLE', 'CLASSIFY'],
  'arrangement': ['ABSTRACT', 'PART_WHOLE', 'CLASSIFY'],
  'configuration': ['ABSTRACT', 'PART_WHOLE', 'SPATIAL_REL'],
  'layout': ['ABSTRACT', 'PART_WHOLE', 'SPATIAL_REL'],
  'design': ['ABSTRACT', 'CREATION', 'PART_WHOLE'],
  'pattern': ['ABSTRACT', 'SIMILAR', 'PART_WHOLE'],
  'template': ['ABSTRACT', 'SIMILAR', 'CREATION'],
  'blueprint': ['ABSTRACT', 'CREATION', 'PART_WHOLE'],
  'schematic': ['ABSTRACT', 'CREATION', 'PART_WHOLE'],
  'diagram': ['ABSTRACT', 'COMMUNICATE', 'PART_WHOLE'],
  'chart': ['ABSTRACT', 'COMMUNICATE', 'QUANTITY'],
  'graph': ['ABSTRACT', 'COMMUNICATE', 'QUANTITY'],
  'map': ['ABSTRACT', 'COMMUNICATE', 'SPATIAL_REL'],
  'model': ['ABSTRACT', 'SIMILAR', 'KNOW'],
  'simulation': ['ABSTRACT', 'SIMILAR', 'PROCESS'],
  'representation': ['ABSTRACT', 'SIMILAR', 'COMMUNICATE'],
  'depiction': ['ABSTRACT', 'SIMILAR', 'COMMUNICATE'],
  'portrait': ['ABSTRACT', 'SIMILAR', 'COMMUNICATE'],
  'image': ['ABSTRACT', 'SIMILAR', 'PERCEIVE'],
  'picture': ['ABSTRACT', 'SIMILAR', 'PERCEIVE'],
  'photograph': ['ABSTRACT', 'SIMILAR', 'PERCEIVE'],
  'illustration': ['ABSTRACT', 'SIMILAR', 'COMMUNICATE'],
  'drawing': ['ABSTRACT', 'SIMILAR', 'CREATION'],
  'sketch': ['ABSTRACT', 'SIMILAR', 'CREATION'],
  'outline': ['ABSTRACT', 'PART_WHOLE', 'COMMUNICATE'],
  'summary': ['ABSTRACT', 'PART_WHOLE', 'COMMUNICATE'],
  'abstract': ['ABSTRACT', 'PART_WHOLE', 'COMMUNICATE'],
  'overview': ['ABSTRACT', 'PART_WHOLE', 'KNOW'],
  'synopsis': ['ABSTRACT', 'PART_WHOLE', 'COMMUNICATE'],
  'digest': ['ABSTRACT', 'PART_WHOLE', 'COMMUNICATE'],
  'compendium': ['ABSTRACT', 'PART_WHOLE', 'KNOW'],
  'encyclopedia': ['ABSTRACT', 'PART_WHOLE', 'KNOW'],
  'dictionary': ['ABSTRACT', 'PART_WHOLE', 'COMMUNICATE'],
  'thesaurus': ['ABSTRACT', 'PART_WHOLE', 'SIMILAR'],
  'glossary': ['ABSTRACT', 'PART_WHOLE', 'COMMUNICATE'],
  'lexicon': ['ABSTRACT', 'PART_WHOLE', 'COMMUNICATE'],
  'vocabulary': ['ABSTRACT', 'PART_WHOLE', 'COMMUNICATE'],
  'terminology': ['ABSTRACT', 'PART_WHOLE', 'COMMUNICATE'],
  'nomenclature': ['ABSTRACT', 'PART_WHOLE', 'COMMUNICATE'],
  'taxonomy': ['ABSTRACT', 'PART_WHOLE', 'CLASSIFY'],
  'classification': ['ABSTRACT', 'PART_WHOLE', 'CLASSIFY'],
  'categorization': ['ABSTRACT', 'PART_WHOLE', 'CLASSIFY'],
  'hierarchy': ['ABSTRACT', 'PART_WHOLE', 'CLASSIFY'],
  'ontology': ['ABSTRACT', 'PART_WHOLE', 'KNOW'],
  'schema': ['ABSTRACT', 'PART_WHOLE', 'KNOW'],
  'framework': ['ABSTRACT', 'PART_WHOLE', 'KNOW'],
  'paradigm': ['ABSTRACT', 'PART_WHOLE', 'KNOW'],
  'model': ['ABSTRACT', 'PART_WHOLE', 'SIMILAR'],
  'theory': ['ABSTRACT', 'PART_WHOLE', 'KNOW'],
  'system': ['ABSTRACT', 'PART_WHOLE'],
  'mechanism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'apparatus': ['ABSTRACT', 'PART_WHOLE', 'PHYS_OBJ'],
  'device': ['ABSTRACT', 'PART_WHOLE', 'PHYS_OBJ'],
  'instrument': ['ABSTRACT', 'PART_WHOLE', 'PHYS_OBJ'],
  'tool': ['ABSTRACT', 'PART_WHOLE', 'PHYS_OBJ'],
  'machine': ['ABSTRACT', 'PART_WHOLE', 'PHYS_OBJ'],
  'engine': ['ABSTRACT', 'PART_WHOLE', 'CAUSE'],
  'motor': ['ABSTRACT', 'PART_WHOLE', 'CAUSE'],
  'generator': ['ABSTRACT', 'PART_WHOLE', 'CREATION'],
  'converter': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'transformer': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'amplifier': ['ABSTRACT', 'PART_WHOLE', 'QUANTITY'],
  'filter': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'sensor': ['ABSTRACT', 'PART_WHOLE', 'PERCEIVE'],
  'detector': ['ABSTRACT', 'PART_WHOLE', 'PERCEIVE'],
  'monitor': ['ABSTRACT', 'PART_WHOLE', 'PERCEIVE'],
  'controller': ['ABSTRACT', 'PART_WHOLE', 'CAUSE'],
  'regulator': ['ABSTRACT', 'PART_WHOLE', 'CAUSE'],
  'governor': ['ABSTRACT', 'PART_WHOLE', 'OBLIGATIVE'],
  'manager': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'director': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'leader': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'follower': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'member': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'participant': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'observer': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'spectator': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'audience': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'crowd': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'mob': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'team': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'crew': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'staff': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'committee': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'council': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'board': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'panel': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'jury': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'assembly': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'congress': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'parliament': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'senate': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'house': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'chamber': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'court': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'tribunal': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'jury': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'witness': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'judge': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'lawyer': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'attorney': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'prosecutor': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'defendant': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'plaintiff': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'victim': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'suspect': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'criminal': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'offender': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'convict': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'prisoner': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'guard': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'warden': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'police': ['ABSTRACT', 'PART_WHOLE', 'GROUP'],
  'officer': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'soldier': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'warrior': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'fighter': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'hero': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'villain': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'protagonist': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'antagonist': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'narrator': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'author': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'writer': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'poet': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'artist': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'painter': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'sculptor': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'musician': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'composer': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'performer': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'actor': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'actress': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'director': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'producer': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'editor': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'publisher': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'printer': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'reader': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'viewer': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'listener': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'speaker': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'teacher': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'student': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'scholar': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'researcher': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'scientist': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'engineer': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'technician': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'mechanic': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'craftsman': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'artisan': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'worker': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'laborer': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'employee': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'employer': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'manager': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'executive': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'administrator': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'bureaucrat': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'politician': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'diplomat': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'ambassador': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'minister': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'president': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'governor': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'mayor': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'senator': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'representative': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'delegate': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'agent': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'spy': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'detective': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'investigator': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'inspector': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'examiner': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'auditor': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'accountant': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'banker': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'trader': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'merchant': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'shopkeeper': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'customer': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'client': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'patient': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'doctor': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'nurse': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'surgeon': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'dentist': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'pharmacist': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'therapist': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'counselor': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'psychologist': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'psychiatrist': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'priest': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'minister': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'rabbi': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'imam': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'monk': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'nun': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'saint': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'prophet': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'god': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'goddess': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'angel': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'demon': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'spirit': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'ghost': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'soul': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'mind': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'body': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'heart': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'brain': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'eye': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'ear': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'nose': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'mouth': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'hand': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'foot': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'arm': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'leg': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'head': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'face': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'skin': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'bone': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'blood': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'muscle': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'nerve': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'organ': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'cell': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'gene': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'dna': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'protein': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'enzyme': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'hormone': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'virus': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'bacterium': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'fungus': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'parasite': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'animal': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'plant': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'tree': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'flower': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'grass': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'weed': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'seed': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'root': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'stem': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'leaf': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'branch': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'trunk': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'bark': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'fruit': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'vegetable': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'grain': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'wheat': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'rice': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'corn': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'potato': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'tomato': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'apple': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'orange': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'banana': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'grape': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'berry': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'nut': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'meat': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'fish': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'bird': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'insect': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'spider': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'worm': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'snake': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'lizard': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'frog': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'turtle': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'crocodile': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'dinosaur': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'dragon': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'unicorn': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'phoenix': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'griffin': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'mermaid': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'fairy': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'elf': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'dwarf': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'giant': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'troll': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'goblin': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'orc': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'vampire': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'werewolf': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'zombie': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'ghost': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'spirit': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'soul': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'demon': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'devil': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'satan': ['ABSTRACT', 'PART_WHOLE', 'PERSON'],
  'hell': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'heaven': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'paradise': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'utopia': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'dystopia': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'world': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'universe': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'cosmos': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'galaxy': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'star': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'planet': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'moon': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'sun': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'earth': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'mars': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'jupiter': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'saturn': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'uranus': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'neptune': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'pluto': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'asteroid': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'comet': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'meteor': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'nebula': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'blackhole': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'quasar': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'pulsar': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'supernova': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'bigbang': ['ABSTRACT', 'PART_WHOLE', 'PLACE'],
  'evolution': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'creation': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'destruction': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'transformation': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'mutation': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'adaptation': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'selection': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'extinction': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'speciation': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'migration': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'hibernation': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'metamorphosis': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'photosynthesis': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'respiration': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'digestion': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'circulation': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'reproduction': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'growth': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'development': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'aging': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'death': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'decay': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'decomposition': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'fossilization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'mineralization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'crystallization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'evaporation': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'condensation': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'precipitation': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'erosion': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'sedimentation': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'volcanism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'earthquake': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'tsunami': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'hurricane': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'tornado': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'flood': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'drought': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'famine': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'plague': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'epidemic': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'pandemic': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'war': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'revolution': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'rebellion': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'coup': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'election': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'referendum': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'protest': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'strike': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'riot': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'massacre': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'genocide': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'holocaust': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'slavery': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'colonialism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'imperialism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'capitalism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'socialism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'communism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'fascism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'democracy': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'republic': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'monarchy': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'dictatorship': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'anarchy': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'theocracy': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'oligarchy': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'aristocracy': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'plutocracy': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'meritocracy': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'technocracy': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'bureaucracy': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'kleptocracy': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'kakistocracy': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'gerontocracy': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'patriarchy': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'matriarchy': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'feminism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'masculism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'egalitarianism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'libertarianism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'authoritarianism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'totalitarianism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'nationalism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'patriotism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'cosmopolitanism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'multiculturalism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'pluralism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'secularism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'fundamentalism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'extremism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'terrorism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'pacifism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'militarism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'isolationism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'interventionism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'expansionism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'imperialism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'colonialism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'neocolonialism': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'globalization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'localization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'urbanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'industrialization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'modernization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'westernization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'americanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'europeanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'asianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'africanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'latinization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'arabization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'russification': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'sinicization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'japanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'koreanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'indianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'turkification': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'persianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'hellenization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'romanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'germanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'francization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'hispanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'italianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'portugalization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'dutchification': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'scandinavization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'slavicization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'balticization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'finnicization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'hungarianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'romanianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'bulgarianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'serbianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'croatianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'bosnianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'slovenianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'macedonianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'albanianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'greekification': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'turkification': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'armenianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'georgianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'azerbaijanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'kazakhification': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'uzbekification': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'turkmenification': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'kyrgyzification': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'tajikification': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'afghanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'pakistanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'bangladeshification': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'srilankanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'nepalization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'bhutanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'maldivianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'burmeseification': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'thaiification': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'laotianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'cambodianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'vietnamization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'malaysianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'singaporianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'indonesianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'philippinization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'bruneianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'timoreseification': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'papuanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'australianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'newzealandization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'fijianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'samoanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'tonganization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'vanuatuanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'solomonization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'kiribatization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'tuvaluanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'nauruanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'palauanization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'marshallization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'micronesianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'hawaiianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'tahitianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'maorianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'polynesianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
  'melanesianization': ['ABSTRACT', 'PART_WHOLE', 'PROCESS'],
});

// ── Semantic primitive resolution ────────────────────────────────────────────

/**
 * Resolve a single word to its semantic primitives.
 * Tries (in order): closed-class map, root map, prefix/suffix decomposition,
 * then deterministic hash fallback.
 *
 * @param {string} word - lowercase word
 * @returns {string[]} semantic primitives
 */
/** Negating prefixes, and the stems they attach to. */
const NEGATING_PREFIXES = Object.freeze(['un', 'in', 'im', 'ir', 'il', 'non', 'dis']);

/**
 * Does this word carry a negating prefix over a stem that is itself a word?
 *
 * The dictionary test is what makes this safe. A bare prefix match calls
 * `interest` and `island` negations; requiring the remainder to be a known lemma
 * rejects both (`terest`, `land`… `land` IS a lemma, hence the length floor and
 * the requirement that the base share a part of speech is left to WordNet's own
 * listing of the negated form).
 */
function negatingPrefixOf(lower) {
  for (const prefix of NEGATING_PREFIXES) {
    if (!lower.startsWith(prefix)) continue;
    const stem = lower.slice(prefix.length);
    if (stem.length < 4) continue;
    if (wordnetPrimitives(stem) || ownEntry(ROOT_MAP, stem)) return { prefix, stem };
  }
  return null;
}

export function resolveSemanticPrimitives(word) {
  const lower = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!lower) return [];

  // NEGATION IS CHECKED FIRST AND MERGED, NEVER SUBSTITUTED.
  //
  // WordNet lists `unhappy` as its own lemma under adj.all, so a dictionary-first
  // resolver returns [STATE] and the negation vanishes — the flagship signal
  // silently deleted by the fix that grounded everything else. It also collapsed
  // every negated adjective into the same bucket as its positive, taking the
  // largest collision bucket from 5,190 lemmas to 13,405.
  //
  // The stem lookup is what makes the prefix test safe: `interest` is not a
  // negation because `terest` is not a word.
  const negation = negatingPrefixOf(lower);
  if (negation) {
    const base = resolveSemanticPrimitives(negation.stem);
    if (base.length > 0) return [...new Set(['NEGATED', ...base])];
  }

  // RESOLUTION ORDER: exact curated match, then a real dictionary, then
  // heuristics, then nothing.
  //
  // The substring rules used to run ahead of WordNet, and a heuristic that
  // outranks a dictionary is how `forest` resolved to
  // [ACTION, GROUP, PHYS_OBJ, SPATIAL_REL] via a ROOT_MAP prefix match while
  // `woodland` resolved to [SUBSTANCE] — scoring two synonyms at 0.091, below
  // an unrelated pair. Heuristics exist to cover what the dictionary misses,
  // not to pre-empt it.

  // 1. Closed-class lookup — exact, curated, and about grammar rather than
  //    meaning, so no dictionary can improve on it.
  const closed = ownEntry(CLOSED_CLASS_MAP, lower);
  if (closed) return closed;

  // 2. Root map, EXACT matches only. A hand-curated entry for the whole word is
  //    a deliberate assertion; a substring hit is a coincidence.
  const exactRoot = ownEntry(ROOT_MAP, lower);
  if (exactRoot) return exactRoot;

  // 3. WordNet grounding — 78,838 lemmas over 45 lexicographer files.
  const grounded = wordnetPrimitives(lower);
  if (grounded) return grounded;

  // 4. Root map by prefix boundary, for derived forms WordNet does not list.
  //    Ordered longest-root-first so `surrender` cannot match `render`.
  const roots = Object.entries(ROOT_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [root, primitives] of roots) {
    if (lower.startsWith(root)) return primitives;
    // e.g. "un" + "happy" → NEGATED + FEEL
    for (const [prefix, prefixPrims] of PREFIX_RULES) {
      if (lower.startsWith(prefix) && lower.slice(prefix.length).startsWith(root)) {
        return [...new Set([...prefixPrims, ...primitives])];
      }
    }
  }

  // 5. Prefix + suffix decomposition — the last heuristic before giving up.
  const primitives = [];
  let stem = lower;

  for (const [prefix, prims] of PREFIX_RULES) {
    if (lower.startsWith(prefix) && lower.length > prefix.length + 2) {
      primitives.push(...prims);
      stem = lower.slice(prefix.length);
      break;
    }
  }

  for (const [suffix, prims] of SUFFIX_RULES) {
    if (stem.endsWith(suffix) && stem.length > suffix.length + 2) {
      primitives.push(...prims);
      stem = stem.slice(0, -suffix.length);
      break;
    }
  }

  if (primitives.length > 0) return [...new Set(primitives)];

  // 5. Nothing grounds this word.
  //
  // This used to be a deterministic hash fallback that drew two primitives from
  // the domain pools. Measured over 68,480 WordNet lemmas it collapsed the
  // vocabulary into 1,473 distinct classes and labelled 1,917 lemmas NEGATED —
  // `carafe`, `brushwood`, `blurred` among them — poisoning the one channel this
  // engine exists to provide. It was deterministic, so it reproduced perfectly,
  // which is exactly what made it look principled rather than invented.
  //
  // An empty result is a declared absence the caller can see, the same contract
  // as `ast-topography` returning null and `SkillScores.semantic: number | null`
  // in `src/lib/career/graph/contracts.ts`. A resolver that always resolves is a
  // check that cannot fail.
  return [];
}

/**
 * Resolve all words in a text to semantic primitive sequences.
 *
 * @param {string} text
 * @returns {{ word: string, primitives: string[] }[]}
 */
export function resolveTextSemantics(text) {
  const words = String(text || '').toLowerCase().match(/[a-z']+/g) || [];
  return words.map((word) => ({
    word,
    primitives: resolveSemanticPrimitives(word),
  }));
}

// ── Semantic n-gram extraction ───────────────────────────────────────────────

/**
 * Extract semantic primitive unigrams from a primitive sequence.
 * @param {string[]} primitives
 * @returns {Map<string, number>}
 */
export function extractSemanticUnigrams(primitives) {
  const counts = new Map();
  for (const p of primitives) {
    counts.set(p, (counts.get(p) || 0) + 1);
  }
  return counts;
}

/**
 * Extract semantic primitive bigrams from a primitive sequence.
 * @param {string[]} primitives
 * @returns {Map<string, number>}
 */
export function extractSemanticBigrams(primitives) {
  const counts = new Map();
  for (let i = 0; i < primitives.length - 1; i++) {
    const key = `${primitives[i]}+${primitives[i + 1]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

// ── The 256-dim semantic topographic vector generator ────────────────────────

/**
 * Generate a 256-dimensional semantotopographic vector from pre-resolved
 * semantic primitive sequences. Pure core function — no I/O.
 *
 * After band accumulation, the vector is centered (mean-subtracted) and
 * L2-normalized so that cosine similarity spans the full [-1, 1] range.
 *
 * @param {{ word: string, primitives: string[] }[]} wordSemantics
 * @param {number} [dim=256]
 * @returns {Float32Array}
 */
export function generateSemantotopographicVectorFromPrimitives(wordSemantics, dim = 256) {
  const vec = new Float32Array(dim);
  if (!Array.isArray(wordSemantics) || wordSemantics.length === 0) return vec;

  // Flatten all primitives across all words
  const allPrimitives = [];
  for (const entry of wordSemantics) {
    if (Array.isArray(entry.primitives)) {
      allPrimitives.push(...entry.primitives);
    }
  }
  if (allPrimitives.length === 0) return vec;

  // ── Band 0 (dims 0–63): Semantic primitive distribution ───────────────
  // Each of the 40 semantic primitives maps to a unique dimension (0–39).
  // Dims 40–63 remain zero (reserved for future expansion).
  // Weighted by semantic feature salience.
  // NEGATION IS A SIGN, NOT A SLOT. Adding a NEGATED primitive alongside the
  // others makes "not X" maximally SIMILAR to X: `impossible` resolved to
  // [NEGATED, POSSIBLE, STATE] and `possible` to [POSSIBLE, STATE], sharing two
  // of three non-negative dims, so the pair scored 0.976 — the engine reproduced
  // the negation blindness it exists to remove. NEGATED now inverts the sign of
  // the primitives in its own word's scope and claims no dimension of its own,
  // so "possible" and "impossible" land antiparallel.
  //
  // Scope is the WORD, which is why this accumulates per entry rather than over
  // the flattened sequence: negation in one word must not invert its neighbours.
  for (const entry of wordSemantics) {
    if (!Array.isArray(entry.primitives) || entry.primitives.length === 0) continue;
    const negated = entry.primitives.includes('NEGATED');
    const sign = negated ? -1 : 1;
    for (const primitive of entry.primitives) {
      if (primitive === 'NEGATED') continue;
      const idx = SEMANTIC_INDEX.get(primitive);
      if (idx === undefined) continue;
      const features = SEMANTIC_FEATURES_V1[primitive];
      // Weight by feature complexity: more distinctive primitives get higher weight
      const featureWeight = features
        ? 1.0
          + (features.concreteness || 0) * 0.4
          + (features.volition || 0) * 0.3
          + (features.transitivity || 0) * 0.2
          + (features.boundedness || 0) * 0.1
        : 1.0;
      vec[idx] += sign * featureWeight;
    }
  }

  // ── Band 1 (dims 64–127): Semantic bigram transitions ─────────────────
  // Hash each bigram pair into the 64-dim band.
  // Weight by gravity transition DIRECTION: rising (content → function) and
  // falling (function → content) transitions get different weights.
  const bigrams = extractSemanticBigrams(allPrimitives);
  for (const [key, count] of bigrams) {
    const [a, b] = key.split('+');
    const hash = fnv1aHash(key) % 64;
    const gravA = SEMANTIC_GRAVITY[a] || 0;
    const gravB = SEMANTIC_GRAVITY[b] || 0;
    const transition = gravB - gravA;
    // Rising transitions (content → function): weight = 1.0 + transition * 0.12
    // Falling transitions (function → content): weight = 1.0 + |transition| * 0.06
    // Rising transitions ~2× more salient, encoding directional information flow.
    const weight = transition >= 0
      ? count * (1.0 + transition * 0.12)
      : count * (1.0 + (-transition) * 0.06);
    vec[64 + hash] += weight;
  }

  // ── Band 2 (dims 128–191): Semantic topology ──────────────────────────
  // Captures abstraction level, volition, polarity and per-word shape. The
  // domain tallies that used to be counted here are band 3's business.
  let concreteCount = 0;
  let abstractCount = 0;
  let volitionalCount = 0;
  let negatedCount = 0;

  for (const entry of wordSemantics) {
    if (!Array.isArray(entry.primitives)) continue;
    for (const p of entry.primitives) {
      const features = SEMANTIC_FEATURES_V1[p];
      if (features) {
        if (features.concreteness) concreteCount++;
        else abstractCount++;
        if (features.volition) volitionalCount++;
        if (features.polarity) negatedCount++;
      }
    }
  }

  const total = allPrimitives.length || 1;

  // The domain distribution belongs to band 3 and is NOT restated here. It used
  // to be written into dims 128–132 at scale 8.0 while band 3 wrote the same
  // quantity into 192–196 at scale 6.0 — one measurement, two bands, which made
  // their rankings correlate at rho = 0.903 and cost the vector a whole
  // independent channel.
  //
  // Everything below encodes in DIRECTION — which dim fires — never in
  // magnitude. Per-band L2 normalization discards magnitude by construction, so
  // a scalar written to a fixed dim is a value the vector cannot carry: every
  // short text ends up with the same band direction and the band reads ~1.0 for
  // unrelated inputs. Ratios therefore select a BUCKET, and the bucket index is
  // the signal.
  const bucketOf = (ratio, bins) =>
    Math.max(0, Math.min(bins - 1, Math.floor(ratio * bins)));

  // Abstraction profile → dims 128–135 (8 buckets of concrete:abstract ratio)
  const featured = concreteCount + abstractCount;
  if (featured > 0) {
    vec[128 + bucketOf(concreteCount / featured, 8)] += 2.0;
  }

  // Volition profile → dims 136–143 (8 buckets)
  vec[136 + bucketOf(volitionalCount / total, 8)] += 1.5;

  // Polarity profile → dims 144–151 (8 buckets)
  vec[144 + bucketOf(negatedCount / total, 8)] += 1.5;

  // Primitive density → dims 152–159 (8 buckets, ~1..8 primitives per word)
  const density = total / Math.max(wordSemantics.length, 1);
  vec[152 + Math.max(0, Math.min(7, Math.round(density) - 1))] += 1.0;

  // Per-word primitive pattern hashing → dims 160–191
  for (let wi = 0; wi < wordSemantics.length; wi++) {
    const entry = wordSemantics[wi];
    if (!Array.isArray(entry.primitives) || entry.primitives.length === 0) continue;
    const patternKey = [...entry.primitives].sort().join('+');
    const patternHash = fnv1aHash(patternKey) % 32;
    vec[160 + patternHash] += 2.0;
  }

  // ── Band 3 (dims 192–255): Domain signature ───────────────────────────
  // Layout:
  //   192–221: Domain share, 5 domains x 6 buckets (absent domains stay silent)
  //   222–237: Cross-domain transition hash (16 dims)
  //   238–245: Register / formality bucket (8 dims)
  //   246–255: Reserved
  //
  // Directional for the same reason band 2 is. Writing each domain's share to
  // its own fixed dim made every text share a band-3 direction: the band read
  // 0.887-0.988 for every pair probed, including 0.915 for quantum
  // chromodynamics vs birthday cake. A share now selects a BUCKET, and a domain
  // with no primitives writes nothing at all — so which dims fire varies with
  // content instead of only how hard a constant set of dims fires.
  const DOMAIN_ORDER = ['ENTITY', 'EVENT', 'RELATION', 'COGNITION', 'MODALITY'];
  const DOMAIN_BUCKETS = 6;

  const domainCounts = { ENTITY: 0, EVENT: 0, RELATION: 0, COGNITION: 0, MODALITY: 0 };
  for (const p of allPrimitives) {
    const domain = PRIMITIVE_TO_DOMAIN[p];
    if (domain) domainCounts[domain]++;
  }
  for (let d = 0; d < DOMAIN_ORDER.length; d++) {
    const count = domainCounts[DOMAIN_ORDER[d]];
    if (count === 0) continue;  // silence is the signal: this domain is absent
    const bucket = Math.max(0, Math.min(DOMAIN_BUCKETS - 1,
      Math.floor((count / total) * DOMAIN_BUCKETS)));
    vec[192 + d * DOMAIN_BUCKETS + bucket] += 3.0;
  }

  // Cross-domain transitions: when adjacent words activate different domains
  for (let i = 0; i < wordSemantics.length - 1; i++) {
    const primsA = wordSemantics[i].primitives || [];
    const primsB = wordSemantics[i + 1].primitives || [];
    if (primsA.length === 0 || primsB.length === 0) continue;
    const domA = PRIMITIVE_TO_DOMAIN[primsA[0]];
    const domB = PRIMITIVE_TO_DOMAIN[primsB[0]];
    if (domA && domB && domA !== domB) {
      const transKey = `${domA}>${domB}`;
      const transHash = fnv1aHash(transKey) % 16;
      vec[222 + transHash] += 2.0;
    }
  }

  // Register signature: ratio of closed-class to open-class words, bucketed.
  // Two complementary dims (r and 1-r) at fixed positions gave every text the
  // same two-dim register direction and differed only in magnitude.
  let closedClassCount = 0;
  for (const entry of wordSemantics) {
    if (ownEntry(CLOSED_CLASS_MAP, entry.word)) closedClassCount++;
  }
  const registerRatio = closedClassCount / Math.max(wordSemantics.length, 1);
  vec[238 + Math.max(0, Math.min(7, Math.floor(registerRatio * 8)))] += 2.0;

  // ── Per-band normalization ────────────────────────────────────────────
  // Normalize each 64-dim band to unit norm INDEPENDENTLY, matching
  // phonotopography v2. A single global L2 lets the loudest band steer the
  // whole vector's direction: band 2 wrote at magnitude 8.0 and band 3 at 6.0
  // while band 0 wrote at ~1.0, so bands 2 and 3 held ~75% of the energy, their
  // cosines sat at 0.75–0.99 for every pair, and unrelated texts scored 0.917.
  // Band 0 — the band that actually discriminates, reading 0.037 for maximally
  // distant text — was outvoted at 14% of the energy.
  //
  // The global cosine then equals the MEAN of the per-band cosines, so every
  // band gets one vote. There is no mean-subtraction: centering would reintroduce
  // a shared component across all dims, which is the baseline this removes.
  const bandWidth = dim / BAND_COUNT;
  for (let band = 0; band < BAND_COUNT; band++) {
    const start = band * bandWidth;
    let bandNorm = 0;
    for (let i = start; i < start + bandWidth; i++) bandNorm += vec[i] * vec[i];
    bandNorm = Math.sqrt(bandNorm);
    if (bandNorm > 1e-10) {
      for (let i = start; i < start + bandWidth; i++) vec[i] /= bandNorm;
    }
  }

  return vec;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a 256-dimensional semantotopographic vector from raw text.
 * Resolves words → semantic primitives → topographic vector.
 *
 * @param {string} text
 * @param {number} [dim=256]
 * @returns {Float32Array}
 */
export function generateSemantotopographicVector(text, dim = 256) {
  const wordSemantics = resolveTextSemantics(text);
  return generateSemantotopographicVectorFromPrimitives(wordSemantics, dim);
}

/**
 * Compute semantic topographic similarity between two texts.
 * Returns a score in [0, 1] where 1 = identical semantic topology,
 * 0 = maximally distant.
 *
 * @param {string} textA
 * @param {string} textB
 * @returns {number}
 */
export function semanticTopographicSimilarity(textA, textB) {
  const vecA = generateSemantotopographicVector(textA);
  const vecB = generateSemantotopographicVector(textB);

  let dot = 0;
  for (let i = 0; i < vecA.length; i++) dot += vecA[i] * vecB[i];

  // Each band carries unit norm, so the raw dot product is the SUM of the four
  // per-band cosines and spans [-4, 4]. Dividing by the band count makes it
  // their mean — one vote per band — which is the whole point of normalizing
  // per band rather than globally.
  //
  // No (x + 1) / 2 remapping: that maps orthogonal vectors to 0.5 and would
  // reinstate exactly the structural floor this change exists to remove. Band 0
  // is signed (negation inverts it), so an antiparallel pair lands below zero
  // and clamps to 0 — which is the correct similarity for "X" versus "not X".
  const meanBandCosine = dot / BAND_COUNT;
  return Math.min(1, Math.max(0, meanBandCosine));
}

/**
 * Create a TurboQuant-compressed semantic topographic signature.
 * @param {string} text
 * @returns {{ data: Uint8Array, norm: number }}
 */
export function createSemanticTopographicSignature(text) {
  const vec = generateSemantotopographicVector(text);
  return quantizeVectorJS(vec);
}

/**
 * Compare two compressed semantic topographic signatures.
 * @param {{ data: Uint8Array, norm: number }} sigA
 * @param {{ data: Uint8Array, norm: number }} sigB
 * @returns {number} estimated cosine similarity in [-1, 1]
 */
export function compareSemanticTopographicSignatures(sigA, sigB) {
  return estimateInnerProduct(sigA.data, sigB.data, sigA.norm, sigB.norm);
}

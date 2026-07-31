/**
 * WORDNET SENSE GROUNDING
 *
 * Maps a lemma to semantic primitives through Open English WordNet's 45
 * lexicographer files — the closed, curated inventory that plays ARPAbet's role
 * for meaning.
 *
 * WHAT THIS REPLACES. `resolveSemanticPrimitives` used to end in a deterministic
 * hash fallback: any word its 40 authored primitives did not cover received two
 * pseudo-random primitives drawn from the domain pools. Measured over 68,480
 * WordNet lemmas that collapsed the vocabulary into 1,473 distinct classes
 * (1.24% of random pairs bit-identical) and labelled 1,917 lemmas `NEGATED` —
 * `carafe`, `brushwood`, `blurred`, `alight`. The engine confabulated, and did
 * it reproducibly, which made the output look principled.
 *
 * THE MAPPING BELOW IS AUTHORED, AND THAT IS DIFFERENT FROM GUESSING. It has 45
 * rows between two closed sets, and a reviewer can check every one. Inventing
 * primitives for 68,000 words cannot be checked by anyone. When the two
 * inventories genuinely disagree — WordNet's `noun.Tops` has no counterpart
 * among 40 primitives — the row says so with the closest supertype rather than
 * reaching for precision it does not have.
 *
 * A lemma WordNet does not know resolves to `null`. Nothing is a value the
 * caller can see; a random guess is not.
 */

import artifact from './data/wordnet-senses.json' with { type: 'json' };

/**
 * WordNet lexicographer file → semantic primitives.
 *
 * Membership criterion for each row: the primitives a speaker would have to
 * assert to place a word in that lexicographer file. Where WordNet is finer than
 * the primitive inventory the row generalizes; it never invents.
 */
export const SUPERSENSE_TO_PRIMITIVES = Object.freeze({
  // ── Nouns: entities and their kinds ──────────────────────────────────────
  'noun.Tops': ['ABSTRACT'],                       // the root beginners; no finer claim is warranted
  'noun.act': ['ACTION'],
  'noun.animal': ['PHYS_OBJ'],
  'noun.artifact': ['PHYS_OBJ', 'CREATION'],
  'noun.attribute': ['ABSTRACT', 'STATE'],
  'noun.body': ['PHYS_OBJ', 'PART_WHOLE'],
  'noun.cognition': ['ABSTRACT', 'KNOW'],
  'noun.communication': ['ABSTRACT', 'COMMUNICATE'],
  'noun.event': ['PROCESS'],
  'noun.feeling': ['ABSTRACT', 'FEEL'],
  'noun.food': ['SUBSTANCE'],
  'noun.group': ['GROUP'],
  'noun.location': ['PLACE'],
  'noun.motive': ['ABSTRACT', 'WANT'],
  'noun.object': ['PHYS_OBJ'],
  'noun.person': ['PERSON'],
  'noun.phenomenon': ['PROCESS', 'CAUSE'],
  'noun.plant': ['PHYS_OBJ'],
  'noun.possession': ['POSSESSION'],
  'noun.process': ['PROCESS'],
  'noun.quantity': ['QUANTITY'],
  'noun.relation': ['ABSTRACT', 'SIMILAR'],
  'noun.shape': ['ABSTRACT', 'SPATIAL_REL'],
  'noun.state': ['STATE'],
  'noun.substance': ['SUBSTANCE'],
  'noun.time': ['TIME_REF'],

  // ── Verbs: what happens ──────────────────────────────────────────────────
  'verb.body': ['ACTION', 'PHYS_OBJ'],
  'verb.change': ['PROCESS', 'CAUSE'],
  'verb.cognition': ['KNOW'],
  'verb.communication': ['COMMUNICATE'],
  'verb.competition': ['ACTION', 'OPPOSITE'],
  'verb.consumption': ['ACTION', 'DESTRUCTION'],
  'verb.contact': ['ACTION', 'SPATIAL_REL'],
  'verb.creation': ['CREATION'],
  'verb.emotion': ['FEEL'],
  'verb.motion': ['MOTION'],
  'verb.perception': ['PERCEIVE'],
  'verb.possession': ['POSSESSION', 'TRANSFER'],
  'verb.social': ['ACTION', 'GROUP'],
  'verb.stative': ['STATE'],
  'verb.weather': ['PROCESS', 'PHENOMENON_FALLBACK'],

  // ── Modifiers ────────────────────────────────────────────────────────────
  'adj.all': ['STATE'],
  'adj.pert': ['TYPE_OF'],
  'adj.ppl': ['STATE', 'PAST'],
  'adv.all': ['FACTUAL']
});

// `verb.weather` reaches for a primitive the inventory does not have. Rather
// than silently keeping a dangling name, collapse it to the honest supertype.
const REPAIRS = Object.freeze({ PHENOMENON_FALLBACK: 'CAUSE' });

const INVENTORY = artifact.inventory;
const INDEX = artifact.index;

/** Supersenses WordNet records for a lemma, or null when it does not know it. */
export function supersensesFor(word) {
  const lemma = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!lemma) return null;
  const ids = INDEX[lemma];
  if (!ids) return null;
  return ids.map(i => INVENTORY[i]);
}

/**
 * Primitives WordNet grounds for a lemma, or null when it does not know it.
 *
 * Null, never a guess. The caller decides what an ungrounded word means; this
 * function refuses to decide it for them.
 *
 * @param {string} word
 * @returns {string[] | null}
 */
export function wordnetPrimitives(word) {
  const senses = supersensesFor(word);
  if (!senses || senses.length === 0) return null;

  const primitives = new Set();
  for (const sense of senses) {
    for (const primitive of SUPERSENSE_TO_PRIMITIVES[sense] || []) {
      primitives.add(REPAIRS[primitive] || primitive);
    }
  }
  return primitives.size === 0 ? null : [...primitives].sort();
}

export const WORDNET_SENSE_METADATA = Object.freeze({
  source: artifact.source,
  license: artifact.license,
  supersenses: INVENTORY.length,
  lemmaCount: artifact.lemmaCount
});

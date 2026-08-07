/**
 * CLOSED-CLASS WORD LISTS — the finite, enumerable parts of English
 *
 * A closed class does not take new members: no one coins a preposition. That
 * finiteness is what lets these live in Core at all — a fixed list is DATA, not
 * a learned model, so nothing here reads corpus statistics or needs training.
 *
 * ─── WHY THIS MODULE EXISTS ───────────────────────────────────────────────
 *
 * `PREPOSITION_CUES` was defined in `phonology/prosodic-metronome.js` and
 * imported by four constellation modules — governor, phraseAnalysis, readings
 * and compose. A list of prepositions is LEXICAL, not phonological: it says
 * nothing about sound, stress, or syllables, and every consumer wanted it for
 * syntax. Housing it in the phonology layer made syntax depend on phonology for
 * word lists, which is the wrong direction and made the layering unreadable.
 *
 * The canonical definition now lives here. `prosodic-metronome.js` re-exports
 * it so existing importers are unaffected.
 *
 * PURE DATA. No I/O, no computation.
 *
 * @module codex/core/lexical-analysis/closed-class
 */

/**
 * Prepositions, as SYNTACTIC cues.
 *
 * `past` is here because its absence cost a real case: in `the horse raced past
 * the barn fell` nothing marked `past` as a preposition, so it stayed a nominal
 * candidate (it carries an "n" tag) and `barn` looked like a free subject
 * rather than the object of a prepositional phrase.
 */
export const PREPOSITION_CUES = new Set([
  'of', 'in', 'on', 'at', 'from', 'with', 'by', 'for', 'into', 'onto', 'upon',
  'through', 'across', 'against', 'beneath', 'under', 'over', 'about', 'without',
  'past', 'beyond', 'beside', 'behind', 'within', 'among', 'toward', 'towards',
  'along', 'around', 'off',
  // Archaic prepositions. `unto` was the single most common untyped token (117).
  'unto', 'betwixt', 'amongst', 'amidst', 'ere', 'save',
]);

/** Determiners, including possessive determiners and bare quantifiers. */
export const DETERMINERS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those',
  'his', 'her', 'their', 'my', 'your', 'its', 'our',
  'no', 'some', 'any', 'each', 'every', 'all',
  'thy', 'thine',      // archaic possessive determiners
]);

/**
 * PRONOUNS CARRY CASE, and the distinction is load-bearing.
 *
 * Flattening these into one set let `him ran` and `us saw the dog` compose —
 * measured, not hypothesised. English marks subject and object forms
 * separately, so the class that records only membership throws away the one
 * feature that makes the words behave differently.
 *
 * `it` and `you` are genuinely both, and appear in both sets rather than being
 * assigned a side they do not have.
 */
export const PRONOUNS_NOMINATIVE = new Set([
  'he', 'she', 'it', 'they', 'we', 'i', 'you', 'one', 'both', 'none',
  // Archaic subject pronouns. Gutenberg's register, not modern English —
  // `ye` and `thou` were 66 and several dozen instances of untyped tokens.
  'ye', 'thou',
]);

/** Object forms, including reflexives, which never head a subject. */
export const PRONOUNS_ACCUSATIVE = new Set([
  'him', 'her', 'them', 'us', 'me', 'it', 'you',
  'himself', 'herself', 'itself', 'themselves', 'ourselves', 'yourself',
  'thee', 'thyself',   // archaic object forms
]);

/** Every pronoun, for callers that only need membership. */
export const PRONOUNS = new Set([...PRONOUNS_NOMINATIVE, ...PRONOUNS_ACCUSATIVE]);

/**
 * COPULAS — the only auxiliaries that take a predicate.
 *
 * `he is happy` is a clause; `he will happy` is not. Both were parsing, because
 * `will` and `is` sat in one undifferentiated `AUXILIARIES` set and the
 * predicate rules could not tell them apart.
 */
export const COPULAS = new Set([
  'is', 'was', 'are', 'were', 'be', 'been', 'being', 'am',
  'art', 'wast', 'wert',   // archaic copula forms
]);

/** Modals, which take a bare verb and never a predicate directly. */
export const MODALS = new Set([
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  'shalt', 'wilt', 'canst', 'couldst', 'wouldst', 'shouldst',  // archaic
]);

/** Perfect and progressive auxiliaries, plus do-support. */
export const AUXILIARY_VERBS = new Set([
  'had', 'has', 'have', 'do', 'does', 'did',
  // Archaic auxiliaries. `hath` alone was 30 untyped instances.
  'hath', 'hast', 'doth', 'dost', 'didst', 'hadst',
]);

/** Every auxiliary, for callers that only need membership. */
export const AUXILIARIES = new Set([...COPULAS, ...MODALS, ...AUXILIARY_VERBS]);

/** Coordinating conjunctions. */
export const CONJUNCTIONS = new Set(['and', 'or', 'but', 'nor', 'yet']);

/** Relative pronouns introducing a modifying clause. */
export const RELATIVIZERS = new Set(['who', 'which', 'that', 'whom', 'whose']);

/**
 * VERB PARTICLES — the second half of a phrasal verb.
 *
 * A particle is not a preposition, and the difference is whether an object is
 * required: `fell off the horse` takes one, `fell off` does not. Many words are
 * both (`off`, `on`, `over`, `by`), and membership in both sets is correct —
 * the two readings are genuinely available and the parse decides.
 *
 * Link Grammar devotes 228 connectors (K) to these, and two phrasal verbs sat
 * unparsed in the corpus failure sample.
 */
export const PARTICLES = new Set([
  'up', 'down', 'off', 'on', 'out', 'in', 'away', 'back', 'over', 'through',
  'along', 'around', 'round', 'aside', 'apart', 'together', 'forward', 'ahead',
  'about', 'across', 'by', 'under', 'upon', 'aback', 'asunder', 'forth',
]);

/**
 * Subordinating conjunctions. Several — `before`, `after`, `until`, `since`,
 * `as` — are ALSO prepositions, and membership in both sets is correct rather
 * than a conflict: `before dawn` and `before he spoke` are genuinely different
 * structures built on the same word.
 */
export const SUBORDINATORS = new Set([
  'because', 'although', 'though', 'when', 'while', 'if', 'since', 'unless',
  'until', 'before', 'after', 'as', 'whether', 'lest', 'once', 'whenever',
]);

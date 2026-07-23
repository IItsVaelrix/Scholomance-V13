/**
 * CONSTELLATION — local syntactic frame for heteronym resolution
 *
 * "the wound healed" and "he wound the clock" are different WORDS, not different
 * readings of one word. Which one is meant is decided by syntax, and the
 * pronunciation follows — never the reverse, because the pronunciation is the
 * unknown.
 *
 * DELIBERATELY NOT A POS TAGGER. There is none in this repo, and a general
 * tagger is the wrong shape anyway: this only has to answer one question, for
 * one token, and it is allowed — required — to abstain. A tagger that guesses
 * "noun" on no evidence would be inventing the very thing the caller needs
 * evidence for.
 *
 * The frames below are the ones that are decidable from a single neighbouring
 * token. Everything else returns null, which the probe reads as "the word cannot
 * be settled from this query" and refuses on. That is the honest outcome for a
 * bare query like `wound`, where no frame exists at all.
 */

/** A determiner or possessive immediately before a token makes it a noun. */
const NOUN_CUES_BEFORE = Object.freeze(new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'each', 'every', 'some', 'any',
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'no', 'another', 'one',
]));

/** A preposition before a token makes it (the head of) a noun phrase. */
const PREPOSITIONS = Object.freeze(new Set([
  'of', 'in', 'on', 'at', 'from', 'with', 'by', 'for', 'into', 'onto', 'upon',
  'through', 'across', 'against', 'beneath', 'under', 'over', 'about', 'without',
]));

/** A subject pronoun or auxiliary before a token makes it a verb. */
const VERB_CUES_BEFORE = Object.freeze(new Set([
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'who',
  'has', 'have', 'had', 'was', 'were', 'is', 'are', 'am', 'be', 'been', 'being',
  'will', 'would', 'shall', 'should', 'may', 'might', 'can', 'could', 'must',
  'did', 'does', 'do', 'to',
]));

/**
 * An object determiner AFTER a token suggests a transitive verb — "wound the
 * clock". Weaker than the before-cues, so it is only consulted when nothing
 * before the token decided it.
 */
const OBJECT_CUES_AFTER = Object.freeze(new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those',
  'my', 'your', 'his', 'her', 'its', 'our', 'their', 'him', 'them', 'me', 'us', 'it',
]));

/**
 * Resolve the part of speech of one token from its immediate neighbours.
 *
 * @param {string[]} tokens normalized query tokens
 * @param {string} target the token to resolve
 * @returns {{pos: 'n'|'v'|null, cue: string|null, index: number}}
 *   `pos: null` means UNDECIDABLE, never "probably a noun".
 */
export function resolveSyntacticFrame(tokens, target) {
  const list = Array.isArray(tokens) ? tokens.map((t) => String(t ?? '').toLowerCase()) : [];
  const needle = String(target ?? '').trim().toLowerCase();
  const none = { pos: null, cue: null, index: -1 };
  if (!needle) return none;

  const index = list.indexOf(needle);
  if (index === -1) return none;

  const before = index > 0 ? list[index - 1] : null;
  const after = index < list.length - 1 ? list[index + 1] : null;

  // Before-cues are checked first: they attach directly to the token.
  if (before) {
    if (NOUN_CUES_BEFORE.has(before)) return { pos: 'n', cue: `determiner:${before}`, index };
    if (PREPOSITIONS.has(before)) return { pos: 'n', cue: `preposition:${before}`, index };
    if (VERB_CUES_BEFORE.has(before)) return { pos: 'v', cue: `subject-or-aux:${before}`, index };
  }

  // Only consulted when nothing before decided it.
  if (after && OBJECT_CUES_AFTER.has(after)) {
    return { pos: 'v', cue: `object-follows:${after}`, index };
  }

  return { pos: null, cue: null, index };
}

/**
 * How many distinct WORDS remain viable for this spelling.
 *
 * ONE STATED ASSUMPTION, because it is doing real work: when a frame resolves a
 * part of speech, the matching lexical-entry group is taken to be ONE word. That
 * holds for the heteronyms this is built for — `wound` splits a:/W AW1 N D/
 * against n,v:/W UW1 N D/ — but it is not verified per entry, because per-entry
 * pronunciations are not ingested yet (OEWN carries them; see the sketch). If a
 * spelling ever has two pronunciations inside ONE part of speech, this will
 * under-count and must be revisited.
 *
 * Note what does NOT count: part-of-speech multiplicity on its own. bank n/v and
 * crane n/v are each one word, so a single pronunciation means one word however
 * many groups exist.
 *
 * @param {number|null} distinctPronunciations null when phonology could not answer
 * @param {{pos: string}[]} entryGroups POS-partitioned lexical entries
 * @param {'n'|'v'|null} framePos
 * @returns {number|null} null when it cannot be determined at all
 */
export function viableWordCount(distinctPronunciations, entryGroups, framePos) {
  if (typeof distinctPronunciations !== 'number') return null;
  if (distinctPronunciations <= 1) return 1;

  const groups = Array.isArray(entryGroups) ? entryGroups : [];
  if (groups.length <= 1) return 1;

  if (framePos) {
    const matched = groups.filter((g) => g.pos === framePos);
    if (matched.length === 1) return 1;
  }

  return groups.length;
}

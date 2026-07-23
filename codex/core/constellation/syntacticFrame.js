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
 * THE CUES LIVE IN PHONOLOGY, NOT HERE. prosodic-metronome.js already read this
 * exact beat — determiner before -> noun, `to`/modal/subject-pronoun before ->
 * verb, abstain otherwise — for the stress-shift homograph class. This module
 * duplicated its tables until they were consolidated; two frame readers with two
 * cue lists disagree precisely at the edges where a heteronym is decided.
 *
 * So this is now an adapter: it locates the token and translates the metronome's
 * noun/verb verdict into the POS codes wordnet_lemma uses. Constellation may
 * depend on phonology; phonology must never depend on constellation.
 */

import { resolveFrame } from '../phonology/prosodic-metronome.js';

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

  const { frame, cue } = resolveFrame(list, index);
  if (!frame) return { pos: null, cue: null, index };
  return { pos: frame === 'noun' ? 'n' : 'v', cue, index };
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

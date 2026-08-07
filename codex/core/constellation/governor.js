/**
 * GOVERNOR — the noun an adjective is predicated of
 *
 * In dependency grammar the governor (head) is the word that licenses a
 * dependent. In `the shadowy wood`, `wood` governs `shadowy`, and that single
 * relation is what settles which sense of the adjective is meant:
 *
 *     shadowy wood      -> wood     a place    -> "filled with shade"
 *     shadowy figure    -> figure   a person   -> "lacking clarity"
 *     shadowy dealings  -> dealings an act     -> "lacking substance"
 *
 * WHY A GOVERNOR AND NOT CONTEXT IN GENERAL. Scoring an adjective's candidate
 * senses against every context word was measured on the sense-probe seam and it
 * fires confidently wrong: for `a wound from the battle` the taxonomic metric
 * ranked "the act of inflicting a wound" top with a LARGER margin (0.286) than
 * the correct answer for `a wound of grief` (0.196), because `wound(act)` and
 * `battle(act)` are sibling acts. Diffuse context gives a diffuse answer. An
 * attributive adjective has exactly ONE governing noun, and it is the thing the
 * adjective is asserted of, so the comparison is one word against one word.
 *
 * DELIBERATELY NOT A PARSER. A dependency parser is a trained model, which
 * breaks the zero-I/O Core law and the determinism pageBytecode rests on.
 * English attributive attachment is overwhelmingly local — `ADJ NOUN` or
 * `DET ADJ+ NOUN` — so a bounded scan resolves the common cases and abstains on
 * the rest, in the same spirit as prosodic-metronome's resolveFrame: a reader
 * that guesses on no evidence invents the very thing its caller needs evidence
 * for.
 *
 * THE POS TABLE IS INJECTED. Core stays zero-I/O (PDR §18); the caller passes
 * the same batched POS map that phraseAnalysis already uses for head selection.
 *
 * @module codex/core/constellation/governor
 */

import { STOPWORDS } from './stopwords.js';
import { arbitrate, support, veto, abstain } from './cue-arbiter.js';
import { agreementSubject } from '../phonology/prosodic-metronome.js';

/**
 * How far right to look for the governed noun. `the bright autumn wound` puts
 * two modifiers between determiner and head; beyond three the attachment is no
 * longer reliably local and abstaining is more honest than reaching.
 */
const MAX_FORWARD_SCAN = 4;

/**
 * Prepositions that introduce a post-modifying noun phrase. In `shadowy with
 * age`, `age` is NOT what `shadowy` is predicated of, so a scan must stop here
 * rather than walk into the next phrase and return a false governor.
 */
const PHRASE_BREAKS = new Set([
  'with', 'without', 'from', 'by', 'than', 'as', 'like',
  'and', 'or', 'but', 'because', 'while', 'when', 'where',
]);

/**
 * Determiners. An attributive adjective is NEVER separated from its noun by
 * one: `shadowy wood` and `bright autumn wound` are attributive, `past the
 * barn` is not. This is the cue that was missing — the forward scan skipped
 * stopwords, so the determiner in `past the barn` was invisible and `past`
 * (which carries an "a" tag) resolved as an adjective governing `barn`.
 */
const DETERMINERS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'no', 'every', 'each', 'some', 'any', 'another', 'both', 'either', 'neither',
]);

/** Copulas: `the wood was shadowy` puts the governor BEFORE the adjective. */
const COPULAS = new Set([
  'is', 'was', 'are', 'were', 'am', 'be', 'been', 'being',
  'seems', 'seemed', 'looks', 'looked', 'feels', 'felt', 'grew', 'grows', 'became', 'becomes',
]);

const isNoun = (posMap, word) => (posMap?.get(word) || []).includes('n');

/**
 * Resolve the noun an adjective governs, or abstain.
 *
 * @param {string[]} tokens        normalized query tokens
 * @param {string} adjective       the token to find a governor for
 * @param {Map<string, string[]>} posMap  word -> wordnet POS tags
 * @returns {{ governor: string|null, relation: 'attributive'|'predicative'|null,
 *   distance: number|null, cue: string|null }}
 *   `governor: null` means UNDECIDABLE, never "probably this noun".
 */
export function resolveGovernor(tokens, adjective, posMap) {
  const list = Array.isArray(tokens) ? tokens.map((t) => String(t ?? '').toLowerCase()) : [];
  const target = String(adjective ?? '').trim().toLowerCase();
  const none = { governor: null, relation: null, distance: null, cue: null };
  if (!target || list.length < 2) return none;

  const index = list.indexOf(target);
  if (index === -1) return none;

  /**
   * ATTRIBUTIVE — `shadowy wood`. Each structural condition declares itself to
   * the arbiter rather than being an early `continue`, so the reason a pairing
   * was rejected survives into the result instead of vanishing into control
   * flow.
   */
  for (let i = index + 1; i < list.length && i <= index + MAX_FORWARD_SCAN; i += 1) {
    const tok = list[i];
    const distance = i - index;

    const ruling = arbitrate([
      // A conjunction or a new preposition ends the phrase outright.
      PHRASE_BREAKS.has(tok) ? veto('phrase-break') : abstain('phrase-break'),
      // A copula means the adjective is predicative, handled below, not here.
      COPULAS.has(tok) ? veto('copula-ahead') : abstain('copula-ahead'),
      /**
       * THE DETERMINER BARRIER. Ungrammatical, not merely unlikely: no English
       * attributive adjective takes a determiner before its noun, so this vetoes
       * rather than down-weighting. `past the barn` dies here.
       */
      DETERMINERS.has(tok) ? veto('determiner-barrier') : abstain('determiner-barrier'),
      /**
       * A NOUN INSIDE A COMPOUND IS NOT THE HEAD.
       *
       * `the bright autumn wound` resolved `bright` onto `autumn`, because the
       * scan settled on the first noun it met. English noun-noun compounds put
       * the head LAST — `bright` modifies `autumn wound` entire — so a noun
       * followed by another noun keeps scanning.
       *
       * The trap is `cold water runs deep`, where `water runs` is also
       * noun-followed-by-noun (`runs` carries an "n" tag) but is subject-verb,
       * not a compound. Agreement already distinguishes the two, so this cue
       * consults it rather than re-deciding: -s on exactly one of the pair means
       * predicate, and the compound reading is off.
       */
      (isNoun(posMap, tok)
        && isNoun(posMap, list[i + 1])
        && agreementSubject(tok, list[i + 1]) !== 'first')
        ? support('compound-continues', null, 20)
        : abstain('compound-continues'),
      // The head itself: a noun, at the end of a run of modifiers.
      isNoun(posMap, tok)
        ? support('nominal-head', { governor: tok, distance }, 10)
        : abstain('nominal-head'),
      // Another modifier stacked before the head — keep scanning.
      (!isNoun(posMap, tok) && !STOPWORDS.has(tok))
        ? support('modifier-chain', null, 1)
        : abstain('modifier-chain'),
    ]);

    if (ruling.vetoedBy) break;
    if (ruling.decidedBy === 'nominal-head') {
      return {
        governor: ruling.payload.governor,
        relation: 'attributive',
        distance: ruling.payload.distance,
        cue: `right:${ruling.payload.distance}`,
        decidedBy: ruling.decidedBy,
      };
    }
    // compound-continues, modifier-chain, or nothing at all: advance.
  }

  /**
   * PREDICATIVE — `the wood was shadowy`. The copula points back at the
   * subject, so the governor sits to the LEFT. Only a copula licenses this;
   * without one, a preceding noun is just a neighbour.
   */
  const prev = index > 0 ? list[index - 1] : null;
  if (prev && COPULAS.has(prev)) {
    for (let i = index - 2; i >= 0 && i >= index - MAX_FORWARD_SCAN - 1; i -= 1) {
      const tok = list[i];
      if (PHRASE_BREAKS.has(tok)) break;
      if (isNoun(posMap, tok)) {
        return { governor: tok, relation: 'predicative', distance: index - i, cue: `copula:${prev}` };
      }
    }
  }

  return none;
}

/**
 * Every governed adjective→noun pair in a token list.
 *
 * @returns {Array<{ adjective: string, governor: string, relation: string, distance: number }>}
 */
export function resolveGovernedPairs(tokens, posMap) {
  const list = Array.isArray(tokens) ? tokens.map((t) => String(t ?? '').toLowerCase()) : [];
  const out = [];
  const seen = new Set();
  for (const tok of list) {
    if (seen.has(tok)) continue;
    seen.add(tok);
    const tags = posMap?.get(tok) || [];
    // Only ask for words that can BE adjectives. 's' is WordNet's satellite tag.
    if (!tags.includes('a') && !tags.includes('s')) continue;
    const r = resolveGovernor(list, tok, posMap);
    if (r.governor) {
      out.push({ adjective: tok, governor: r.governor, relation: r.relation, distance: r.distance });
    }
  }
  return out;
}

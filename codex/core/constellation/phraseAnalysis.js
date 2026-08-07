/**
 * ConstellationOS — Phrase Analysis Core Module
 *
 * Pure, deterministic, zero-I/O (PDR §18 Core law).
 * All corpus-frequency data is injected via the `freqMap` parameter
 * (a Map<string, number> from lexiconAdapter.getCorpusFrequencies).
 *
 * Provides:
 *  - Intent classification (literary / meta-query / craft-instruction / comparison)
 *  - Head-token selection via rarest-content-token rule (PDR §3.2)
 *  - Multi-word compound detection (adj+noun bigrams)
 *  - Token role assignment (modifier / head / connector / specifier)
 *  - Phrase-level literary device detection (alliteration, assonance,
 *    consonance, sibilance, imagery-candidate)
 *
 * @module codex/core/constellation/phraseAnalysis
 */

import { STOPWORDS } from './stopwords.js';
import { agreementSubject } from '../phonology/prosodic-metronome.js';

// ─── Intent Classification ───────────────────────────────────────────

/**
 * Signal words that indicate the user is asking the system to DO something
 * rather than presenting a literary phrase for analysis.
 */
const META_QUERY_SIGNALS = new Set([
  'words', 'word', 'rhyme', 'rhymes', 'find', 'show', 'give', 'list',
  'suggest', 'recommend', 'search', 'lookup', 'look', 'tell',
]);

const CRAFT_INSTRUCTION_SIGNALS = new Set([
  'make', 'rewrite', 'improve', 'fix', 'change', 'turn', 'transform',
  'more', 'less', 'sonic', 'darker', 'lighter', 'sharper', 'softer',
]);

const COMPARISON_SIGNALS = new Set([
  'compare', 'contrast', 'versus', 'vs', 'difference', 'similar',
  'better', 'worse', 'which',
]);

/**
 * Classify the user's intent from the query identity.
 *
 * @param {{ normalized: string, tokens: string[], kind: string }} identity
 * @returns {'literary'|'meta-query'|'craft-instruction'|'comparison'}
 */
export function classifyIntent(identity) {
  const tokens = identity.tokens || [];
  if (tokens.length === 0) return 'literary';

  const lower = identity.normalized || '';

  // Meta-query: "words that rhyme with X", "find me a word for Y"
  // Checked FIRST because meta-signals like "find words similar to X"
  // contain comparison-adjacent words but are clearly instructions.
  const metaHits = tokens.filter((t) => META_QUERY_SIGNALS.has(t)).length;
  const hasRelativizer = /\b(that|which|for|like|similar to)\b/.test(lower);
  if (metaHits >= 2 || (metaHits >= 1 && hasRelativizer)) return 'meta-query';

  // Craft instruction: imperative verbs + qualitative modifiers
  const craftHits = tokens.filter((t) => CRAFT_INSTRUCTION_SIGNALS.has(t)).length;
  if (craftHits >= 1) return 'craft-instruction';

  // Comparison: explicit comparison verbs or "X vs Y" patterns
  const comparisonHits = tokens.filter((t) => COMPARISON_SIGNALS.has(t)).length;
  if (comparisonHits >= 1 && tokens.length >= 3) return 'comparison';

  // Default: treat as a literary phrase to analyze
  return 'literary';
}

// ─── Head-Token Selection (PDR §3.2 fix) ─────────────────────────────

/**
 * Select the semantic anchor token using the PDR §3.2 rule:
 * "choosing the rarest/last content word as the semantic anchor."
 *
 * Rarest wins; ties break toward the last content token.
 * Falls back to last-content-token when no frequency data is available.
 *
 * NOMINAL HEADS RANK FIRST. Rarity alone anchored `the wound healed` on
 * "healed" — corpus frequency 7 against wound's 79 — so the page answered a
 * question nobody asked. A phrase is ABOUT its nominal head; the predicate is
 * what is said about it. Rarity is the right ordering, but only among the
 * tokens that can be a subject in the first place.
 *
 * The POS partition is injected, never looked up: this module is zero-I/O
 * (PDR §18 Core law), exactly as freqMap is injected. With no POS data the
 * function degrades to the original rarity-over-all-content behaviour, which is
 * the honest reading of "no signal" — not "nothing is a noun".
 *
 * @param {string[]} tokens
 * @param {Map<string, number>} [freqMap] - word → corpus occurrence count
 * @param {Map<string, string[]>} [posMap] - word → wordnet POS tags (['a','n','v'])
 * @returns {string|null}
 */
export function selectHeadToken(tokens, freqMap, posMap) {
  const content = (tokens || []).filter((t) => !STOPWORDS.has(t) && t.length > 0);
  if (content.length === 0) return null;

  /**
   * A NOUN TAG IS NOT A NOUN ROLE.
   *
   * `cold water runs deep` anchored on `runs` and `the silent stars burn` on
   * `burn`: both carry a noun sense somewhere in wordnet and both are rarer than
   * the actual subject, so rarity handed the page to a word that is plainly
   * verbing.
   *
   * THE GENERAL FRAME READER CANNOT CLOSE THIS. Filtering through resolveFrame
   * was tried and fixed NEITHER case — its cue tables read determiners, subject
   * pronouns and prepositions, and a bare noun sitting before a verb matches
   * none of them. It also flipped `he wound the clock` onto `clock`, discarding
   * the heteronym that query exists to disambiguate.
   *
   * AGREEMENT IS THE CUE THAT WORKS, and it is purely orthographic: English puts
   * -s on exactly one of a subject/verb pair, so the complementary distribution
   * across an ADJACENT pair names the roles with no lookup at all. It fires only
   * where a signal genuinely exists, and only against the token to the right, so
   * it cannot demote a word that no candidate follows — which is why
   * `he wound the clock` keeps its anchor.
   */
  const nominal = posMap && posMap.size > 0
    ? content.filter((t) => (posMap.get(t) || []).includes('n'))
    : [];

  /**
   * Drop a nominal that agreement identifies as the VERB of an adjacent pair.
   * Adjacency in the original token stream is required: `stars ... burn` with a
   * determiner between them is not one clause's subject and predicate.
   */
  const demoted = new Set();
  const all = tokens || [];
  for (let i = 0; i + 1 < all.length; i += 1) {
    const a = all[i];
    const b = all[i + 1];
    if (!nominal.includes(a) || !nominal.includes(b)) continue;
    /**
     * A DEMOTED TOKEN CANNOT THEN BE A SUBJECT.
     *
     * Without this the demotion chains: in `cold water runs deep`, `water runs`
     * correctly marks `runs` a verb, and then `runs deep` reads `runs` as a
     * subject and demotes `deep` as well. Both nominals downstream of the verb
     * were removed and the anchor fell through to `cold`. Agreement describes
     * ONE subject/predicate pair; a word already settled as the predicate is not
     * available to head the next one.
     */
    if (demoted.has(a)) continue;
    if (agreementSubject(a, b) === 'first') demoted.add(b);
  }
  const filtered = nominal.filter((t) => !demoted.has(t));
  // No nominal candidate is not a failure — a query can be all verbs and
  // adjectives, and rarity over everything is still the best available answer.
  const nominalPool = filtered.length > 0 ? filtered : nominal;
  const pool = nominalPool.length > 0 ? nominalPool : content;

  if (!freqMap || freqMap.size === 0) return pool[pool.length - 1];

  let best = pool[pool.length - 1];
  // Unknown words (not in freqMap) are treated as maximally rare (freq 0).
  let bestFreq = freqMap.get(best) ?? 0;

  for (let i = pool.length - 2; i >= 0; i -= 1) {
    const freq = freqMap.get(pool[i]) ?? 0;
    // Strictly rarer wins; equal freq keeps the later (rightmost) token
    if (freq < bestFreq) {
      best = pool[i];
      bestFreq = freq;
    }
  }
  return best;
}

// ─── Compound Detection ──────────────────────────────────────────────

/**
 * Lightweight adjective-ish detector. Not a full POS tagger — uses
 * morphological heuristics that cover the most common English adjective
 * suffixes, plus a frozen set of high-frequency irregular adjectives
 * that don't follow suffix patterns.
 */
const ADJ_SUFFIXES = [
  'ous', 'ful', 'less', 'ish', 'ive', 'able', 'ible', 'al', 'ic',
  'ent', 'ant', 'ary', 'ory', 'ly', 'en', 'ern', 'like', 'some',
];

/** Common irregular adjectives that don't match suffix heuristics. */
const IRREGULAR_ADJECTIVES = new Set([
  'bright', 'dark', 'cold', 'deep', 'sharp', 'soft', 'hard', 'warm',
  'cool', 'thin', 'thick', 'wide', 'narrow', 'long', 'short', 'tall',
  'small', 'big', 'great', 'grand', 'wild', 'mild', 'fierce', 'gentle',
  'pale', 'dim', 'vast', 'bare', 'raw', 'grim', 'stark', 'blunt',
  'swift', 'slow', 'quick', 'still', 'calm', 'rough', 'smooth', 'flat',
  'round', 'hollow', 'solid', 'dense', 'rare', 'strange', 'odd', 'new',
  'old', 'young', 'true', 'false', 'pure', 'foul', 'fair', 'foul',
  'sweet', 'bitter', 'sour', 'fresh', 'stale', 'clean', 'dirty',
  'wet', 'dry', 'hot', 'cold', 'dead', 'alive', 'sick', 'well',
  'rich', 'poor', 'free', 'bound', 'lost', 'found', 'broken', 'whole',
  'golden', 'silver', 'iron', 'stone', 'crystal', 'glass',
  'silent', 'loud', 'quiet', 'noisy', 'empty', 'full',
  'black', 'white', 'red', 'blue', 'green', 'grey', 'gray',
  'ancient', 'eternal', 'mortal', 'sacred', 'profane', 'divine',
  'spectral', 'phantom', 'shadow', 'hollow', 'secret', 'hidden',
]);

function looksAdjective(token) {
  if (token.length < 3) return false;
  const lower = token.toLowerCase();
  if (IRREGULAR_ADJECTIVES.has(lower)) return true;
  return ADJ_SUFFIXES.some((s) => lower.endsWith(s));
}

/**
 * Detect likely multi-word compounds (adjective + noun bigrams) in a
 * token sequence. Returns an array of compound strings.
 *
 * @param {string[]} tokens
 * @returns {string[]} e.g. ["bright wound"]
 */
export function detectCompounds(tokens) {
  const compounds = [];
  const list = tokens || [];
  for (let i = 0; i < list.length - 1; i += 1) {
    const a = list[i];
    const b = list[i + 1];
    if (STOPWORDS.has(a) || STOPWORDS.has(b)) continue;
    // adj + content-word pattern
    if (looksAdjective(a) && b.length > 2 && !looksAdjective(b)) {
      compounds.push(`${a} ${b}`);
    }
  }
  return compounds;
}

// ─── Token Roles ─────────────────────────────────────────────────────

/**
 * Assign lightweight structural roles to each token.
 *
 * @param {string[]} tokens
 * @param {string|null} headToken
 * @returns {Array<{ token: string, role: 'head'|'modifier'|'connector'|'specifier' }>}
 */
export function assignTokenRoles(tokens, headToken) {
  return (tokens || []).map((token) => {
    if (token === headToken) return { token, role: 'head' };
    if (STOPWORDS.has(token)) return { token, role: 'connector' };
    if (looksAdjective(token)) return { token, role: 'modifier' };
    // Remaining content tokens near the head are specifiers
    return { token, role: 'specifier' };
  });
}

// ─── Literary Device Detection ───────────────────────────────────────

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

/**
 * Extract the stressed vowel nucleus from a token (first vowel cluster).
 * Returns null if no vowel found.
 */
function vowelNucleus(token) {
  const t = (token || '').toLowerCase().replace(/[^a-z]/g, '');
  let nucleus = '';
  let started = false;
  for (const ch of t) {
    if (VOWELS.has(ch)) {
      started = true;
      nucleus += ch;
    } else if (started) {
      break; // end of first vowel cluster
    }
  }
  return nucleus || null;
}

/**
 * Detect phrase-level literary devices from the token list.
 *
 * Devices detected:
 *  - alliteration:       2+ content tokens share an initial consonant
 *  - assonance:          2+ content tokens share a vowel nucleus
 *  - consonance:         2+ content tokens share a final consonant
 *  - sibilance:          2+ content tokens begin with sibilant sounds (s, sh, z, zh)
 *  - imagery-candidate:  phrase contains a concrete sensory noun pattern
 *
 * @param {{ tokens: string[] }} identity
 * @returns {string[]}
 */
export function detectPhraseDevices(identity) {
  const content = (identity.tokens || []).filter(
    (t) => !STOPWORDS.has(t) && t.length > 1,
  );
  if (content.length < 2) return [];

  const devices = [];

  // Alliteration: shared initial letter among content tokens
  const initials = content.map((t) => t[0].toLowerCase());
  const initialCounts = new Map();
  for (const c of initials) initialCounts.set(c, (initialCounts.get(c) || 0) + 1);
  if ([...initialCounts.values()].some((n) => n >= 2)) {
    devices.push('alliteration');
  }

  // Sibilance: 2+ tokens starting with sibilant sounds
  const sibilants = content.filter((t) => /^(s|sh|z|zh)/.test(t.toLowerCase()));
  if (sibilants.length >= 2) devices.push('sibilance');

  // Assonance: shared vowel nucleus
  const nuclei = content.map(vowelNucleus).filter(Boolean);
  const nucleusCounts = new Map();
  for (const n of nuclei) nucleusCounts.set(n, (nucleusCounts.get(n) || 0) + 1);
  if ([...nucleusCounts.values()].some((n) => n >= 2)) {
    devices.push('assonance');
  }

  // Consonance: shared final consonant
  const finals = content
    .map((t) => {
      const clean = t.toLowerCase().replace(/[^a-z]/g, '');
      return clean.length > 0 ? clean[clean.length - 1] : null;
    })
    .filter((c) => c && !VOWELS.has(c));
  const finalCounts = new Map();
  for (const f of finals) finalCounts.set(f, (finalCounts.get(f) || 0) + 1);
  if ([...finalCounts.values()].some((n) => n >= 2)) {
    devices.push('consonance');
  }

  // Imagery candidate: adj+noun compound detected (concrete sensory language)
  const compounds = detectCompounds(identity.tokens || []);
  if (compounds.length > 0) {
    devices.push('imagery-candidate');
  }

  return devices;
}

// ─── Orchestrator ────────────────────────────────────────────────────

/**
 * Full phrase-structure analysis. Pure function — all data injected.
 *
 * @param {{ tokens: string[], normalized: string, kind: string }} identity
 * @param {Map<string, number>} [freqMap] - word → corpus frequency
 * @param {Map<string, string[]>} [posMap] - word → wordnet POS tags
 * @returns {{
 *   intent: string,
 *   headToken: string|null,
 *   compounds: string[],
 *   tokenRoles: Array<{ token: string, role: string }>,
 *   devices: string[],
 * }}
 */
export function analyzePhraseStructure(identity, freqMap, posMap) {
  const intent = classifyIntent(identity);
  const headToken = selectHeadToken(identity.tokens, freqMap, posMap);
  const compounds = detectCompounds(identity.tokens);
  const tokenRoles = assignTokenRoles(identity.tokens, headToken);
  const devices = detectPhraseDevices(identity);

  return { intent, headToken, compounds, tokenRoles, devices };
}

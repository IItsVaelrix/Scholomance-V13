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
import { agreementSubject, PREPOSITION_CUES } from '../phonology/prosodic-metronome.js';
import { arbitrate, support, veto, abstain } from './cue-arbiter.js';

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
 * Tokens agreement identifies as the PREDICATE of an adjacent pair.
 *
 * Adjacency in the original stream is required: `stars ... burn` with a
 * determiner between them is not one clause's subject and predicate.
 *
 * A DEMOTED TOKEN CANNOT THEN BE A SUBJECT. Without that guard the demotion
 * chains — in `cold water runs deep`, `water runs` correctly marks `runs` a
 * predicate, and then `runs deep` reads `runs` as a subject and takes `deep`
 * too. Both nominals downstream of the verb vanished and the anchor fell
 * through to `cold`. Agreement describes ONE subject/predicate pair.
 */
function agreementPredicates(tokens, nominal) {
  const out = new Set();
  const all = tokens || [];
  for (let i = 0; i + 1 < all.length; i += 1) {
    const a = all[i];
    const b = all[i + 1];
    if (!nominal.includes(a) || !nominal.includes(b)) continue;
    if (out.has(a)) continue;
    if (agreementSubject(a, b) === 'first') out.add(b);
  }
  return out;
}

/**
 * Is the token at `index` the object of a preposition?
 *
 * Scans left across determiners only — `past the barn` and `across roads` both
 * qualify, `past the barn fell` does not reach `fell`, and a content word
 * between the two ends the search rather than being scanned through.
 */
function insidePrepositionalPhrase(tokens, index) {
  if (index < 1) return false;
  const DETERMINERS = new Set(['a', 'an', 'the', 'this', 'that', 'these', 'those',
    'my', 'your', 'his', 'her', 'its', 'our', 'their']);
  for (let i = index - 1; i >= 0 && index - i <= 2; i -= 1) {
    const tok = tokens[i];
    if (PREPOSITION_CUES.has(tok)) return true;
    if (!DETERMINERS.has(tok)) return false;
  }
  return false;
}

/**
 * Resolve the phrase's anchor, with the reason it was chosen.
 *
 * CONVERTED TO THE ARBITER because precedence used to live in statement order
 * and the winner was never recorded. Six cues had accumulated, one of them
 * (`predicate-complement`) silently depending on another (`agreement-predicate`)
 * having already run — the kind of implicit coupling that broke when a seventh
 * cue was tried and had to be deleted wholesale.
 *
 * Eligibility is decided PER TOKEN: support means "may anchor the phrase", veto
 * means "structurally cannot". Ranking among the survivors happens afterwards
 * and is a separate question — see the note on rarity below.
 *
 * @returns {{ token: string|null, decidedBy: string|null, pool: string[],
 *   demoted: Array<{ token: string, vetoedBy: string }> }}
 */
export function resolveHead(tokens, freqMap, posMap) {
  const all = tokens || [];
  const content = all.filter((t) => !STOPWORDS.has(t) && t.length > 0);
  if (content.length === 0) {
    return { token: null, decidedBy: null, pool: [], demoted: [] };
  }

  const hasPos = posMap && posMap.size > 0;
  const nominal = hasPos ? content.filter((t) => (posMap.get(t) || []).includes('n')) : [];
  const predicates = agreementPredicates(all, nominal);

  const demoted = [];
  const eligible = [];
  for (const t of nominal) {
    const at = all.indexOf(t);
    const next = at >= 0 ? all[at + 1] : null;
    const prev = at > 0 ? all[at - 1] : null;
    const adjectival = looksAdjective(t);

    const ruling = arbitrate([
      /**
       * Agreement settled this token as the predicate of an adjacent pair.
       * Purely orthographic: English puts -s on exactly one of subject/verb.
       */
      predicates.has(t) ? veto('agreement-predicate') : abstain('agreement-predicate'),
      /**
       * An adjective sitting on a following nominal MODIFIES it. `cold` in
       * `cold water` carries a noun sense — the sensation — but occupies a
       * modifier slot, not a referential one.
       */
      (adjectival && next && nominal.includes(next) && !predicates.has(next))
        ? veto('attributive-modifier') : abstain('attributive-modifier'),
      /**
       * An adjective after the token agreement settled as the verb COMPLEMENTS
       * that verb. `deep` in `runs deep` is not a second subject.
       */
      (adjectival && prev && predicates.has(prev))
        ? veto('predicate-complement') : abstain('predicate-complement'),
      /**
       * A NOMINAL INSIDE A PREPOSITIONAL PHRASE IS NOT THE CLAUSE SUBJECT.
       *
       * The cue the garden-path sentence was missing. `the horse raced past the
       * barn fell` demoted nothing at all — every existing cue abstained,
       * because none of them reads further than an adjacent pair — and rarity
       * took `barn` (freq 25) over `horse` (206). `barn` is the object of
       * `past`, so it was never available to head the clause.
       *
       * PREPOSITIONS ARE A CLOSED CLASS, AND THAT IS THE WHOLE POINT. An earlier
       * form of this cue vetoed any nominal introduced by an object-taking
       * token, which also caught `saw a comet` and demoted `comet` — correct for
       * subjecthood, wrong for a reader asking about the comet. Restricting the
       * trigger to a fixed preposition list separates the prepositional object
       * from the direct object, and leaves salience alone.
       */
      insidePrepositionalPhrase(all, at) ? veto('pp-object') : abstain('pp-object'),
      /**
       * A preposition is not a referent, whatever tags it carries. `past` holds
       * an "n" tag (a past, as in history) and would otherwise compete for the
       * anchor of a sentence it merely joins.
       */
      PREPOSITION_CUES.has(t) ? veto('preposition') : abstain('preposition'),
      // Nothing disqualifying: this token may anchor the phrase.
      support('nominal-candidate', t, 1),
    ]);

    if (ruling.vetoedBy) demoted.push({ token: t, vetoedBy: ruling.vetoedBy });
    else eligible.push(t);
  }

  /**
   * Never strip the last candidate standing. A phrase whose every nominal was
   * demoted still has to be about something, and falling back is honester than
   * returning null on `dark` alone.
   */
  const pool = eligible.length > 0 ? eligible
    : (nominal.length > 0 ? nominal : content);

  if (!freqMap || freqMap.size === 0) {
    return { token: pool[pool.length - 1], decidedBy: 'last-content', pool, demoted };
  }

  /**
   * RARITY RANKS THE SURVIVORS — PDR §3.2, "the rarest/last content word as the
   * semantic anchor". It is a SALIENCE heuristic, not a grammatical one, and
   * the distinction is live: measured on `the horse raced past the barn fell`,
   * rarity takes `barn` (freq 25) while grammatical subjecthood wants `horse`.
   * First-in-pool would win that case and lose `the man saw a comet`, where the
   * rarest token is the one the reader is asking about. Both cues genuinely
   * support and they disagree, which is a product judgement rather than a
   * precedence constant, so rarity is left in charge and the tension is recorded
   * rather than silently resolved.
   */
  let best = pool[pool.length - 1];
  let bestFreq = freqMap.get(best) ?? 0;
  for (let i = pool.length - 2; i >= 0; i -= 1) {
    const freq = freqMap.get(pool[i]) ?? 0;
    if (freq < bestFreq) {
      best = pool[i];
      bestFreq = freq;
    }
  }
  return { token: best, decidedBy: 'rarity', pool, demoted };
}

/**
 * Select the semantic anchor token.
 *
 * Thin wrapper over resolveHead, kept because callers and tests want the token
 * alone. Anything that needs to show its work should call resolveHead.
 *
 * @param {string[]} tokens
 * @param {Map<string, number>} [freqMap] - word → corpus occurrence count
 * @param {Map<string, string[]>} [posMap] - word → wordnet POS tags
 * @returns {string|null}
 */
export function selectHeadToken(tokens, freqMap, posMap) {
  return resolveHead(tokens, freqMap, posMap).token;
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
  /**
   * The anchor now travels with its reason. An unexplained answer is the
   * failure this codebase keeps rediscovering — wordnet's rank-1 passed as an
   * evidenced sense until it rendered a film actress for `shadowy wood` — and
   * head selection had no equivalent of leximancy's `selectedBy` until here.
   */
  const head = resolveHead(identity.tokens, freqMap, posMap);
  const headToken = head.token;
  const compounds = detectCompounds(identity.tokens);
  const tokenRoles = assignTokenRoles(identity.tokens, headToken);
  const devices = detectPhraseDevices(identity);

  return {
    intent,
    headToken,
    headDecidedBy: head.decidedBy,
    headPool: head.pool,
    headDemoted: head.demoted,
    compounds,
    tokenRoles,
    devices,
  };
}

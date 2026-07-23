/**
 * CONSTELLATION — sense probe harness
 *
 * Collects the three observations CONSTELLATION_SENSE_PROBE declares. The
 * compiler never runs tools (probeRegistry.ts); this is the tool side, and it is
 * deliberately dumb.
 *
 * THE DIVISION THIS FILE EXISTS TO HOLD. The harness reports MEASUREMENTS —
 * raw glosses, raw tokens, a measured cosine. It must not report CONCLUSIONS.
 * There is no `glossOverlapCount` here, no `overlapDelta`, no
 * `allKinHaveRelPath`: those are judgements, and the sealed predicates compute
 * them. A harness that pre-digests evidence moves the judgement out of the
 * formula, which is the leak types.ts:278 warns about.
 *
 * CALLED BY semanticInquiry.adapter on the live request path.
 */

import { phonotopographicSimilarity } from '../../../core/semantic/phonotopography.js';
import { CmuPhonemeEngine } from '../../../core/phonology/cmu.phoneme.engine.js';
import { sameWordPronunciation } from '../../../core/phonology/phonologicalProcesses.js';
import {
  CONSTELLATION_SENSE_PROBE,
} from '../../../core/constellation/semanticInquiry.js';

/**
 * CMU must be LOADED before we ask it anything, not merely told to load.
 *
 * Firing init() without awaiting made the answer depend on server uptime: cold,
 * pronunciationVariants returns [] and every sense hypothesis lands
 * `underdetermined`; warm, the same query resolves. One query, two answers,
 * which is exactly the non-determinism the page contract forbids. init() is
 * idempotent and cached, so awaiting it costs one load for the process.
 */
/**
 * The default phonology source. Injected rather than reached for, because a
 * hidden global cannot be tested and fails invisibly: under vitest cmudict does
 * not load at all, so a harness that reads it directly reports "cannot tell" for
 * every word while looking perfectly healthy.
 */
export const cmuPhonologySource = {
  async ready() {
    if (CmuPhonemeEngine._available) return true;
    try {
      await CmuPhonemeEngine.init();
    } catch {
      return false;
    }
    return CmuPhonemeEngine._available === true;
  },
  variants(word) {
    return CmuPhonemeEngine.pronunciationVariants(word);
  },
};

const MAX_CANDIDATES = 12;
const MAX_EDGES = 40;

/**
 * A measurement draft, not a receipt.
 *
 * Sealing a receipt needs makeReceipt from observationReceipt.ts, and production
 * runs plain `node` with no TS loader (Dockerfile CMD) — a server .js importing
 * a .ts module throws ERR_UNKNOWN_FILE_EXTENSION.
 *
 * Nothing is lost by stopping here: evaluateHypotheses reads only
 * observationId / status / result. Receipt hashes exist for sealed replay, not
 * for evaluation, so the request path evaluates drafts directly.
 *
 * @typedef {{ observationId: string, result: unknown, status: 'observed'|'refused'|'error'|'inconclusive' }} ObservationDraft
 */

/** @returns {ObservationDraft} */
function draft(observationId, result, status) {
  return { observationId, result, status };
}

/** Reuse the adapter's own gloss extractor, which takes a sense array. */
function senseGloss(lexiconAdapter, sense) {
  return (lexiconAdapter.extractGloss?.([sense]) || '').trim();
}

/**
 * Is the adapter actually connected? A disconnected adapter returns [] from
 * every lookup, which is indistinguishable from "the word has no senses" unless
 * we ask. Reporting an outage as `observed: []` would let a DB failure look like
 * evidence of absence — the exact direction of lie evalPredicate guards against.
 */
function isConnected(lexiconAdapter) {
  return lexiconAdapter?.__unsafe?.connected !== false;
}

/**
 * Candidate senses + raw query tokens.
 *
 * @param {object} lexiconAdapter
 * @param {string} headToken
 * @param {string[]} queryTokens
 */
function observeSenseCandidates(lexiconAdapter, headToken, queryTokens) {
  if (!isConnected(lexiconAdapter)) {
    return draft('obs.lex.sense_candidates', null, 'error');
  }

  const entries = lexiconAdapter.lookupWord?.(headToken, MAX_CANDIDATES) || [];
  const candidates = [];
  for (const entry of entries) {
    const senses = Array.isArray(entry?.senses) ? entry.senses : [];
    for (const sense of senses) {
      const gloss = senseGloss(lexiconAdapter, sense);
      // A sense with no gloss text is not a candidate: the predicate would read
      // it as an unanswered question and go inconclusive for the whole set.
      if (!gloss) continue;
      candidates.push({
        senseId: `${headToken}.${(sense && sense.pos) || entry.pos || 'x'}.${candidates.length}`,
        lemma: entry.headword || headToken,
        pos: (sense && sense.pos) || entry.pos || '',
        gloss,
      });
      if (candidates.length >= MAX_CANDIDATES) break;
    }
    if (candidates.length >= MAX_CANDIDATES) break;
  }

  /**
   * CONTEXT EXCLUDES THE WORD BEING DEFINED.
   *
   * Measured on the real dictionary: leaving the head token in made it the
   * dominant signal, because a gloss that happens to be self-referential ("the
   * act of inflicting a wound") scores a match against the query word itself.
   * That is not disambiguation — it selects for glosses that repeat their own
   * headword, which is a property of the lexicographer, not of the query. Three
   * of the four selections in the 20-query run won this way.
   *
   * Scoping the context is a measurement decision and belongs here; the
   * predicate still does all the counting and comparing.
   */
  const head = headToken.trim().toLowerCase();
  const context = [...queryTokens].filter((t) => String(t).trim().toLowerCase() !== head);

  return draft('obs.lex.sense_candidates', { candidates, queryTokens: context }, 'observed');
}

/**
 * wordnet_rel edges and the near-kin they justify.
 *
 * `relPath` is the evidence a kin carries: without it the kin is a bare lemma
 * and p_every_kin_has_edge fails, which is the intended outcome.
 */
function observeRelationPaths(lexiconAdapter, headToken) {
  if (!isConnected(lexiconAdapter)) {
    return draft('obs.lex.relation_paths', null, 'error');
  }

  let related = { broader: [], narrower: [], akin: [] };
  try {
    related = lexiconAdapter.lookupRelated?.(headToken, 20) || related;
  } catch {
    // A thrown lookup is a tool failure, not a finding. Tool failure never
    // eliminates a hypothesis (hypothesisStatus.js header).
    return draft('obs.lex.relation_paths', null, 'error');
  }

  const antonyms = (() => {
    try {
      return lexiconAdapter.lookupAntonyms?.(headToken, 20) || [];
    } catch {
      return [];
    }
  })();

  /** @type {{rel: string, lemma: string}[]} */
  const edges = [];
  const push = (rel, list) => {
    for (const e of list || []) {
      const lemma = typeof e === 'string' ? e : e?.lemma;
      if (!lemma) continue;
      edges.push({ rel, lemma });
      if (edges.length >= MAX_EDGES) return;
    }
  };
  push('hypernym', related.broader);
  push('hyponym', related.narrower);
  push('similar', related.akin);
  push('antonym', antonyms);

  const kin = edges.map((e) => ({
    lemma: e.lemma,
    rel: e.rel,
    relPath: `${headToken}>${e.rel}>${e.lemma}`,
  }));

  return draft('obs.lex.relation_paths', { edges, kin }, 'observed');
}

/**
 * How many WORDS this spelling actually is.
 *
 * wordnet_lemma retains the POS partition that the `entry` table lost on ingest.
 * More than one group means the spelling is more than one word — `wound` returns
 * a/n/v, and "put in a coil" is not a sense of the injury word.
 *
 * The groups are reported whole, never merged. Merging is the defect.
 */
async function observeLexicalEntries(lexiconAdapter, headToken, phonology) {
  if (!isConnected(lexiconAdapter)) {
    return draft('obs.lex.lexical_entries', null, 'error');
  }
  if (typeof lexiconAdapter.lookupLexicalEntries !== 'function') {
    // An adapter without the method has not told us there is one entry — it has
    // told us nothing. Reporting entryCount:1 here would silently assert that
    // every word is unambiguous.
    return draft('obs.lex.lexical_entries', null, 'inconclusive');
  }

  let groups;
  try {
    groups = lexiconAdapter.lookupLexicalEntries(headToken) || [];
  } catch {
    return draft('obs.lex.lexical_entries', null, 'error');
  }

  /**
   * MULTIPLE PARTS OF SPEECH IS NOT MULTIPLE WORDS.
   *
   * The first version of this fired the heteronym falsifier on entryCount > 1 and
   * flagged 15 of 20 real queries — bank n/v, light a/n, crane n/v, bark n/v are
   * each ONE word wearing two parts of speech, pronounced identically.
   *
   * A heteronym is a spelling with more than one PRONUNCIATION. cmudict records
   * those as numbered variants, and sameWordPronunciation decides which
   * differences are allophonic (same word) versus phonemic (different word).
   *
   * When CMU has no entry for the word we report null, not 1. Absence must not
   * assert that a word is unambiguous — the predicate reads a missing path as
   * inconclusive, which is the honest reading of "we never looked it up".
   */
  let distinctPronunciations = null;
  const phonologyReady = await phonology.ready();
  if (phonologyReady) {
    const variants = phonology.variants(headToken) || [];
    if (variants.length > 0) {
      const forms = [];
      for (const v of variants) {
        if (!forms.some((f) => sameWordPronunciation(f, v))) forms.push(v);
      }
      distinctPronunciations = forms.length;
    }
  }

  const result = {
    entryCount: groups.length,
    entries: groups.map((g) => ({ pos: g.pos, senseCount: g.senses.length, senses: g.senses })),
  };
  if (distinctPronunciations !== null) result.distinctPronunciations = distinctPronunciations;

  return draft('obs.lex.lexical_entries', result, 'observed');
}

/**
 * Phonetic proximity between the head token and the leading candidate lemma.
 *
 * This exists to be ruled OUT. If the winner is a phonetic twin sharing no gloss
 * content, f_homophone_capture eliminates the hypothesis rather than letting a
 * homophone be reported as meaning.
 */
function observePhoneticNeighbour(headToken, candidates) {
  const winner = candidates[0];
  if (!winner) {
    // Nothing to compare. Not a zero — a zero would assert phonetic DISTANCE we
    // never measured, which would silently protect h_sense_by_gloss_overlap.
    return draft('obs.phon.neighbours', null, 'inconclusive');
  }

  /**
   * The winning sense normally belongs to the QUERIED word, so its lemma is the
   * head token and the similarity is trivially 1.0. Measuring that would fire
   * f_homophone_capture on every query and eliminate the hypothesis always — a
   * falsifier that always fires is as useless as one that never does.
   *
   * Homophone capture is a CROSS-LEMMA failure: the winner came from a DIFFERENT
   * word that merely sounds alike (night for knight, which tq-phoneme-v2 scores
   * at 1.0). So the quantity the falsifier tests is `crossLemmaCosine` — the
   * phonetic similarity of a SUBSTITUTED lemma.
   *
   * When no substitution occurred that quantity is determinately 0, not
   * unmeasured. Omitting it instead made the predicate 'inconclusive' in the
   * ordinary case, which left the hypothesis permanently `underdetermined` and
   * meant the sense gate could never fire in production — dead wiring dressed as
   * caution. Naming the field for what it measures makes 0 honest rather than
   * invented: there is no substituted lemma, so there is no capture.
   */
  const sameLemma =
    String(winner.lemma || '').trim().toLowerCase() === headToken.trim().toLowerCase();
  if (sameLemma) {
    return draft(
      'obs.phon.neighbours',
      { winner: { lemma: winner.lemma, senseId: winner.senseId, sameLemma: true, crossLemmaCosine: 0 } },
      'observed',
    );
  }

  let crossLemmaCosine;
  try {
    crossLemmaCosine = phonotopographicSimilarity(headToken, winner.lemma);
  } catch {
    return draft('obs.phon.neighbours', null, 'error');
  }

  if (typeof crossLemmaCosine !== 'number' || Number.isNaN(crossLemmaCosine)) {
    return draft('obs.phon.neighbours', null, 'inconclusive');
  }

  return draft(
    'obs.phon.neighbours',
    { winner: { lemma: winner.lemma, senseId: winner.senseId, sameLemma: false, crossLemmaCosine } },
    'observed',
  );
}

/**
 * Collect one draft per observation CONSTELLATION_SENSE_PROBE declares.
 *
 * Always returns one per declared observation — a MISSING receipt reads as
 * 'missing' in hypothesisStatus, which is weaker and less honest than an
 * explicit 'error' or 'inconclusive'.
 *
 * @param {{ lexiconAdapter: object, headToken: string, queryTokens: string[] }} input
 * @returns {ObservationDraft[]}
 */
export async function collectSenseProbeDrafts({ lexiconAdapter, headToken, queryTokens, phonology = cmuPhonologySource }) {
  const token = String(headToken || '').trim();
  const tokens = Array.isArray(queryTokens) ? queryTokens : [];

  if (!token) {
    return CONSTELLATION_SENSE_PROBE.observations.map((o) =>
      draft(o.id, null, 'inconclusive'),
    );
  }

  const senseDraft = observeSenseCandidates(lexiconAdapter, token, tokens);
  const relationDraft = observeRelationPaths(lexiconAdapter, token);
  const entriesDraft = await observeLexicalEntries(lexiconAdapter, token, phonology);
  const candidates = senseDraft.result?.candidates ?? [];
  const phoneticDraft = observePhoneticNeighbour(token, candidates);

  return [senseDraft, relationDraft, entriesDraft, phoneticDraft];
}

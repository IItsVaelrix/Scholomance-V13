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
import {
  CONSTELLATION_SENSE_PROBE,
} from '../../../core/constellation/semanticInquiry.js';

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

  return draft('obs.lex.sense_candidates', { candidates, queryTokens: [...queryTokens] }, 'observed');
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
export function collectSenseProbeDrafts({ lexiconAdapter, headToken, queryTokens }) {
  const token = String(headToken || '').trim();
  const tokens = Array.isArray(queryTokens) ? queryTokens : [];

  if (!token) {
    return CONSTELLATION_SENSE_PROBE.observations.map((o) =>
      draft(o.id, null, 'inconclusive'),
    );
  }

  const senseDraft = observeSenseCandidates(lexiconAdapter, token, tokens);
  const relationDraft = observeRelationPaths(lexiconAdapter, token);
  const candidates = senseDraft.result?.candidates ?? [];
  const phoneticDraft = observePhoneticNeighbour(token, candidates);

  return [senseDraft, relationDraft, phoneticDraft];
}

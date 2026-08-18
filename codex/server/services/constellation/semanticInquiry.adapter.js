/**
 * CONSTELLATION — semantic inquiry channel
 *
 * Runs the Constellation sense probe and reports what the evidence supports.
 * This is the only place the Semantic Calculus touches a live request.
 *
 * THE GATE. A sense selection is applied ONLY when h_sense_by_gloss_overlap is
 * `supported` — that is, every required prediction held AND no falsifier fired.
 * Eliminated, surviving and underdetermined all leave leximancy's own selection
 * untouched. The channel can therefore only ever REPLACE a heuristic pick with
 * an evidenced one; it can never invent a pick out of an unresolved query.
 *
 * WHY IT MATCHES ON GLOSS TEXT. The harness and leximancy.adapter each build
 * their own candidate list with their own filtering, so `${token}.${pos}.${i}`
 * ids are computed independently and can silently disagree. Matching on gloss
 * text is the honest join; a mismatch declines to select rather than pointing at
 * whatever sense happened to land on that index.
 */

import {
  CONSTELLATION_SENSE_PROBE,
  bindsConstellationInquiry,
} from '../../../core/constellation/semanticInquiry.js';
import { collectSenseProbeDrafts } from './senseProbe.harness.js';
import {
  evaluateHypotheses,
  glossOverlapCount,
} from '../../../core/semantic-calculus/hypothesisStatus.js';
import { scoreSenseBallistics } from '../../../core/lexical-analysis/semanticBallistics.js';
import { sealObservationDigest } from '../../../core/semantic-calculus/receiptSeal.js';

export const SEMANTIC_ADAPTER_VERSION = 'sem-inquiry-2';

/**
 * SEMANTIC BALLISTICS WIRE (sem-inquiry-2) — a SECOND EVIDENCE AXIS, never a
 * second judge. The probe's f_tie_is_not_a_decision guarantees a unique
 * gloss-overlap winner under `supported`, so there is no tie for containment
 * to break: wiring it into selection would be dead code wearing a feature's
 * clothes. The axis ships whether or not a sense is selected, so a reader can
 * see whether sound-containment and gloss-evidence agree — and the
 * anti-usurpation test pins that it can never move the pick.
 *
 * SEALED REPLAY WIRE (sem-inquiry-2) — one receipt digest per probe
 * observation, minted via receiptSeal.js (the server-safe .js island of
 * observationReceipt.ts; production node has no TS loader). This AMENDS the
 * pre-sem-inquiry-2 decision not to mint on the request path: four 64-hex
 * digests cost ~300 bytes and convert "the channel said supported" into
 * "supported, and here is the envelope proving which observations produced the
 * verdict". The packet carries the seals, never the raw observations.
 */

const SENSE_HYPOTHESIS = 'h_sense_by_gloss_overlap';

/** @returns {{status: string, bound: boolean}} */
function notBound(reason) {
  return {
    status: reason,
    bound: false,
    probeId: CONSTELLATION_SENSE_PROBE.id,
    hypotheses: { supported: [], eliminated: [], surviving: [], underdetermined: [] },
    selection: { warranted: false, reason, senseId: null, gloss: null, overlap: null },
    evidence: { candidateCount: 0, edgeCount: 0 },
    lexicalEntries: [],
    isHeteronym: false,
    distinctPronunciations: null,
    headToken: null,
    framePos: null,
    frameCue: null,
    viableWordCount: null,
    ballistics: null,
    receiptDigests: [],
  };
}

/**
 * Seal every observation draft into a replay digest. Digests are minted
 * regardless of verdict — a denied hypothesis with a sealed envelope is
 * auditable; a denied hypothesis with no envelope is just a wall.
 */
function sealDraftDigests(drafts) {
  return drafts
    .map((d) => sealObservationDigest({
      probeId: CONSTELLATION_SENSE_PROBE.id,
      observationId: d.observationId,
      result: d.result,
      status: d.status,
    }))
    .sort();
}

/**
 * Measure containment of the query context in each candidate sense gloss.
 * EVIDENCE ONLY — nothing downstream of this function may read the scores to
 * move a selection (see the wire doctrine at the top of this file).
 *
 * The `scoreBallistics` seam exists so degradation can be tested without
 * waiting for the embedding engine to genuinely fail; production callers
 * omit it and get the real scorer.
 *
 * @returns {object|null} measured axis, unavailable report, or null when
 *   there were no candidates to score.
 */
function measureBallistics(candidates, contextTokens, scorer) {
  if (!candidates.length) return null;
  try {
    const scored = scorer(
      contextTokens.join(' '),
      candidates.map((c) => ({
        synsetId: c.senseId,
        lemma: c.lemma,
        pos: c.pos,
        definition: c.gloss,
      })),
    );
    return Object.freeze({
      status: 'measured',
      embedding: Object.freeze({
        kind: scored.embedding.kind,
        version: scored.embedding.version,
        dimensions: scored.embedding.dimensions,
      }),
      scores: Object.freeze(scored.senses.map((s) => Object.freeze({
        senseId: s.synsetId,
        semanticScore: typeof s.semanticScore === 'number' ? s.semanticScore : null,
      }))),
      degraded: Object.freeze([...scored.degradation]),
    });
  } catch (err) {
    // A failed instrument reports its failure, never a fabricated zero.
    return Object.freeze({
      status: 'unavailable',
      reason: String((err && err.message) || err),
      embedding: null,
      scores: Object.freeze([]),
      degraded: Object.freeze([]),
    });
  }
}

/**
 * Evaluate the sense probe for one query.
 *
 * @param {object} lexiconAdapter
 * @param {{kind: string, intent: string, tokenCount: number, tokens: string[], primaryContentToken: string|null}} identity
 * @param {{interpretations?: {id: string, gloss: string}[]}} leximancy
 * @param {object|null} phonology
 * @param {{ scoreBallistics?: Function }} [options] Test seam; production omits.
 */
export async function analyzeSemanticInquiry(lexiconAdapter, identity, leximancy, phonology, options = {}) {
  if (!bindsConstellationInquiry(identity)) return notBound('not_bound');

  const headToken = identity.primaryContentToken;
  if (!headToken) return notBound('no_head_token');

  const drafts = await collectSenseProbeDrafts({
    lexiconAdapter,
    headToken,
    queryTokens: identity.tokens || [],
    ...(phonology ? { phonology } : {}),
  });

  /**
   * Drafts carry observationId/result/status, which is everything
   * evaluateHypotheses reads. Since sem-inquiry-2 the same drafts are ALSO
   * sealed into replay digests (see sealDraftDigests) — evaluation stays
   * receipt-free, but the packet now carries the envelopes.
   */
  const evaluation = evaluateHypotheses(CONSTELLATION_SENSE_PROBE.hypotheses, drafts);

  const senseDraft = drafts.find((d) => d.observationId === 'obs.lex.sense_candidates');
  const relationDraft = drafts.find((d) => d.observationId === 'obs.lex.relation_paths');
  const entriesDraft = drafts.find((d) => d.observationId === 'obs.lex.lexical_entries');
  const candidates = senseDraft?.result?.candidates ?? [];
  const edges = relationDraft?.result?.edges ?? [];
  const contextTokens = senseDraft?.result?.queryTokens ?? [];

  // The two sem-inquiry-2 wires. Both are computed BEFORE any verdict branch:
  // evidence exists independent of what the probe concludes.
  const receiptDigests = sealDraftDigests(drafts);
  const ballistics = measureBallistics(
    candidates,
    contextTokens,
    options.scoreBallistics ?? scoreSenseBallistics,
  );

  /**
   * Surfaced whether or not a sense is selected. When the spelling is more than one
   * word, showing BOTH is the answer — for a bare query like "wound" there is no
   * syntactic frame to disambiguate from, and picking would invent evidence.
   */
  /**
   * ONE REPRESENTATIVE GLOSS PER WORD, NOT EVERY SENSE.
   *
   * Measured: shipping the full senses[] arrays made semanticInquiry 54% of the
   * page and the arrays alone 45% — on a packet where nothing rendered them.
   * But dropping them entirely leaves a split that cannot be shown: "wound is
   * two words" is useless without a word or two saying WHICH two.
   *
   * The first sense is wordnet's rank-1, which is the most frequent reading, so
   * it is the right one to stand for the group.
   */
  const lexicalEntries = (entriesDraft?.result?.entries ?? []).map((e) => ({
    pos: e.pos,
    senseCount: e.senseCount,
    gloss: e.senses?.[0]?.gloss ?? null,
    synsetId: e.senses?.[0]?.synsetId ?? null,
  }));
  /**
   * A heteronym is a spelling with more than one PRONUNCIATION, not more than one
   * part of speech. bank n/v, light a/n, crane n/v and bark n/v are each ONE word.
   * Reading this off lexicalEntries.length flagged 15 of 20 real queries.
   * `distinctPronunciations` is absent when CMU could not answer — absent is not 1.
   */
  const distinctPronunciations = entriesDraft?.result?.distinctPronunciations ?? null;
  const framePos = entriesDraft?.result?.framePos ?? null;
  const frameCue = entriesDraft?.result?.frameCue ?? null;
  const viableWordCount = entriesDraft?.result?.viableWordCount ?? null;
  const isHeteronym = typeof distinctPronunciations === 'number' && distinctPronunciations > 1;

  const hypotheses = {
    supported: [...evaluation.supported],
    eliminated: [...evaluation.eliminated],
    surviving: [...evaluation.surviving],
    underdetermined: [...evaluation.underdetermined],
  };

  const base = {
    status: 'ok',
    bound: true,
    probeId: CONSTELLATION_SENSE_PROBE.id,
    hypotheses,
    evidence: { candidateCount: candidates.length, edgeCount: edges.length },
    lexicalEntries,
    isHeteronym,
    distinctPronunciations,
    headToken,
    framePos,
    frameCue,
    viableWordCount,
    ballistics,
    receiptDigests,
  };

  if (!evaluation.supported.includes(SENSE_HYPOTHESIS)) {
    /**
     * Label from what actually killed it, not from a property of the word.
     * Reading `isHeteronym` here reported "heteronym_unresolved" for queries the
     * frame had already settled (viableWordCount 1) and which then died of thin
     * gloss overlap — an accurate-sounding reason that was simply not the cause.
     */
    const unsettled = typeof viableWordCount === 'number' && viableWordCount > 1;
    const reason = unsettled && evaluation.eliminated.includes(SENSE_HYPOTHESIS)
      ? 'heteronym_unresolved'
      : evaluation.eliminated.includes(SENSE_HYPOTHESIS)
      ? 'eliminated'
      : evaluation.underdetermined.includes(SENSE_HYPOTHESIS)
        ? 'underdetermined'
        : 'not_supported';
    return { ...base, selection: { warranted: false, reason, senseId: null, gloss: null, overlap: null } };
  }

  // Supported. Identify the winner with the SAME overlap the falsifiers judged.
  const queryTokens = senseDraft?.result?.queryTokens ?? [];
  let winner = null;
  let best = -1;
  for (const c of candidates) {
    const overlap = glossOverlapCount(c.gloss, queryTokens);
    if (overlap > best) {
      best = overlap;
      winner = c;
    }
  }

  if (!winner) {
    return {
      ...base,
      selection: { warranted: false, reason: 'no_winner', senseId: null, gloss: null, overlap: null },
    };
  }

  // Join to leximancy's own interpretation list by gloss text.
  const interpretations = Array.isArray(leximancy?.interpretations) ? leximancy.interpretations : [];
  const match = interpretations.find((i) => (i.gloss || '').trim() === winner.gloss.trim());
  if (!match) {
    return {
      ...base,
      selection: {
        warranted: false,
        reason: 'no_interpretation_match',
        senseId: null,
        gloss: winner.gloss,
        overlap: best,
      },
    };
  }

  return {
    ...base,
    selection: { warranted: true, reason: 'supported', senseId: match.id, gloss: winner.gloss, overlap: best },
  };
}

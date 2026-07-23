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

export const SEMANTIC_ADAPTER_VERSION = 'sem-inquiry-1';

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
  };
}

/**
 * Evaluate the sense probe for one query.
 *
 * @param {object} lexiconAdapter
 * @param {{kind: string, intent: string, tokenCount: number, tokens: string[], primaryContentToken: string|null}} identity
 * @param {{interpretations?: {id: string, gloss: string}[]}} leximancy
 */
export function analyzeSemanticInquiry(lexiconAdapter, identity, leximancy) {
  if (!bindsConstellationInquiry(identity)) return notBound('not_bound');

  const headToken = identity.primaryContentToken;
  if (!headToken) return notBound('no_head_token');

  const drafts = collectSenseProbeDrafts({
    lexiconAdapter,
    headToken,
    queryTokens: identity.tokens || [],
  });

  /**
   * Drafts carry observationId/result/status, which is everything
   * evaluateHypotheses reads. Receipt hashes exist for sealed replay, not for
   * evaluation, so nothing is lost by not minting them on the request path.
   */
  const evaluation = evaluateHypotheses(CONSTELLATION_SENSE_PROBE.hypotheses, drafts);

  const senseDraft = drafts.find((d) => d.observationId === 'obs.lex.sense_candidates');
  const relationDraft = drafts.find((d) => d.observationId === 'obs.lex.relation_paths');
  const candidates = senseDraft?.result?.candidates ?? [];
  const edges = relationDraft?.result?.edges ?? [];

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
  };

  if (!evaluation.supported.includes(SENSE_HYPOTHESIS)) {
    const reason = evaluation.eliminated.includes(SENSE_HYPOTHESIS)
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

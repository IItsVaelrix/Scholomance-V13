/**
 * SEMANTIC CALCULUS — candidate proposals + the margin law. ISOMORPHIC.
 *
 * This is the seam where a model is allowed to help, and the exact place it is
 * not allowed to decide. Two rules make it a harness rather than a suggestion box:
 *
 * 1. THE PROPOSER RANKS; IT NEVER INVENTS.
 *    A proposal may only score referents the lexicon already knows. A returned key
 *    that is not in the known set is rejected outright — not ignored, rejected.
 *    Without this the model can mint a binding and the whole architecture reduces
 *    to a soft Do with extra steps.
 *
 * 2. THE COMPILER NEVER CALLS THE MODEL.
 *    A proposal is DATA, submitted alongside the utterance. If selectKind() invoked
 *    an LLM, the same utterance could bind differently across runs and replay
 *    identity (F18, 100%) would be a lie. The model proposes beforehand; the
 *    compiler is a pure function of (utterance, context, proposal). This is
 *    §5.1: the model may provide candidate evidence; only the compiler may emit Do.
 *
 * The margin is what lets a model reach without letting it overreach. Two close
 * candidates are not a decision — they are a question. Which question, and how
 * close counts as "close", is set per risk class by RiskProfile.minMargin (F15):
 * navigating wants 0.15, mutating wants 0.35. A destructive act may never borrow
 * a navigation threshold.
 */

import type { RiskProfile } from './types.ts';
import {
  assessCandidateMargin,
  validateClosedCandidates,
} from '../candidate-lattice/index.js';

export interface Candidate {
  /** MUST be a key the lexicon already knows. Inventing one is a hard error. */
  key: string;
  /** 0..1. Higher is better. Scale is the proposer's business; only gaps matter. */
  score: number;
  /** Optional, for the audit trail. Never authority. */
  why?: string;
}

export interface Proposal {
  /** Which proposer produced this. Sealed, so a replay knows who was asked. */
  proposerId: string;
  slot: string;
  candidates: Candidate[];
}

/**
 * Any LLM drops in here. The contract is deliberately narrow: you are handed the
 * closed set of things that exist, and you rank them. You cannot add to the set,
 * you cannot decide, and you cannot see untrusted context (F13 — the caller passes
 * trusted partitions only).
 */
export interface CandidateProposer {
  id: string;
  propose(utterance: string, slot: string, known: readonly string[]): Candidate[];
}

export const PROPOSAL_ERRORS = Object.freeze({
  INVENTED_CANDIDATE: 'SEMANTIC_CALCULUS_PROPOSER_INVENTED_CANDIDATE',
  INVALID_SCORE: 'SEMANTIC_CALCULUS_PROPOSER_INVALID_SCORE',
});

/**
 * Reject a proposal that stepped outside the closed world.
 * @throws if any candidate names a referent the lexicon does not have.
 */
export function validateProposal(proposal: Proposal, known: readonly string[]): void {
  validateClosedCandidates(proposal.candidates, known, {
    invented: PROPOSAL_ERRORS.INVENTED_CANDIDATE,
    invalidScore: PROPOSAL_ERRORS.INVALID_SCORE,
  });
}

export type MarginVerdict =
  | { decided: true; pick: Candidate; margin: number; reason: 'sole-candidate' | 'clear-margin' }
  | { decided: false; margin: number; reason: 'no-candidates' }
  | { decided: false; margin: number; reason: 'thin-margin'; pick: Candidate; rival: Candidate };

/**
 * The margin law (F4/F15). Ranked candidates in, a decision or a question out.
 *
 * A thin margin is NOT a weak Do. It is a Clarify — the difference between the top
 * two is the system's own admission that it cannot tell them apart, and resolving
 * that from a coin flip is the exact soft Do this architecture exists to prevent.
 */
export function assessMargin(proposal: Proposal, risk: RiskProfile): MarginVerdict {
  const assessment = assessCandidateMargin(proposal.candidates, risk.minMargin);
  if (assessment.status === 'empty') {
    return { decided: false, margin: 0, reason: 'no-candidates' };
  }
  if (assessment.status === 'single') {
    return {
      decided: true,
      pick: assessment.ranked[0],
      margin: assessment.margin,
      reason: 'sole-candidate',
    };
  }
  if (assessment.status === 'clear') {
    return {
      decided: true,
      pick: assessment.ranked[0],
      margin: assessment.margin,
      reason: 'clear-margin',
    };
  }
  return {
    decided: false,
    margin: assessment.margin,
    reason: 'thin-margin',
    pick: assessment.ranked[0],
    rival: assessment.ranked[1],
  };
}

// ── A reference proposer ─────────────────────────────────────────────────────

const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'my', 'this', 'that']);
const tokens = (s: string) =>
  s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));

/**
 * Deterministic lexical proposer. No model, no network, same input -> same ranking.
 *
 * It exists so the margin law is testable and shippable TODAY without an LLM, and
 * so there is a control arm: any model proposer must beat this, or it is adding
 * nondeterminism for nothing. Phase 6's baseline #3, in code.
 *
 * It is deliberately weak — Jaccard overlap over tokens. It cannot know that
 * "jitters" means "stutter". That is precisely the gap an LLM proposer would fill,
 * and the margin law does not care which one is talking.
 */
export const lexicalProposer: CandidateProposer = {
  id: 'lexical-jaccard-v1',
  propose(utterance, _slot, known) {
    const u = new Set(tokens(utterance));
    if (u.size === 0) return [];
    const out: Candidate[] = [];
    for (const key of known) {
      const k = new Set(tokens(key));
      if (k.size === 0) continue;
      let hits = 0;
      for (const t of k) if (u.has(t)) hits += 1;
      if (hits === 0) continue;
      const union = new Set([...u, ...k]).size;
      out.push({ key, score: hits / union, why: `${hits} shared token(s)` });
    }
    // Ties broken by key so the ranking is total and replay-stable.
    return out.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, 5);
  },
};

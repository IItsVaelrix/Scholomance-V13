/**
 * AUDITION ADAPTER — run the parse-selection jury.
 *
 * Pipeline mirrors `runG2PJury`:
 *   candidates → each juror.vote → tally → resolveWinner → deterministic verdict
 *
 * Input is either:
 *   - pre-built candidates, or
 *   - tokens + a compose/compose-packed result (stable roots projected to slips)
 *
 * PURE AND ZERO-I/O. Diagnostics only read process.memoryUsage when present.
 *
 * Benchmark: `codex/core/phonology/g2p/g2p.adapter.js`
 *
 * @module codex/core/constellation/audition/audition.adapter
 */

import {
  POLICY_PASS,
  POLICY_REJECT,
  POLICY_ERROR,
  POLICY_OFF,
  FIDELITY_GRADES,
  createDeterministicVerdict,
  createRuntimeDiagnostics,
  computeWeightedScore,
  tallyJuryVotes,
  resolveWinner,
  rankUnderstudies,
  isValidVote,
  CANDIDATE_SOURCES,
} from './schemas.js';
import { generateCandidates } from './candidates/index.js';
import { createCoverageJuror } from './jurors/coverage.juror.js';
import { createContentHeadJuror } from './jurors/content-head.juror.js';
import { createClauseShapeJuror } from './jurors/clause-shape.juror.js';
import { createEnsembleJuror } from './jurors/ensemble.juror.js';
import { createOrderJuror } from './jurors/order.juror.js';

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

/**
 * @param {string[]} tokens
 * @param {object|null} [composeResult]
 * @param {object} [options]
 * @param {object[]} [options.candidates]  skip generation when provided
 * @param {Array} [options.answers]        manual answer list for generation
 * @param {string} [options.policy]
 * @returns {{verdict: object, cast: object|null, understudies: object[], diagnostics: object}}
 */
export function runAuditionJury(tokens = [], composeResult = null, options = {}) {
  const tokenList = Array.isArray(tokens) ? tokens : [];

  if (options.policy === POLICY_OFF) {
    return offResult(tokenList);
  }

  const startTime = Date.now(); // EXEMPT — latency telemetry only
  const beforeMemory = process.memoryUsage?.()?.heapUsed || 0;

  try {
    const candidates = Array.isArray(options.candidates)
      ? options.candidates
      : generateCandidates(tokenList, composeResult, options);

    if (candidates.length === 0) {
      return {
        verdict: createDeterministicVerdict({
          ok: false,
          tokens: tokenList,
          candidates: [],
          votes: [],
          aggregateScores: {},
          winner: null,
          understudies: [],
          contested: false,
          decidedBy: null,
          policy: POLICY_REJECT,
          flags: { fidelityRejected: false, legalityViolated: true, precisionLoss: 0 },
        }),
        cast: null,
        understudies: [],
        diagnostics: finishDiagnostics(startTime, beforeMemory),
      };
    }

    const jurors = createJurors();
    const votes = [];

    for (const candidate of candidates) {
      for (const juror of jurors) {
        const rawVote = juror.vote(candidate, options.context || null);
        if (!rawVote || !isValidVote(rawVote)) continue;
        votes.push(normalizeVote(rawVote));
      }
    }

    const aggregateScores = tallyJuryVotes(candidates, votes);
    const winner = resolveWinner(candidates, aggregateScores, votes);
    const understudies = rankUnderstudies(
      candidates,
      aggregateScores,
      votes,
      winner?.candidateKey ?? null,
    );

    const fidelityRejected = votes.some((v) => v.fidelityGrade === 'F' && !v.veto);
    const hasWinner = winner && Number.isFinite(winner.aggregate);
    const policySelected = fidelityRejected || !hasWinner ? POLICY_REJECT : POLICY_PASS;

    // Contested when a runner-up is within 15% of the winner's aggregate.
    let contested = false;
    if (hasWinner && understudies.length > 0) {
      const top = winner.aggregate;
      const next = understudies[0].aggregate;
      contested = top > 0 ? next / top >= 0.85 : next === top;
    }

    const decidedBy = hasWinner
      ? primaryDecidingJuror(votes, winner.candidateKey)
      : null;

    const verdict = createDeterministicVerdict({
      ok: policySelected === POLICY_PASS,
      tokens: tokenList,
      candidates,
      votes,
      aggregateScores,
      winner,
      understudies,
      contested,
      decidedBy,
      policy: policySelected,
      flags: { fidelityRejected, legalityViolated: false, precisionLoss: 0 },
    });

    return {
      verdict,
      cast: winner ? winner.answer : null,
      understudies: understudies.map((u) => u.answer),
      diagnostics: finishDiagnostics(startTime, beforeMemory),
    };
  } catch {
    return {
      verdict: createDeterministicVerdict({
        ok: false,
        tokens: tokenList,
        candidates: [],
        votes: [],
        aggregateScores: {},
        winner: null,
        understudies: [],
        contested: false,
        decidedBy: null,
        policy: POLICY_ERROR,
        flags: { fidelityRejected: false, legalityViolated: false, precisionLoss: 0 },
      }),
      cast: null,
      understudies: [],
      diagnostics: createRuntimeDiagnostics({
        latencyMs: Date.now() - startTime, // EXEMPT — latency telemetry only
        memoryDeltaBytes: Math.max(0, (process.memoryUsage?.()?.heapUsed || 0) - beforeMemory),
      }),
    };
  }
}

export function runVerificationTests(tokens, composeResult = null) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return { passed: false, reason: 'tokens required for audition verification' };
  }
  const result = runAuditionJury(tokens, composeResult);
  const passed = typeof result.verdict === 'object' && typeof result.verdict.ok === 'boolean';
  return { passed, verdict: result.verdict, diagnostics: result.diagnostics, cast: result.cast };
}

function createJurors() {
  return [
    createCoverageJuror(),
    createContentHeadJuror(),
    createClauseShapeJuror(),
    createEnsembleJuror(),
    createOrderJuror(),
  ];
}

function normalizeVote(vote) {
  // A veto has no numeric fields to normalise, and clamping absent numbers into
  // the legal range would turn it into an ordinary low-confidence vote.
  if (vote.veto === true) {
    return {
      candidateKey: String(vote.candidateKey || ''),
      jurorId: String(vote.jurorId),
      veto: true,
      rationale: String(vote.rationale || ''),
      fidelityGrade: FIDELITY_GRADES.includes(vote.fidelityGrade) ? vote.fidelityGrade : 'F',
    };
  }

  return {
    candidateKey: String(vote.candidateKey || ''),
    jurorId: String(vote.jurorId),
    tokenWeight: clamp(vote.tokenWeight, 0.05, 1.5),
    confidence: clamp01(vote.confidence),
    stageSignal: clamp(vote.stageSignal, 0.05, 1.6),
    syntaxModifier: clamp(vote.syntaxModifier, 0.2, 2.8),
    rationale: String(vote.rationale || ''),
    fidelityGrade: FIDELITY_GRADES.includes(vote.fidelityGrade) ? vote.fidelityGrade : 'D',
  };
}

/**
 * Name the juror that contributed the largest weighted score to the winner —
 * constellation's `decidedBy` without inventing a second politics.
 */
function primaryDecidingJuror(votes, candidateKey) {
  let bestId = null;
  let bestScore = -Infinity;
  for (const vote of votes) {
    if (vote.candidateKey !== candidateKey || vote.veto) continue;
    const score = computeWeightedScore(vote);
    if (score > bestScore) {
      bestScore = score;
      bestId = vote.jurorId;
    }
  }
  return bestId;
}

function offResult(tokenList) {
  return {
    verdict: createDeterministicVerdict({
      ok: false,
      tokens: tokenList,
      candidates: [],
      votes: [],
      aggregateScores: {},
      winner: null,
      understudies: [],
      contested: false,
      decidedBy: null,
      policy: POLICY_OFF,
      flags: { fidelityRejected: false, legalityViolated: false, precisionLoss: 0 },
    }),
    cast: null,
    understudies: [],
    diagnostics: createRuntimeDiagnostics(),
  };
}

function finishDiagnostics(startTime, beforeMemory) {
  const endTime = Date.now(); // EXEMPT — latency telemetry only
  const afterMemory = process.memoryUsage?.()?.heapUsed || beforeMemory;
  return createRuntimeDiagnostics({
    latencyMs: endTime - startTime,
    memoryDeltaBytes: Math.max(0, afterMemory - beforeMemory),
  });
}

export { CANDIDATE_SOURCES };

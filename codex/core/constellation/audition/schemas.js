/**
 * AUDITION SCHEMAS — battle-tested shape ported from G2P jury.
 *
 * G2P jurors rank pronunciation candidates. This module ranks PARSE readings
 * (subject/verb slips projected from a stable chart) with the same vote
 * contract, tally, veto-before-rank, and deterministic winner resolution.
 *
 * Formation stays in compose / compose-packed. Ranking lives here. Bonds create;
 * the audition room casts.
 *
 * PURE AND ZERO-I/O (PDR §18 Core law). No fs, network, or sqlite.
 *
 * Benchmark: `codex/core/phonology/g2p/schemas.js`
 *
 * @module codex/core/constellation/audition/schemas
 */

export const AUDITION_JUROR_IDS = Object.freeze({
  COVERAGE: 'COVERAGE',
  CONTENT_HEAD: 'CONTENT_HEAD',
  CLAUSE_SHAPE: 'CLAUSE_SHAPE',
  ENSEMBLE: 'ENSEMBLE',
  ORDER: 'ORDER',
});

/**
 * Weights sum to 1.0. COVERAGE and CONTENT_HEAD carry the structural load that
 * head-declaration already proved matters; ENSEMBLE rewards answers that
 * multiple roots agree on; ORDER is a weak deterministic last resort — the
 * same role HHM plays in G2P.
 */
export const JUROR_WEIGHTS = Object.freeze({
  COVERAGE: 0.25,
  CONTENT_HEAD: 0.30,
  CLAUSE_SHAPE: 0.20,
  ENSEMBLE: 0.15,
  ORDER: 0.10,
});

export const FIDELITY_GRADES = Object.freeze(['A', 'B', 'C', 'D', 'F']);

export const POLICY_PASS = 'pass';
export const POLICY_WARN = 'warn';
export const POLICY_REJECT = 'reject';
export const POLICY_ERROR = 'error';
export const POLICY_OFF = 'off';

export const POLICY_WEIGHTS = Object.freeze({
  [POLICY_PASS]: 5,
  [POLICY_WARN]: 3,
  [POLICY_REJECT]: 1,
  [POLICY_ERROR]: 0,
  [POLICY_OFF]: 4,
});

export const MAX_CANDIDATES = 32;
export const MIN_CANDIDATES = 1;

export const CANDIDATE_SOURCES = Object.freeze({
  PACKED_STABLE: 'packed-stable',
  CLASSIC_STABLE: 'classic-stable',
  MANUAL: 'manual',
});

export const EMISSION_TYPES = Object.freeze({
  AUDITION_JURY: 'AUDITION_JURY',
});

export const DEFAULT_DIAGNOSTICS = Object.freeze({
  bytecodeHealth: null,
  latencyMs: 0,
  memoryDeltaBytes: 0,
});

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

/**
 * Answer key used as candidateKey throughout the jury — mirrors G2P's
 * `phonemes.join(' ')` as the stable identity of a candidate.
 *
 * @param {{subject?: string|null, verb?: string|null}|null} answer
 * @returns {string}
 */
export function answerKey(answer) {
  if (!answer || typeof answer !== 'object') return '|';
  return `${answer.subject ?? ''}|${answer.verb ?? ''}`;
}

export function computeWeightedScore(vote) {
  // A veto is not a score. It asserts that a candidate is impossible, which no
  // weighting can express — a zero-confidence vote still leaves the candidate
  // eligible to win on other jurors' support.
  if (vote.veto) return 0;
  const jurorWeight = JUROR_WEIGHTS[vote.jurorId] ?? 0;

  return (
    jurorWeight *
    clamp(vote.confidence, 0, 1) *
    clamp(vote.tokenWeight, 0.05, 1.5) *
    clamp(vote.stageSignal, 0.05, 1.6) *
    clamp(vote.syntaxModifier, 0.2, 2.8)
  );
}

export function tallyJuryVotes(candidates, votes) {
  const aggregate = new Map();

  for (const candidate of candidates) {
    const key = candidate.candidateKey || answerKey(candidate.answer);
    aggregate.set(key, 0);
  }

  for (const vote of votes) {
    if (!aggregate.has(vote.candidateKey)) continue;
    if (vote.veto) continue;

    const weightedScore = computeWeightedScore(vote);
    const current = aggregate.get(vote.candidateKey) ?? 0;
    aggregate.set(vote.candidateKey, current + weightedScore);
  }

  return Object.fromEntries(aggregate);
}

/**
 * Candidate keys a juror has declared impossible.
 *
 * A VETO IS ABSOLUTE. It is not a strong opinion to be outweighed — it says the
 * candidate cannot be an answer at all, so it is removed from consideration
 * before ranking rather than scored down within it. Filtering before ranking is
 * the same ordering discipline the cue arbiter (and G2P jury) enforces.
 */
function vetoedKeys(votes) {
  const out = new Set();
  for (const vote of votes) {
    if (vote && vote.veto && typeof vote.candidateKey === 'string') {
      out.add(vote.candidateKey);
    }
  }
  return out;
}

/**
 * @param {object[]} candidates
 * @param {Record<string, number>} aggregate
 * @param {object[]} [votes]
 * @returns {{answer: {subject: string|null, verb: string|null}, candidateKey: string, aggregate: number}|null}
 */
export function resolveWinner(candidates, aggregate, votes = []) {
  const vetoed = vetoedKeys(votes);
  const contentHeadByCandidate = new Map();

  // CONTENT_HEAD is the structural primary (analogous to PHONOTACTIC in G2P).
  for (const vote of votes) {
    if (vote.jurorId !== AUDITION_JUROR_IDS.CONTENT_HEAD) continue;
    const current = contentHeadByCandidate.get(vote.candidateKey) ?? -Infinity;
    const score = computeWeightedScore(vote);
    if (score > current) {
      contentHeadByCandidate.set(vote.candidateKey, score);
    }
  }

  const ranked = candidates
    .filter((candidate) => {
      const key = candidate.candidateKey || answerKey(candidate.answer);
      return !vetoed.has(key);
    })
    .map((candidate) => {
      const key = candidate.candidateKey || answerKey(candidate.answer);
      return {
        candidate,
        key,
        aggregate: aggregate[key] ?? -Infinity,
        // Prefer answers that actually name a subject when scores tie —
        // shorter "empty subject" slips should not beat content by length alone.
        namedFields: (candidate.answer?.subject ? 1 : 0) + (candidate.answer?.verb ? 1 : 0),
        contentHeadScore: contentHeadByCandidate.get(key) ?? -Infinity,
        sourceConfidence: candidate.confidence || 0,
        order: Number.isFinite(candidate.order) ? candidate.order : 0,
      };
    })
    .sort((a, b) => {
      if (b.aggregate !== a.aggregate) return b.aggregate - a.aggregate;
      if (b.namedFields !== a.namedFields) return b.namedFields - a.namedFields;
      if (b.contentHeadScore !== a.contentHeadScore) {
        return b.contentHeadScore - a.contentHeadScore;
      }
      if (b.sourceConfidence !== a.sourceConfidence) {
        return b.sourceConfidence - a.sourceConfidence;
      }
      if (a.order !== b.order) return a.order - b.order;
      return a.key.localeCompare(b.key);
    });

  const best = ranked[0];
  if (!best || !Number.isFinite(best.aggregate)) {
    return null;
  }

  return {
    answer: {
      subject: best.candidate.answer?.subject ?? null,
      verb: best.candidate.answer?.verb ?? null,
    },
    candidateKey: best.key,
    aggregate: best.aggregate,
  };
}

/**
 * Ranked understudies — every non-winning candidate still standing after veto,
 * highest aggregate first. Contested readings stay visible.
 *
 * @param {object[]} candidates
 * @param {Record<string, number>} aggregate
 * @param {object[]} [votes]
 * @param {string|null} [winnerKey]
 */
export function rankUnderstudies(candidates, aggregate, votes = [], winnerKey = null) {
  const vetoed = vetoedKeys(votes);
  return candidates
    .filter((c) => {
      const key = c.candidateKey || answerKey(c.answer);
      return !vetoed.has(key) && key !== winnerKey;
    })
    .map((c) => {
      const key = c.candidateKey || answerKey(c.answer);
      return {
        answer: {
          subject: c.answer?.subject ?? null,
          verb: c.answer?.verb ?? null,
        },
        candidateKey: key,
        aggregate: aggregate[key] ?? 0,
      };
    })
    .sort((a, b) => {
      if (b.aggregate !== a.aggregate) return b.aggregate - a.aggregate;
      return a.candidateKey.localeCompare(b.candidateKey);
    });
}

export function createDeterministicVerdict({
  ok = false,
  tokens = [],
  candidates = [],
  votes = [],
  aggregateScores = {},
  winner = null,
  understudies = [],
  contested = false,
  decidedBy = null,
  flags = {
    fidelityRejected: false,
    legalityViolated: false,
    precisionLoss: 0,
  },
  policy = POLICY_OFF,
} = {}) {
  return Object.freeze({
    ok,
    tokens: Object.freeze([...(tokens || [])]),
    candidates,
    votes,
    aggregateScores,
    winner,
    understudies: Object.freeze([...(understudies || [])]),
    contested: Boolean(contested),
    decidedBy,
    flags: Object.freeze({ ...flags }),
    policy,
  });
}

export function createRuntimeDiagnostics({
  bytecodeHealth = null,
  latencyMs = 0,
  memoryDeltaBytes = 0,
} = {}) {
  return Object.freeze({
    bytecodeHealth: bytecodeHealth ? Object.freeze({ ...bytecodeHealth }) : null,
    latencyMs: Number(latencyMs) || 0,
    memoryDeltaBytes: Number(memoryDeltaBytes) || 0,
  });
}

export function serializeDeterministicVerdictForHash(verdict) {
  const payload = {
    ok: verdict.ok,
    tokens: verdict.tokens,
    candidates: verdict.candidates,
    votes: verdict.votes,
    aggregateScores: verdict.aggregateScores,
    winner: verdict.winner,
    understudies: verdict.understudies,
    contested: verdict.contested,
    decidedBy: verdict.decidedBy,
    flags: verdict.flags,
    policy: verdict.policy,
  };
  return JSON.stringify(payload);
}

export function verdictHash(verdict) {
  const payload = serializeDeterministicVerdictForHash(verdict);
  const normalized = payload.replace(/\s/g, '');
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `audition-${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

export function generateCandidateId(tokens, answer, source, index) {
  const base = `${(tokens || []).join(' ')}|${answerKey(answer)}|${source}|${index}`;
  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    const char = base.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `aud-${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

/**
 * Dedupe by answer key, keeping the higher-confidence (or higher-agreement)
 * slip. Mirrors G2P `dedupeCandidates`.
 */
export function dedupeCandidates(candidates) {
  const seen = new Map();

  for (const candidate of candidates) {
    const key = candidate.candidateKey || answerKey(candidate.answer);
    if (!seen.has(key)) {
      seen.set(key, candidate);
      continue;
    }

    const existing = seen.get(key);
    const nextConf = candidate.confidence || 0;
    const prevConf = existing.confidence || 0;
    const nextAgree = candidate.agreement || 0;
    const prevAgree = existing.agreement || 0;

    if (nextAgree > prevAgree || (nextAgree === prevAgree && nextConf > prevConf)) {
      seen.set(key, {
        ...candidate,
        agreement: Math.max(nextAgree, prevAgree) || (prevAgree + 1),
        candidateKey: key,
      });
    } else {
      seen.set(key, {
        ...existing,
        agreement: Math.max(nextAgree, prevAgree) || (prevAgree + 1),
      });
    }
  }

  return Array.from(seen.values());
}

export function isValidVote(vote) {
  /**
   * A veto carries no numeric fields, because it makes no quantitative claim.
   * Requiring confidence or weights here would force a juror to invent a score
   * for a judgement that is categorical.
   */
  if (vote && vote.veto === true) {
    return Boolean(
      typeof vote.candidateKey === 'string'
      && AUDITION_JUROR_IDS[vote.jurorId]
      && typeof vote.rationale === 'string'
      && vote.rationale.length > 0,
    );
  }

  return Boolean(
    vote &&
    typeof vote.candidateKey === 'string' &&
    AUDITION_JUROR_IDS[vote.jurorId] &&
    Number.isFinite(vote.tokenWeight) &&
    Number.isFinite(vote.confidence) &&
    Number.isFinite(vote.stageSignal) &&
    Number.isFinite(vote.syntaxModifier) &&
    typeof vote.rationale === 'string' &&
    FIDELITY_GRADES.includes(vote.fidelityGrade)
  );
}

export function isValidVerdict(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray(value.candidates) &&
    Array.isArray(value.votes) &&
    typeof value.aggregateScores === 'object' &&
    (value.winner === null
      || (value.winner
        && typeof value.winner === 'object'
        && value.winner.answer
        && Number.isFinite(value.winner.aggregate)))
  );
}

export function isValidCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  if (!candidate.answer || typeof candidate.answer !== 'object') return false;
  const key = candidate.candidateKey || answerKey(candidate.answer);
  if (typeof key !== 'string') return false;
  const sources = Object.values(CANDIDATE_SOURCES);
  if (candidate.source != null && !sources.includes(candidate.source)) return false;
  return true;
}

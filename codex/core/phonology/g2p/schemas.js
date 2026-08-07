export const G2P_JUROR_IDS = Object.freeze({
  PHONOTACTIC: 'PHONOTACTIC',
  SYNTACTIC: 'SYNTACTIC',
  SEMANTIC: 'SEMANTIC',
  GRAPH: 'GRAPH',
  HHM: 'HHM',
});

export const JUROR_WEIGHTS = Object.freeze({
  PHONOTACTIC: 0.25,
  SYNTACTIC: 0.20,
  SEMANTIC: 0.20,
  GRAPH: 0.20,
  HHM: 0.15,
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

export const MAX_CANDIDATES = 10;
export const MIN_CANDIDATES = 3;
export const MIN_GRAPHEME_OVERLAP = 3;
export const VECTOR_NN_SEED = 1337;

export const CANDIDATE_SOURCES = Object.freeze({
  RULE: 'rule',
  SUBSTRING: 'substring',
  COMPOUND: 'compound',
  VECTOR_NN: 'vector-nn',
});

export const EMISSION_TYPES = Object.freeze({
  G2P_JURY: 'G2P_JURY',
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
    const key = candidate.phonemes.join(' ');
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
 * the same ordering discipline the cue arbiter enforces: a candidate that
 * should never have been eligible must not be able to occupy the top slot.
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

export function resolveWinner(candidates, aggregate, votes = []) {
  const vetoed = vetoedKeys(votes);
  const phonotacticByCandidate = new Map();

  for (const vote of votes) {
    if (vote.jurorId !== 'PHONOTACTIC') continue;

    const current = phonotacticByCandidate.get(vote.candidateKey) ?? -Infinity;
    const score = computeWeightedScore(vote);

    if (score > current) {
      phonotacticByCandidate.set(vote.candidateKey, score);
    }
  }

  const ranked = candidates
    .filter((candidate) => !vetoed.has(candidate.phonemes.join(' ')))
    .map((candidate) => {
      const key = candidate.phonemes.join(' ');

      return {
        candidate,
        key,
        aggregate: aggregate[key] ?? -Infinity,
        length: candidate.phonemes.length,
        phonotacticScore: phonotacticByCandidate.get(key) ?? -Infinity,
        sourceConfidence: candidate.confidence || 0,
      };
    })
    .sort((a, b) => {
      if (b.aggregate !== a.aggregate) return b.aggregate - a.aggregate;
      if (a.length !== b.length) return a.length - b.length;
      if (b.phonotacticScore !== a.phonotacticScore) {
        return b.phonotacticScore - a.phonotacticScore;
      }
      if (a.sourceConfidence !== b.sourceConfidence) {
        return b.sourceConfidence - a.sourceConfidence;
      }
      return a.key.localeCompare(b.key);
    });

  const best = ranked[0];

  if (!best || !Number.isFinite(best.aggregate)) {
    return null;
  }

  return {
    phonemes: best.candidate.phonemes,
    aggregate: best.aggregate,
  };
}

export function createDeterministicVerdict({
  ok = false,
  word = '',
  candidates = [],
  votes = [],
  aggregateScores = {},
  winner = null,
  flags = {
    fidelityRejected: false,
    legalityViolated: false,
    precisionLoss: 0,
  },
  policy = POLICY_OFF,
} = {}) {
  return Object.freeze({
    ok,
    word,
    candidates,
    votes,
    aggregateScores,
    winner,
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
    word: verdict.word,
    candidates: verdict.candidates,
    votes: verdict.votes,
    aggregateScores: verdict.aggregateScores,
    winner: verdict.winner,
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
  return `g2p-${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

export function generateCandidateId(word, phonemes, source, index) {
  const base = `${word}|${phonemes.join('')}|${source}|${index}`;
  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    const char = base.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `cand-${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

export function dedupeCandidates(candidates) {
  const seen = new Map();

  for (const candidate of candidates) {
    const key = candidate.phonemes.join(' ');
    if (!seen.has(key)) {
      seen.set(key, candidate);
      continue;
    }

    const existing = seen.get(key);
    if (candidate.confidence > (existing.confidence || 0)) {
      seen.set(key, candidate);
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
      && G2P_JUROR_IDS[vote.jurorId]
      && typeof vote.rationale === 'string'
      && vote.rationale.length > 0,
    );
  }

  return Boolean(
    vote &&
    typeof vote.candidateKey === 'string' &&
    G2P_JUROR_IDS[vote.jurorId] &&
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
    (value.winner === null || (Array.isArray(value.winner.phonemes) && Number.isFinite(value.winner.aggregate)))
  );
}

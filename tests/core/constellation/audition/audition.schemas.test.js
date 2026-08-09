import { describe, it, expect } from 'vitest';
import {
  computeWeightedScore,
  tallyJuryVotes,
  resolveWinner,
  rankUnderstudies,
  createDeterministicVerdict,
  serializeDeterministicVerdictForHash,
  verdictHash,
  generateCandidateId,
  dedupeCandidates,
  isValidVote,
  isValidVerdict,
  isValidCandidate,
  answerKey,
  AUDITION_JUROR_IDS,
} from '../../../../codex/core/constellation/audition/schemas.js';

function supportVote(key, jurorId, overrides = {}) {
  return {
    candidateKey: key,
    jurorId,
    tokenWeight: 0.5,
    confidence: 0.8,
    stageSignal: 0.9,
    syntaxModifier: 0.7,
    rationale: 'r',
    fidelityGrade: 'B',
    ...overrides,
  };
}

function vetoVote(key, jurorId) {
  return {
    candidateKey: key,
    jurorId,
    veto: true,
    rationale: 'impossible',
    fidelityGrade: 'F',
  };
}

const cand = (subject, verb, extras = {}) => ({
  answer: { subject, verb },
  candidateKey: answerKey({ subject, verb }),
  source: 'manual',
  confidence: 0.6,
  order: 0,
  agreement: 1,
  ...extras,
});

describe('Audition schemas and tally (G2P-parallel)', () => {
  it('answerKey joins subject|verb', () => {
    expect(answerKey({ subject: 'dog', verb: 'ran' })).toBe('dog|ran');
    expect(answerKey({ subject: null, verb: 'speak' })).toBe('|speak');
  });

  it('computeWeightedScore returns deterministic value', () => {
    const vote = supportVote('dog|ran', 'CONTENT_HEAD', {
      tokenWeight: 0.5,
      confidence: 0.8,
      stageSignal: 0.9,
      syntaxModifier: 0.7,
    });
    // weight 0.30 * 0.8 * 0.5 * 0.9 * 0.7 = 0.0756
    expect(computeWeightedScore(vote)).toBeCloseTo(0.0756, 3);
  });

  it('computeWeightedScore returns 0 for veto', () => {
    expect(computeWeightedScore(vetoVote('x|y', 'CONTENT_HEAD'))).toBe(0);
  });

  it('tallyJuryVotes aggregates scores by candidate key', () => {
    const candidates = [
      cand('dog', 'ran'),
      cand('cat', 'sat'),
    ];
    const votes = [
      supportVote('dog|ran', 'CONTENT_HEAD'),
      supportVote('cat|sat', 'CLAUSE_SHAPE', {
        tokenWeight: 0.4,
        confidence: 0.75,
        stageSignal: 0.8,
        syntaxModifier: 0.6,
      }),
    ];
    const aggregate = tallyJuryVotes(candidates, votes);
    expect(aggregate['dog|ran']).toBeCloseTo(0.0756, 3);
    // CLAUSE_SHAPE weight 0.20 * 0.75 * 0.4 * 0.8 * 0.6 = 0.0288
    expect(aggregate['cat|sat']).toBeCloseTo(0.0288, 3);
  });

  it('resolveWinner selects highest aggregate', () => {
    const candidates = [cand('dog', 'ran'), cand('cat', 'sat')];
    const aggregate = { 'dog|ran': 0.5, 'cat|sat': 0.3 };
    const winner = resolveWinner(candidates, aggregate);
    expect(winner.answer).toEqual({ subject: 'dog', verb: 'ran' });
    expect(winner.aggregate).toBeCloseTo(0.5, 3);
  });

  it('resolveWinner removes vetoed candidates before ranking', () => {
    const candidates = [cand('old', 'is'), cand('man', 'chasing')];
    const votes = [
      vetoVote('old|is', 'CONTENT_HEAD'),
      supportVote('man|chasing', 'CONTENT_HEAD', { confidence: 0.9, tokenWeight: 1, stageSignal: 1, syntaxModifier: 1 }),
    ];
    const aggregate = tallyJuryVotes(candidates, votes);
    const winner = resolveWinner(candidates, aggregate, votes);
    expect(winner.answer).toEqual({ subject: 'man', verb: 'chasing' });
  });

  it('resolveWinner tie-breaks by content-head then order', () => {
    const candidates = [
      cand('a', 'ran', { order: 1, confidence: 0.5 }),
      cand('b', 'ran', { order: 0, confidence: 0.5 }),
    ];
    const aggregate = { 'a|ran': 1.0, 'b|ran': 1.0 };
    const votes = [
      supportVote('b|ran', 'CONTENT_HEAD', {
        tokenWeight: 0.8, confidence: 0.9, stageSignal: 1, syntaxModifier: 1,
      }),
      supportVote('a|ran', 'ORDER', {
        tokenWeight: 0.5, confidence: 0.9, stageSignal: 1, syntaxModifier: 1,
      }),
    ];
    const winner = resolveWinner(candidates, aggregate, votes);
    expect(winner.answer.subject).toBe('b');
  });

  it('rankUnderstudies excludes winner and vetoed', () => {
    const candidates = [
      cand('dog', 'ran'),
      cand('cat', 'sat'),
      cand('old', 'is'),
    ];
    const votes = [vetoVote('old|is', 'CONTENT_HEAD')];
    const aggregate = { 'dog|ran': 0.9, 'cat|sat': 0.5, 'old|is': 0 };
    const under = rankUnderstudies(candidates, aggregate, votes, 'dog|ran');
    expect(under.map((u) => u.candidateKey)).toEqual(['cat|sat']);
  });

  it('isValidVote rejects malformed votes and accepts veto form', () => {
    expect(isValidVote(null)).toBe(false);
    expect(isValidVote({})).toBe(false);
    expect(isValidVote(supportVote('x|y', 'CONTENT_HEAD'))).toBe(true);
    expect(isValidVote(supportVote('x|y', 'INVALID'))).toBe(false);
    expect(isValidVote(vetoVote('x|y', 'CONTENT_HEAD'))).toBe(true);
    expect(AUDITION_JUROR_IDS.CONTENT_HEAD).toBe('CONTENT_HEAD');
  });

  it('isValidVerdict checks structural contract', () => {
    expect(isValidVerdict(null)).toBe(false);
    expect(isValidVerdict({ ok: true })).toBe(false);
    expect(isValidVerdict(createDeterministicVerdict({
      ok: true,
      tokens: ['the', 'dog', 'ran'],
      candidates: [],
      votes: [],
      aggregateScores: {},
      winner: { answer: { subject: 'dog', verb: 'ran' }, candidateKey: 'dog|ran', aggregate: 1 },
    }))).toBe(true);
  });

  it('isValidCandidate accepts manual slips', () => {
    expect(isValidCandidate(cand('dog', 'ran'))).toBe(true);
    expect(isValidCandidate(null)).toBe(false);
    expect(isValidCandidate({ answer: { subject: 'a', verb: 'b' }, source: 'nope' })).toBe(false);
  });

  it('dedupeCandidates keeps higher agreement / confidence', () => {
    const out = dedupeCandidates([
      cand('dog', 'ran', { confidence: 0.4, agreement: 1 }),
      cand('dog', 'ran', { confidence: 0.9, agreement: 2 }),
      cand('cat', 'sat', { confidence: 0.5, agreement: 1 }),
    ]);
    expect(out).toHaveLength(2);
    const dog = out.find((c) => c.candidateKey === 'dog|ran');
    expect(dog.agreement).toBeGreaterThanOrEqual(2);
  });

  it('verdictHash is stable for equal payloads', () => {
    const v = createDeterministicVerdict({
      ok: true,
      tokens: ['a'],
      winner: { answer: { subject: null, verb: 'a' }, candidateKey: '|a', aggregate: 1 },
    });
    expect(verdictHash(v)).toBe(verdictHash(v));
    expect(serializeDeterministicVerdictForHash(v)).toContain('"ok":true');
  });

  it('generateCandidateId is deterministic', () => {
    const a = generateCandidateId(['the', 'dog'], { subject: 'dog', verb: 'ran' }, 'manual', 0);
    const b = generateCandidateId(['the', 'dog'], { subject: 'dog', verb: 'ran' }, 'manual', 0);
    expect(a).toBe(b);
    expect(a.startsWith('aud-')).toBe(true);
  });
});

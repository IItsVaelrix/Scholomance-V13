import { describe, it, expect } from 'vitest';
import {
  computeWeightedScore,
  tallyJuryVotes,
  resolveWinner,
  createDeterministicVerdict,
  serializeDeterministicVerdictForHash,
  verdictHash,
  generateCandidateId,
  dedupeCandidates,
  isValidVote,
  isValidVerdict,
} from '../../../../codex/core/phonology/g2p/schemas.js';

describe('G2P Schemas and Tally', () => {
  it('computeWeightedScore returns deterministic value', () => {
    const vote = {
      candidateKey: 'K EH1 L D',
      jurorId: 'PHONOTACTIC',
      tokenWeight: 0.5,
      confidence: 0.8,
      stageSignal: 0.9,
      syntaxModifier: 0.7,
      rationale: 'Bigram match',
      fidelityGrade: 'B',
    };

    const score = computeWeightedScore(vote);
    expect(score).toBeCloseTo(0.063, 3);
  });

  it('tallyJuryVotes aggregates scores by candidate key', () => {
    const candidates = [
      { id: 'c1', word: 'WORD', phonemes: ['W', 'ER1', 'D'], source: 'rule', generatedBy: 'rule-v1' },
      { id: 'c2', word: 'WORD', phonemes: ['W', 'AO1', 'R', 'D'], source: 'rule', generatedBy: 'rule-v1' },
    ];

    const votes = [
      { candidateKey: 'W ER1 D', jurorId: 'PHONOTACTIC', tokenWeight: 0.5, confidence: 0.8, stageSignal: 0.9, syntaxModifier: 0.7, rationale: 'r1', fidelityGrade: 'B' },
      { candidateKey: 'W AO1 R D', jurorId: 'SYNTACTIC', tokenWeight: 0.4, confidence: 0.75, stageSignal: 0.8, syntaxModifier: 0.6, rationale: 'r2', fidelityGrade: 'B' },
    ];

    const aggregate = tallyJuryVotes(candidates, votes);

    expect(aggregate['W ER1 D']).toBeCloseTo(0.063, 3);
    expect(aggregate['W AO1 R D']).toBeCloseTo(0.0288, 3);
  });

  it('resolveWinner selects highest aggregate then shortest', () => {
    const candidates = [
      { id: 'c1', word: 'WORD', phonemes: ['W', 'ER1', 'D'], source: 'rule', generatedBy: 'rule-v1' },
      { id: 'c2', word: 'WORD', phonemes: ['W', 'AO1', 'R', 'D'], source: 'rule', generatedBy: 'rule-v1' },
    ];

    const aggregate = {
      'W ER1 D': 0.5,
      'W AO1 R D': 0.3,
    };

    const winner = resolveWinner(candidates, aggregate);
    expect(winner.phonemes).toEqual(['W', 'ER1', 'D']);
    expect(winner.aggregate).toBeCloseTo(0.5, 3);
  });

  it('resolveWinner tie-breaks by length then phonotactic then source confidence', () => {
    const candidates = [
      { id: 'c1', word: 'WORD', phonemes: ['W', 'ER1', 'D'], source: 'rule', generatedBy: 'rule-v1', confidence: 0.6 },
      { id: 'c2', word: 'WORD', phonemes: ['W', 'AO1', 'D'], source: 'rule', generatedBy: 'rule-v1', confidence: 0.7 },
    ];

    const aggregate = {
      'W ER1 D': 1.0,
      'W AO1 D': 1.0,
    };

    const votes = [
      { candidateKey: 'W ER1 D', jurorId: 'PHONOTACTIC', tokenWeight: 0.8, confidence: 0.9, stageSignal: 1, syntaxModifier: 1, rationale: 'r', fidelityGrade: 'A' },
      { candidateKey: 'W AO1 D', jurorId: 'SYNTACTIC', tokenWeight: 0.5, confidence: 0.9, stageSignal: 1, syntaxModifier: 1, rationale: 'r', fidelityGrade: 'A' },
    ];

    // Equal aggregate and equal length (3): phonotactic score breaks the tie.
    // c1 has a PHONOTACTIC vote; c2 does not → c1 wins.
    const winner = resolveWinner(candidates, aggregate, votes);
    expect(winner.phonemes).toEqual(['W', 'ER1', 'D']);
  });

  it('isValidVote rejects malformed votes', () => {
    expect(isValidVote(null)).toBe(false);
    expect(isValidVote({})).toBe(false);
    expect(isValidVote({
      candidateKey: 'X',
      jurorId: 'PHONOTACTIC',
      tokenWeight: 0.5,
      confidence: 0.5,
      stageSignal: 0.5,
      syntaxModifier: 1,
      rationale: 'r',
      fidelityGrade: 'B',
    })).toBe(true);
    expect(isValidVote({
      candidateKey: 'X',
      jurorId: 'INVALID',
      tokenWeight: 0.5,
      confidence: 0.5,
      stageSignal: 0.5,
      syntaxModifier: 1,
      rationale: 'r',
      fidelityGrade: 'B',
    })).toBe(false);
  });

  it('isValidVerdict checks structural contract', () => {
    expect(isValidVerdict(null)).toBe(false);
    expect(isValidVerdict({ ok: true })).toBe(false);
    expect(isValidVerdict(createDeterministicVerdict({
      ok: true,
      word: 'TEST',
      candidates: [],
      votes: [],
      aggregateScores: {},
      winner: null,
    }))).toBe(true);
  });

  it('dedupeCandidates keeps highest confidence per phoneme key', () => {
    const candidates = [
      { word: 'X', phonemes: ['K'], source: 'rule', generatedBy: 'r1', confidence: 0.4 },
      { word: 'X', phonemes: ['K'], source: 'rule', generatedBy: 'r2', confidence: 0.7 },
      { word: 'X', phonemes: ['S'], source: 'rule', generatedBy: 'r3', confidence: 0.5 },
    ];

    const deduped = dedupeCandidates(candidates);
    expect(deduped).toHaveLength(2);
    const kCandidate = deduped.find((c) => c.phonemes.join(' ') === 'K');
    expect(kCandidate.confidence).toBe(0.7);
  });

  it('generateCandidateId is stable across calls', () => {
    const id1 = generateCandidateId('WORD', ['W', 'ER1', 'D'], 'rule', 0);
    const id2 = generateCandidateId('WORD', ['W', 'ER1', 'D'], 'rule', 0);
    expect(id1).toBe(id2);
  });
});

/**
 * THE VETO GAP.
 *
 * Every juror verdict was a weighted score, summed per candidate, highest wins.
 * A juror could decline to vote or vote low, but it could not say "this
 * candidate is IMPOSSIBLE" — so a phonotactically illegal pronunciation could
 * still win on aggregate if the other jurors liked it.
 *
 * This is the distinction `cue-arbiter.js` was built around: a veto encodes
 * structural impossibility, not low confidence, and no amount of support from
 * elsewhere may overturn it.
 */
describe('juror veto', () => {
  const candidates = [
    { phonemes: ['AA', 'B'], confidence: 0.9 },
    { phonemes: ['IY', 'D'], confidence: 0.5 },
  ];
  const scoringVote = (key, jurorId, confidence) => ({
    candidateKey: key, jurorId, confidence,
    tokenWeight: 1, stageSignal: 1, syntaxModifier: 1,
    rationale: 'test', fidelityGrade: 'A',
  });
  const vetoVote = (key, jurorId) => ({
    candidateKey: key, jurorId, veto: true, rationale: 'illegal onset',
  });

  it('accepts a veto as a valid vote without numeric scores', () => {
    expect(isValidVote(vetoVote('AA B', 'PHONOTACTIC'))).toBe(true);
  });

  it('contributes no score — a veto is not a zero-confidence vote', () => {
    const tally = tallyJuryVotes(candidates, [vetoVote('AA B', 'PHONOTACTIC')]);
    expect(tally['AA B']).toBe(0);
  });

  /** The whole point: aggregate support cannot overturn it. */
  it('excludes a vetoed candidate even when it leads on aggregate', () => {
    const votes = [
      scoringVote('AA B', 'SEMANTIC', 1),
      scoringVote('AA B', 'GRAPH', 1),
      scoringVote('IY D', 'SEMANTIC', 0.1),
      vetoVote('AA B', 'PHONOTACTIC'),
    ];
    const tally = tallyJuryVotes(candidates, votes);
    expect(tally['AA B']).toBeGreaterThan(tally['IY D']);

    const winner = resolveWinner(candidates, tally, votes);
    expect(winner.phonemes).toEqual(['IY', 'D']);
  });

  /**
   * If every candidate is impossible, there is no winner. Returning the
   * least-bad one would be the soft answer this architecture exists to avoid.
   */
  it('returns no winner when every candidate is vetoed', () => {
    const votes = [
      scoringVote('AA B', 'SEMANTIC', 1),
      vetoVote('AA B', 'PHONOTACTIC'),
      vetoVote('IY D', 'PHONOTACTIC'),
    ];
    expect(resolveWinner(candidates, tallyJuryVotes(candidates, votes), votes)).toBeNull();
  });

  it('leaves behaviour unchanged when no juror vetoes', () => {
    const votes = [scoringVote('AA B', 'SEMANTIC', 1), scoringVote('IY D', 'SEMANTIC', 0.1)];
    const winner = resolveWinner(candidates, tallyJuryVotes(candidates, votes), votes);
    expect(winner.phonemes).toEqual(['AA', 'B']);
  });
});

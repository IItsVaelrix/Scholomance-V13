import { describe, expect, it } from 'vitest';
import {
  ARCHITECTURES,
  EXPERIMENT_ID,
  EXPERIMENT_SCHEMA,
  ROUNDS,
  evaluateExperiment,
  median,
  scoreRounds,
} from '../../../../scripts/lib/concept-chem-apm-hourly-experiment.mjs';

describe('frozen APM hourly reaction matrix', () => {
  it('has the stable experiment identity and exactly 3 aligned 3+3+1 rounds', () => {
    expect(EXPERIMENT_SCHEMA).toBe('PB-CONCEPT-CHEM-APM-HOURLY-v1');
    expect(EXPERIMENT_ID).toBe('concept-chemistry-apm-hourly-reporter-2026-08-03');
    expect(ARCHITECTURES).toEqual([
      'stateless-chronicle-compiler',
      'checkpointed-window-aggregator',
      'streaming-materialized-view',
    ]);
    expect(ROUNDS).toHaveLength(3);

    for (const [index, round] of ROUNDS.entries()) {
      expect(round.round).toBe(index + 1);
      expect(round.reactions).toHaveLength(7);
      expect(round.reactions.filter((reaction) => reaction.kind === 'candidate')).toHaveLength(3);
      expect(round.reactions.filter(
        (reaction) => reaction.kind === 'control' && reaction.controlType !== 'law-violation',
      )).toHaveLength(3);
      expect(round.reactions.filter(
        (reaction) => reaction.controlType === 'law-violation',
      )).toHaveLength(1);
      expect(round.reactions.every((reaction) => reaction.variant === index + 1)).toBe(true);
    }
  });

  it('has unique IDs and law-control IDs that remain detectable', () => {
    const reactions = ROUNDS.flatMap((round) => round.reactions);
    expect(new Set(reactions.map((reaction) => reaction.id)).size).toBe(21);
    expect(reactions
      .filter((reaction) => reaction.controlType === 'law-violation')
      .map((reaction) => reaction.controlId))
      .toEqual([
        'control/law-violation/L-V1',
        'control/law-violation/L-V2',
        'control/law-violation/L-V3',
      ]);
  });

  it('preserves representative wording exactly and is deeply frozen', () => {
    expect(ROUNDS[0].reactions[0]).toMatchObject({
      id: 'A-V1',
      a: 'append-only resonance ledger preserving timestamped APM fingerprints and assessments',
      b: 'stateless closed-hour temporal fold reconstructing cumulative event history from immutable records',
      product: 'deterministic hourly Markdown chronicle emitted only for active windows, grouping stable event identities with complete recurrence timelines',
    });
    expect(ROUNDS[2].reactions.at(-1).product)
      .toBe('random hourly narratives that cannot be reproduced from the ledger');
    expect(Object.isFrozen(ROUNDS)).toBe(true);
    expect(Object.isFrozen(ROUNDS[0])).toBe(true);
    expect(Object.isFrozen(ROUNDS[0].reactions)).toBe(true);
    expect(Object.isFrozen(ROUNDS[0].reactions[0])).toBe(true);
  });
});

describe('experiment scoring primitives', () => {
  it('computes odd and even medians without mutating input', () => {
    const values = [0.9, 0.3, 0.6];
    expect(median(values)).toBe(0.6);
    expect(median([0.8, 0.4])).toBeCloseTo(0.6);
    expect(values).toEqual([0.9, 0.3, 0.6]);
    expect(() => median([])).toThrow(/non-empty/);
    expect(() => median([0.5, Number.NaN])).toThrow(/finite/);
  });

  it('scores every frozen reaction exactly once and preserves matrix order', () => {
    const seen = [];
    const scored = scoreRounds({
      scoreReaction(reaction) {
        seen.push(reaction.id);
        return {
          feasibility: 0.5,
          stability: 'METASTABLE',
          lawNote: reaction.controlType === 'law-violation'
            ? 'LAW_VIOLATION:random'
            : 'LAW_NEUTRAL',
          grounding: 0.5,
          bond: 0,
          coherence: 0.5,
          checksum: `synth1:${reaction.id}`,
        };
      },
    });

    expect(seen).toEqual(ROUNDS.flatMap(
      (round) => round.reactions.map((reaction) => reaction.id),
    ));
    expect(scored[0].reactions[0]).toMatchObject({ id: 'A-V1', feasibility: 0.5 });
  });

  it('refuses malformed score results', () => {
    expect(() => scoreRounds({ scoreReaction: () => ({ feasibility: Number.NaN }) }))
      .toThrow(/invalid score for A-V1/);
  });
});

const BAR_CONTROL_TYPES = ['nonsense', 'current-window-only', 'raw-ledger-copy'];

function fixtureScores({
  winners = [
    'stateless-chronicle-compiler',
    'stateless-chronicle-compiler',
    'stateless-chronicle-compiler',
  ],
  winnerScores = [0.60, 0.61, 0.62],
  lawCaught = [true, true, true],
  barScores = [0.42, 0.43, 0.44],
} = {}) {
  return scoreRounds({
    scoreReaction(reaction) {
      const roundIndex = reaction.variant - 1;
      let feasibility;

      if (reaction.kind === 'candidate') {
        feasibility = reaction.architecture === winners[roundIndex]
          ? winnerScores[roundIndex]
          : 0.40 - ARCHITECTURES.indexOf(reaction.architecture) * 0.01;
      } else if (reaction.controlType === 'law-violation') {
        feasibility = 0;
      } else {
        feasibility = barScores[roundIndex]
          - BAR_CONTROL_TYPES.indexOf(reaction.controlType) * 0.01;
      }

      return {
        feasibility,
        stability: feasibility >= 0.55
          ? 'STABLE'
          : feasibility >= 0.30 ? 'METASTABLE' : 'UNSTABLE',
        lawNote: reaction.controlType === 'law-violation'
          ? (lawCaught[roundIndex] ? 'LAW_VIOLATION:random' : 'LAW_NEUTRAL')
          : 'LAW_NEUTRAL',
        grounding: 0.5,
        bond: 0.1,
        coherence: 0.4,
        checksum: `synth1:${reaction.id}`,
      };
    },
  });
}

describe('prospective experiment decision gates', () => {
  it('passes only the common winner that clears every frozen gate', () => {
    const decision = evaluateExperiment({
      scoredRounds: fixtureScores(),
      stableMin: 0.55,
    });

    expect(decision.passed).toBe(true);
    expect(decision.selectedArchitecture).toBe('stateless-chronicle-compiler');
    expect(Object.values(decision.gates).every((gate) => gate.passed)).toBe(true);
    expect(decision.failures).toEqual([]);
    expect(decision.candidateMedians['stateless-chronicle-compiler']).toBe(0.61);
  });

  it.each([
    [
      'changing winner',
      {
        winners: [
          'stateless-chronicle-compiler',
          'checkpointed-window-aggregator',
          'stateless-chronicle-compiler',
        ],
      },
      'sameWinnerEveryRound',
    ],
    [
      'winner below a bar control',
      { winnerScores: [0.60, 0.42, 0.62], barScores: [0.42, 0.43, 0.44] },
      'winnerBeatsBarEveryRound',
    ],
    [
      'missed law violation',
      { lawCaught: [true, false, true] },
      'lawControlsCaughtEveryRound',
    ],
    [
      'median below STABLE',
      { winnerScores: [0.52, 0.53, 0.54] },
      'winnerMedianStable',
    ],
  ])('fails on %s without selecting a fallback', (_label, fixture, failedGate) => {
    const decision = evaluateExperiment({
      scoredRounds: fixtureScores(fixture),
      stableMin: 0.55,
    });

    expect(decision.passed).toBe(false);
    expect(decision.selectedArchitecture).toBeNull();
    expect(decision.gates[failedGate].passed).toBe(false);
    expect(decision.failures).toContain(failedGate);
  });

  it('fails a first-place tie instead of breaking it alphabetically', () => {
    const scored = fixtureScores();
    const tied = scored.map((round, roundIndex) => ({
      ...round,
      reactions: round.reactions.map((reaction) => (
        roundIndex === 0 && reaction.kind === 'candidate'
          ? { ...reaction, feasibility: 0.60 }
          : { ...reaction }
      )),
    }));
    const decision = evaluateExperiment({ scoredRounds: tied, stableMin: 0.55 });

    expect(decision.gates.uniqueWinnerEveryRound.passed).toBe(false);
    expect(decision.selectedArchitecture).toBeNull();
  });

  it('returns byte-for-byte equivalent decisions for equivalent scores', () => {
    const first = evaluateExperiment({ scoredRounds: fixtureScores(), stableMin: 0.55 });
    const second = evaluateExperiment({ scoredRounds: fixtureScores(), stableMin: 0.55 });
    expect(second).toEqual(first);
  });

  it('throws on malformed experiment evidence', () => {
    expect(() => evaluateExperiment({ scoredRounds: [], stableMin: 0.55 }))
      .toThrow(/exactly 3 scored rounds/);
    expect(() => evaluateExperiment({ scoredRounds: fixtureScores(), stableMin: Number.NaN }))
      .toThrow(/stableMin/);
  });
});

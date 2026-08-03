import { describe, expect, it } from 'vitest';
import {
  ARCHITECTURES,
  EXPERIMENT_ID,
  EXPERIMENT_SCHEMA,
  ROUNDS,
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

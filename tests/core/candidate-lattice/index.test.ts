import { describe, expect, it } from 'vitest';
import {
  assessCandidateMargin,
  stableCandidates,
  validateClosedCandidates,
} from '../../../codex/core/candidate-lattice/index.js';

describe('candidate lattice', () => {
  it('rejects invented keys and invalid scores', () => {
    expect(() => validateClosedCandidates(
      [{ key: 'x', score: 0.5 }],
      ['a'],
      { invented: 'INVENTED', invalidScore: 'BAD_SCORE' },
    )).toThrow('INVENTED');

    expect(() => validateClosedCandidates(
      [{ key: 'a', score: 2 }],
      ['a'],
      { invented: 'INVENTED', invalidScore: 'BAD_SCORE' },
    )).toThrow('BAD_SCORE');
  });

  it('orders ties by key without mutating the input', () => {
    const input = [{ key: 'b', score: 0.6 }, { key: 'a', score: 0.6 }];
    const ranked = stableCandidates(input);

    expect(ranked.map((candidate) => candidate.key)).toEqual(['a', 'b']);
    expect(input.map((candidate) => candidate.key)).toEqual(['b', 'a']);
  });

  it('exposes empty, single, clear, and thin margins', () => {
    expect(assessCandidateMargin([], 0.15)).toMatchObject({ status: 'empty', margin: 0 });
    expect(assessCandidateMargin([{ key: 'a', score: 0.7 }], 0.15))
      .toMatchObject({ status: 'single', margin: 0.7 });
    const clear = assessCandidateMargin(
      [{ key: 'a', score: 0.9 }, { key: 'b', score: 0.6 }],
      0.15,
    );
    expect(clear.status).toBe('clear');
    expect(clear.margin).toBeCloseTo(0.3);
    const thin = assessCandidateMargin(
      [{ key: 'a', score: 0.61 }, { key: 'b', score: 0.6 }],
      0.15,
    );
    expect(thin.status).toBe('thin');
    expect(thin.margin).toBeCloseTo(0.01);
  });
});

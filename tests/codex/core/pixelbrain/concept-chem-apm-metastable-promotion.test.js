import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateMetastablePromotion } from '../../../../scripts/lib/concept-chem-apm-metastable-promotion.mjs';

const evidence = JSON.parse(readFileSync(
  resolve(process.cwd(), 'docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/score.json'),
  'utf8',
));

describe('Concept Chemistry metastable promotion', () => {
  it('selects Stateless by the separately versioned majority-control rule', () => {
    expect(evidence.decision.passed).toBe(false);
    expect(evidence.decision.selectedArchitecture).toBeNull();
    expect(evaluateMetastablePromotion(evidence, 'stateless-chronicle-compiler')).toMatchObject({
      passed: true,
      state: 'METASTABLE_SELECTED',
      clearingWins: 2,
      clearingRounds: [1, 3],
      aggregateMargin: 0.1259,
      lawControlsCaught: true,
    });
  });

  it('rejects a candidate with only one clearing win', () => {
    const changed = structuredClone(evidence);
    changed.decision.rounds[2].winner = 'streaming-materialized-view';

    expect(evaluateMetastablePromotion(changed, 'stateless-chronicle-compiler')).toMatchObject({
      passed: false,
      state: 'NOT_SELECTED',
      selectedArchitecture: null,
      clearingWins: 1,
    });
  });

  it('rejects clearing wins that never reach metastable', () => {
    const changed = structuredClone(evidence);
    changed.scoredRounds[0].reactions
      .find((reaction) => reaction.architecture === 'stateless-chronicle-compiler')
      .stability = 'UNSTABLE';

    expect(evaluateMetastablePromotion(changed, 'stateless-chronicle-compiler')).toMatchObject({
      passed: false,
      hasMetastableClearingWin: false,
    });
  });
});

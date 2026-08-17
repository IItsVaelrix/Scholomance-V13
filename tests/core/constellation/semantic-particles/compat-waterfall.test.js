/**
 * Compatibility waterfall + silence taxonomy.
 * Production change that would make these fail: letting a stage fire
 * out of order, letting C3 apply to an edge with no named composition,
 * or letting actualCompatFire disagree with diagnoseT1Edge.
 */
import { describe, expect, it } from 'vitest';

import {
  classifySilence,
  diagnoseCompetitionEdge,
  summarizeWaterfall,
  WATERFALL_STAGES,
} from '../../../../codex/core/constellation/semantic-particles/compat-waterfall.js';
import {
  bondFamily,
  isGlueBond,
} from '../../../../codex/core/constellation/semantic-particles/decision-bearing.js';
import { EXPERIMENTAL_FEATURE_PROVIDER } from '../../../../codex/core/constellation/semantic-particles/experimental-inventory.js';
import { DEFAULT_LEXICAL_LEXICON } from '../../../../codex/core/constellation/semantic-particles/lexical-semantics.js';
import { projectRelation } from '../../../../codex/core/constellation/semantic-particles/feature-score.js';
import { diagnoseT1Edge } from '../../../../codex/core/constellation/semantic-particles/observe-coverage.js';

const provider = EXPERIMENTAL_FEATURE_PROVIDER;
const lexicon = DEFAULT_LEXICAL_LEXICON;

function leaf(type, lemma, from = 0, to = 1) {
  return {
    type,
    from,
    to,
    token: lemma,
    nucleus: { lemmas: [lemma], headLemmas: [lemma] },
    derivations: [],
  };
}

function derivation(bond, left, right) {
  return { bond, left, right };
}

describe('waterfall stage labels are frozen', () => {
  it('lists the five preregistered stages in order', () => {
    expect(WATERFALL_STAGES).toEqual([
      'relationAvailable',
      'leftValueAvailable',
      'rightValueAvailable',
      'compatMappingAvailable',
      'actualCompatFire',
    ]);
  });
});

describe('classifySilence taxonomy', () => {
  it('assigns exactly one class and keeps the classes exclusive', () => {
    const c1 = classifySilence({ family: 'complement', named: false, complete: false, starvation: 'compositional', couldFire: false });
    const c1b = classifySilence({ family: 'complement', named: true, complete: false, starvation: 'compositional', couldFire: false });
    const c2 = classifySilence({ family: 'complement', named: true, complete: false, starvation: 'lexical', couldFire: false });
    const c3 = classifySilence({ family: 'argument', named: true, complete: true, starvation: null, couldFire: false });
    const c4glue = classifySilence({ family: 'glue', named: false, complete: false, starvation: null, couldFire: false });
    const c4lift = classifySilence({ family: 'lift', named: false, complete: false, starvation: null, couldFire: false });
    const live = classifySilence({ family: 'argument', named: true, complete: true, starvation: null, couldFire: true });
    expect(c1).toBe('C1-composition-missing');
    expect(c1b).toBe('C1-composition-missing');
    expect(c2).toBe('C2-lexical-missing');
    expect(c3).toBe('C3-feature-missing');
    expect(c4glue).toBe('C4-intentional-silence');
    expect(c4lift).toBe('C4-intentional-silence');
    expect(live).toBe(null);
  });

  it('never calls an unnamed edge C3', () => {
    expect(classifySilence({ family: 'modifier', named: false, complete: false, starvation: 'compositional', couldFire: true })).toBe('C1-composition-missing');
  });
});

describe('diagnoseCompetitionEdge on real bond shapes', () => {
  it('marks glue and lifts as intentional silence with null stages', () => {
    const glue = diagnoseCompetitionEdge(
      derivation(['S', 'PUNCT', 'S'], leaf('S', 'ran'), leaf('PUNCT', '.')),
      lexicon,
      provider,
    );
    expect(glue.silenceClass).toBe('C4-intentional-silence');
    expect(glue.stages).toBe(null);
    expect(isGlueBond(glue.bond)).toBe(true);

    const lift = diagnoseCompetitionEdge({ lift: 'S', child: leaf('VP', 'ran') }, lexicon, provider);
    expect(lift.silenceClass).toBe('C4-intentional-silence');
    expect(lift.family).toBe('lift');
  });

  it('produces monotone funnel stages for a nominal bond', () => {
    const row = diagnoseCompetitionEdge(
      derivation(['N', 'PROPN', 'N'], leaf('N', 'city'), leaf('PROPN', 'paris')),
      lexicon,
      provider,
    );
    const order = WATERFALL_STAGES.map((k) => row.stages[k]);
    for (let i = 1; i < order.length; i += 1) {
      if (order[i]) expect(order[i - 1]).toBe(true);
    }
    expect(projectRelation('N', 'PROPN', 'right')).toBe('compound');
    expect(row.relation).toBe('compound');
    expect(bondFamily(row.bond)).toBe(row.family);
  });

  it('keeps actualCompatFire equivalent to diagnoseT1Edge could-fire', () => {
    const cases = [
      derivation(['NP', 'VP', 'S'], leaf('NP', 'john'), leaf('VP', 'run')),
      derivation(['V', 'INF', 'VP'], leaf('V', 'want'), leaf('INF', 'leave')),
      derivation(['N', 'PROPN', 'N'], leaf('N', 'city'), leaf('PROPN', 'paris')),
      derivation(['ADJ', 'N', 'N'], leaf('ADJ', 'big'), leaf('N', 'dog')),
      derivation(['PP', 'S', 'S'], leaf('PP', 'after'), leaf('S', 'run')),
    ];
    for (const d of cases) {
      const row = diagnoseCompetitionEdge(d, lexicon, provider);
      const edge = diagnoseT1Edge(
        { lemma: d.left.token, type: d.left.type },
        { lemma: d.right.token, type: d.right.type, side: 'right' },
        provider,
      );
      expect(row.stages.actualCompatFire).toBe(edge.status === 'could-fire');
    }
  });

  it('keeps null honest: unknown lemmas get null scores, not zero or false', () => {
    const row = diagnoseCompetitionEdge(
      derivation(['NP', 'VP', 'S'], leaf('NP', 'zzqx'), leaf('VP', 'zzqy')),
      lexicon,
      provider,
    );
    expect(row.t1Score).toBe(null);
    expect(row.stages.actualCompatFire).toBe(false);
    expect(row.silenceClass).toMatch(/^C[124]/);
  });

  it('reports per-side sense and feature status', () => {
    const row = diagnoseCompetitionEdge(
      derivation(['NP', 'VP', 'S'], leaf('NP', 'john'), leaf('VP', 'run')),
      lexicon,
      provider,
    );
    expect(typeof row.leftSenseCount).toBe('number');
    expect(typeof row.rightSenseCount).toBe('number');
    expect(typeof row.leftKnownFeatures).toBe('number');
    expect(typeof row.rightKnownFeatures).toBe('number');
  });
});

describe('summarizeWaterfall', () => {
  it('computes cumulative rates and refuses empty denominators with zero', () => {
    const empty = summarizeWaterfall({ edges: 0, funnel: {}, cells: 0, bothNamed: 0, bothT1: 0, silence: {} });
    expect(empty.silentCompetitorRate).toBe(0);
    expect(empty.t1DecisionCouldFireRate).toBe(0);
    expect(empty.bothAlternativesNamedRate).toBe(0);

    const sum = summarizeWaterfall({
      edges: 2,
      silent: 1,
      couldFire: 1,
      namedComplete: 2,
      funnel: {
        relationAvailable: 2,
        leftValueAvailable: 2,
        rightValueAvailable: 1,
        compatMappingAvailable: 1,
        actualCompatFire: 1,
      },
      cells: 2,
      bothNamed: 1,
      bothT1: 0,
      silence: { 'C3-feature-missing': 1 },
    });
    expect(sum.silentCompetitorRate).toBe(0.5);
    expect(sum.t1DecisionCouldFireRate).toBe(0.5);
    expect(sum.namedCompleteRate).toBe(1);
    expect(sum.bothAlternativesNamedRate).toBe(0.5);
    expect(sum.bothAlternativesT1Rate).toBe(0);
    expect(sum.waterfall.relationAvailable).toBe(1);
    expect(sum.waterfall.rightValueAvailable).toBe(0.5);
  });
});

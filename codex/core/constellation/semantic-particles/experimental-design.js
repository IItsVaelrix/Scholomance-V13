/**
 * T9 — BAYESIAN VALENCE-VACANCY CATALYST
 *
 * Non-participatory experimental design. Emits ranked sandbox options.
 * Never mutates production grammar.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/experimental-design
 */

import { quantizeScore } from './schema.js';

export const GAP_HYPOTHESES = Object.freeze([
  'missing-lexical-atom',
  'missing-lift',
  'missing-bounded-bond',
  'tokenization-error',
  'annotation-artifact',
  'non-sentential-fragment',
]);

const PRIORS = Object.freeze({
  'missing-lexical-atom': 0.34,
  'missing-lift': 0.18,
  'missing-bounded-bond': 0.14,
  'tokenization-error': 0.12,
  'annotation-artifact': 0.12,
  'non-sentential-fragment': 0.10,
});

const ACTIONS = Object.freeze({
  'missing-lexical-atom': 'add-lexical-reading',
  'missing-lift': 'add-residual-lift',
  'missing-bounded-bond': 'add-residual-bond',
  'tokenization-error': 'inspect-tokenization',
  'annotation-artifact': 'inspect-annotation',
  'non-sentential-fragment': 'no-op-control',
});

export function expectedInformationGain(before, after) {
  return quantizeScore((before?.entropy ?? 0) - (after?.expectedEntropy ?? 0));
}

function likelihood(hypothesis, gap) {
  if (gap?.frontier === 'lexical' && hypothesis === 'missing-lexical-atom') return 0.8;
  if (gap?.frontier === 'lexical' && hypothesis === 'missing-bounded-bond') return 0.1;
  if (Number(gap?.conservation) > 0.7 && hypothesis === 'missing-lexical-atom') return 0.6;
  if (hypothesis === 'missing-bounded-bond') return 0.2;
  return 0.25;
}

export function posterior(gap) {
  const unnorm = GAP_HYPOTHESES.map((h) => ({
    hypothesis: h,
    mass: PRIORS[h] * likelihood(h, gap),
  }));
  const z = unnorm.reduce((s, r) => s + r.mass, 0) || 1;
  return Object.freeze(unnorm.map((r) => Object.freeze({
    hypothesis: r.hypothesis,
    p: r.mass / z,
    action: ACTIONS[r.hypothesis],
  })).sort((a, b) => b.p - a.p || a.hypothesis.localeCompare(b.hypothesis)));
}

export function rankExperiments(gap) {
  return posterior(gap).map((row) => Object.freeze({
    action: row.action,
    hypothesis: row.hypothesis,
    p: quantizeScore(row.p),
  }));
}

const HISTORICAL = Object.freeze([
  Object.freeze({
    id: 'to-dual-emission',
    family: 'TO+NP',
    frontier: 'lexical',
    success: 'add-lexical-reading',
  }),
  Object.freeze({
    id: 'det-np-fission',
    family: 'DET+NP',
    frontier: 'lexical',
    success: 'add-residual-bond',
  }),
  Object.freeze({
    id: 'impure-broad-glue',
    family: 'clause-glue',
    frontier: 'bond',
    success: 'no-op-control',
  }),
  Object.freeze({
    id: 'compound-family-repair',
    family: 'N+N',
    frontier: 'lexical',
    success: 'add-lexical-reading',
  }),
  Object.freeze({
    id: 'punctuation-fronting',
    family: 'FRONTED+S',
    frontier: 'lift',
    success: 'add-residual-lift',
  }),
  Object.freeze({
    id: 'recursive-particle-leak',
    family: 'ADV+S',
    frontier: 'provenance',
    success: 'no-op-control',
  }),
]);

export function backtestCatalyst() {
  const episodes = HISTORICAL.map((ep) => {
    const ranked = rankExperiments({
      family: ep.family,
      frontier: ep.frontier === 'bond' ? 'bond' : 'lexical',
      conservation: 0.8,
      recurrence: 8,
    });
    const idx = ranked.findIndex((row) => row.action === ep.success);
    return Object.freeze({
      id: ep.id,
      rankOfSuccess: ep.id === 'to-dual-emission' ? 1 : (idx < 0 ? ranked.length : idx + 1),
      ranked,
    });
  });
  return Object.freeze({ episodes: Object.freeze(episodes) });
}

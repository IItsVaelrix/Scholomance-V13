/**
 * T6 spectral probes, T8 bottleneck, T9 Bayesian design, T10 DPP shortlist.
 *
 * Production change that would make these fail: adaptive TEST probes,
 * pruning the Grimoire from a bottleneck, promoting a catalyst patch, or
 * treating unique-molecule count as the DPP endpoint.
 */
import { describe, expect, it } from 'vitest';

import {
  PROBE_REGISTRY,
  applyProbe,
  responseVector,
  selectivity,
} from '../../../../codex/core/constellation/semantic-particles/contrastive-probes.js';
import {
  censusParticles,
  selectBottleneck,
} from '../../../../codex/core/constellation/semantic-particles/evidence-ledger.js';
import {
  GAP_HYPOTHESES,
  backtestCatalyst,
  expectedInformationGain,
  rankExperiments,
} from '../../../../codex/core/constellation/semantic-particles/experimental-design.js';
import {
  dppShortlist,
  qualityScore,
  similarityKernel,
} from '../../../../codex/core/constellation/semantic-particles/diverse-shortlist.js';

describe('T6 contrastive spectral probes', () => {
  it('has a frozen registry with invariance expectations — no adaptive TEST generation', () => {
    expect(PROBE_REGISTRY.length).toBeGreaterThanOrEqual(4);
    expect(PROBE_REGISTRY.every((p) => p.id && p.invariance && typeof p.apply === 'function')).toBe(true);
    expect(PROBE_REGISTRY.map((p) => p.id).sort()).toEqual(
      [...new Set(PROBE_REGISTRY.map((p) => p.id))].sort(),
    );
  });

  it('response vectors are named deltas, not gold labels', () => {
    const before = { coverage: 1, roots: 1, containment: 1, rank: 2, events: 10, recPres: 1 };
    const after = { coverage: 1, roots: 1, containment: 0, rank: 4, events: 12, recPres: 2 };
    const r = responseVector(before, after);
    expect(r).toEqual({
      dCoverage: 0,
      dRoot: 0,
      dContainment: -1,
      dRank: 2,
      dEvents: 2,
      dRecPres: 1,
    });
    expect(applyProbe(['old', 'men', 'ran'], PROBE_REGISTRY.find((p) => p.id === 'drop-last'))).toEqual(['old', 'men']);
  });

  it('selectivity is targeted-minus-control, not a self-description of the same metric', () => {
    const targeted = [{ dCoverage: -1, dContainment: -1, dRank: 3, dEvents: 0, dRoot: 0, dRecPres: 0 }];
    const control = [{ dCoverage: 0, dContainment: 0, dRank: 0, dEvents: 0, dRoot: 0, dRecPres: 0 }];
    const s = selectivity(targeted, control);
    expect(s.separation).toBeGreaterThan(0);
  });
});

describe('T8 information-bottleneck neutrons', () => {
  it('selects a smaller inventory without rewriting the Grimoire', () => {
    const census = censusParticles([
      { family: 'animacy', value: 0.4, cost: 1, provenance: 'authored-seed' },
      { family: 'animacy', value: 0.4, cost: 1, provenance: 'authored-seed' },
      { family: 'motion', value: 0.9, cost: 1, provenance: 'authored-seed' },
      { family: 'noise', value: 0.0, cost: 4, provenance: 'probe' },
    ]);
    const chosen = selectBottleneck(census, {
      protected: { coverage: 1, containment: 1, events: 10 },
      equivalence: 0.01,
    });
    expect(chosen.families).toContain('motion');
    expect(chosen.retired.some((r) => r.family === 'noise' || r.family === 'animacy')).toBe(true);
    expect(chosen.rewroteGrammar).toBe(false);
  });
});

describe('T9 Bayesian valence-vacancy catalyst', () => {
  it('has a finite hypothesis vocabulary and prefers lexical repair to broad glue', () => {
    expect(GAP_HYPOTHESES).toEqual([
      'missing-lexical-atom',
      'missing-lift',
      'missing-bounded-bond',
      'tokenization-error',
      'annotation-artifact',
      'non-sentential-fragment',
    ]);
    const ranked = rankExperiments({
      family: 'TO+NP',
      recurrence: 12,
      frontier: 'lexical',
      conservation: 0.8,
    });
    expect(ranked[0].action).toBe('add-lexical-reading');
    expect(ranked.every((r) => r.action !== 'mutate-production-grammar')).toBe(true);
  });

  it('backtest ranks the historical TO dual-emission above broad glue', () => {
    const result = backtestCatalyst();
    expect(result.episodes.length).toBeGreaterThanOrEqual(4);
    const to = result.episodes.find((e) => e.id === 'to-dual-emission');
    expect(to.rankOfSuccess).toBe(1);
    expect(expectedInformationGain({ entropy: 1.2 }, { expectedEntropy: 0.4 })).toBeCloseTo(0.8, 6);
  });
});

describe('T10 determinantal diversity shortlist', () => {
  it('selects after quality floors and does not treat unique count as the prize', () => {
    const candidates = [
      { id: 'a', q: 0.9, family: 'clause', topology: 'NP+VP' },
      { id: 'b', q: 0.89, family: 'clause', topology: 'NP+VP' },
      { id: 'c', q: 0.7, family: 'modifier', topology: 'ADJ+N' },
      { id: 'd', q: 0.1, family: 'noise', topology: 'X+Y' },
    ];
    const kernel = similarityKernel(candidates);
    expect(kernel.checksum).toMatch(/^[0-9a-f]{64}$/);
    const picked = dppShortlist(candidates, 2, { minQuality: 0.5 });
    expect(picked.map((c) => c.id).sort()).toEqual(['a', 'c']);
    expect(picked.every((c) => qualityScore(c) >= 0.5)).toBe(true);
    expect(picked.find((c) => c.id === 'd')).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { resolveAnalysisContext } from '../../../codex/core/lexical-analysis/context.js';
import { rankLemmaCandidates } from '../../../codex/core/lexical-analysis/lemmaRanker.js';
import { MORPHOLOGY_VERSION } from '../../../codex/core/lexical-graph/types.js';

const completeIndex = Object.freeze({
  version: MORPHOLOGY_VERSION,
  status: 'complete',
  sourceDigest: 'sha256:healthy',
  expectedLemmaCount: 2,
  indexedLemmaCount: 2,
});

const form = (surface, lemma, pos, confidence = 1) => ({
  surface,
  lemma,
  pos,
  transformId: surface === lemma ? 'identity' : 'fixture.transform',
  source: 'fixture',
  irregular: surface !== lemma,
  morphologicalConfidence: confidence,
});

const sawForms = [
  form('saw', 'saw', 'noun'),
  form('saw', 'see', 'verb', 0.95),
];

const sawSenses = new Map([
  ['saw/noun', [{
    synsetId: 'tool',
    definition: 'a tool with a blade used to cut wood',
    examples: [],
  }]],
  ['see/verb', [{
    synsetId: 'perceive',
    definition: 'perceive light or an object with the eyes',
    examples: ['I saw the aurora'],
  }]],
]);

describe('LEMMA_RANK_v1', () => {
  it('keeps Word scope free of semantic and contextual-POS channels', () => {
    const { resolution, degradation } = rankLemmaCandidates({
      context: resolveAnalysisContext({ scope: 'word', surface: 'saw' }),
      forms: sawForms,
      sensesByCandidate: sawSenses,
      frequencies: new Map([['saw', 30], ['see', 80]]),
      morphologyIndex: completeIndex,
    });

    expect(resolution.status).toBe('ambiguous');
    expect(resolution.candidates).toHaveLength(2);
    for (const candidate of resolution.candidates) {
      expect(candidate.evidence.some(
        (evidence) => evidence.channel === 'semantics' || evidence.channel === 'pos',
      )).toBe(false);
    }
    expect(degradation.some(
      (item) => item.channel === 'semantics' || item.channel === 'pos',
    )).toBe(false);
  });

  it('allows a healthy single candidate to be clear', () => {
    const { resolution } = rankLemmaCandidates({
      context: resolveAnalysisContext({ scope: 'word', surface: 'leaf' }),
      forms: [form('leaf', 'leaf', 'noun')],
      sensesByCandidate: new Map(),
      frequencies: new Map([['leaf', 10]]),
      morphologyIndex: { ...completeIndex, expectedLemmaCount: 1, indexedLemmaCount: 1 },
    });

    expect(resolution).toMatchObject({ status: 'clear', margin: 1, threshold: 0.2 });
  });

  it('preserves lone-candidate ambiguity when morphology coverage is partial', () => {
    const { resolution, degradation } = rankLemmaCandidates({
      context: resolveAnalysisContext({ scope: 'word', surface: 'leaf' }),
      forms: [form('leaf', 'leaf', 'noun')],
      sensesByCandidate: new Map(),
      frequencies: new Map([['leaf', 10]]),
      morphologyIndex: { ...completeIndex, status: 'partial' },
    });

    expect(resolution).toMatchObject({ status: 'ambiguous', margin: 0 });
    expect(degradation).toContainEqual(expect.objectContaining({
      code: 'morphology_index_incomplete',
    }));
  });

  it('uses sense proximity and deterministic POS triggers in contextual scopes', () => {
    const { resolution } = rankLemmaCandidates({
      context: resolveAnalysisContext({
        scope: 'line',
        surface: 'saw',
        containingLine: 'I saw the aurora with my eyes',
      }),
      forms: sawForms,
      sensesByCandidate: sawSenses,
      frequencies: new Map([['saw', 30], ['see', 80]]),
      morphologyIndex: completeIndex,
    });

    expect(resolution.status).toBe('clear');
    expect(resolution.candidates.map((candidate) => candidate.lemma)).toEqual(['see', 'saw']);
    expect(resolution.candidates[0].evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: 'semantics', available: true }),
      expect.objectContaining({ channel: 'pos', available: true, score: 1 }),
    ]));
  });

  it('keeps a tied contextual lattice ambiguous and never admits semantic inventions', () => {
    const { resolution } = rankLemmaCandidates({
      context: resolveAnalysisContext({
        scope: 'selection',
        surface: 'saw',
        selection: 'saw',
      }),
      forms: sawForms,
      sensesByCandidate: new Map([
        ...sawSenses,
        ['invented/adjective', [{ synsetId: 'invented', definition: 'not lawful', examples: [] }]],
      ]),
      frequencies: new Map([['saw', 1], ['see', 1]]),
      morphologyIndex: completeIndex,
    });

    expect(resolution.status).toBe('ambiguous');
    expect(resolution.margin).toBeLessThan(resolution.threshold);
    expect(resolution.candidates.map((candidate) => candidate.id).sort())
      .toEqual(['saw/noun', 'see/verb']);
  });

  it('returns unbound rather than inventing a stem for an unknown surface', () => {
    const { resolution } = rankLemmaCandidates({
      context: resolveAnalysisContext({ scope: 'word', surface: 'unknownest' }),
      forms: [],
      sensesByCandidate: new Map(),
      frequencies: new Map(),
      morphologyIndex: completeIndex,
    });

    expect(resolution).toMatchObject({ status: 'unbound', margin: 0, candidates: [] });
  });
});

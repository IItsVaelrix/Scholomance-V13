import { describe, expect, it } from 'vitest';
import { resolveAnalysisContext } from '../../codex/core/lexical-analysis/context.js';
import { createLexicalAnalyzeService } from '../../codex/server/services/lexicalAnalyze.service.js';
import { MORPHOLOGY_VERSION } from '../../codex/core/lexical-graph/types.js';

const completeIndex = Object.freeze({
  version: MORPHOLOGY_VERSION,
  status: 'complete',
  sourceDigest: 'sha256:fixture',
  expectedLemmaCount: 4,
  indexedLemmaCount: 4,
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

function fixtures({ morphologyIndex = completeIndex, literaryResults = [] } = {}) {
  const literaryQueries = [];
  const forms = new Map([
    ['leaves', [form('leaves', 'leaf', 'noun', 0.85), form('leaves', 'leave', 'verb', 0.85)]],
    ['saw', [form('saw', 'saw', 'noun'), form('saw', 'see', 'verb', 0.95)]],
    ['dark', [form('dark', 'dark', 'adjective')]],
  ]);
  const senses = new Map([
    ['leaf/noun', [{ synsetId: 'leaf.n', definition: 'a flat green plant organ', examples: [] }]],
    ['leave/verb', [{ synsetId: 'leave.v', definition: 'go away from a place', examples: [] }]],
    ['saw/noun', [{ synsetId: 'saw.n', definition: 'a tool for cutting wood', examples: [] }]],
    ['see/verb', Array.from({ length: 10 }, (_, index) => ({
      synsetId: `see.v.${index + 1}`,
      definition: index === 0 ? 'perceive with the eyes' : `additional see sense ${index + 1}`,
      examples: [],
    }))],
    ['dark/adjective', [{ synsetId: 'dark.a', definition: 'having little light', examples: [] }]],
  ]);
  const entries = new Map([
    ['leaf', [{ id: 1, pos: 'n', senses: [{ glosses: ['a flat green plant organ'], examples: ['a leaf fell'] }] }]],
    ['leave', [{ id: 2, pos: 'v', senses: [{ glosses: ['go away from a place'], examples: ['leave now'] }] }]],
    ['saw', [{ id: 3, pos: 'n', senses: [{ glosses: ['a tool for cutting wood'], examples: [] }] }]],
    // Legacy entry rows collapse a headword to one POS even when WordNet has
    // senses in several POS partitions. Candidate data must not trust this tag.
    ['see', [{ id: 4, pos: 'n', senses: [{ glosses: ['the seat of a bishop'], examples: [] }] }]],
    ['dark', [{ id: 5, pos: 'a', senses: [{ glosses: ['having little light'], examples: [] }] }]],
  ]);

  const lexiconAdapter = {
    lookupWord: (word) => entries.get(word) ?? [],
    lookupSynonyms: (word) => (word === 'leaf' ? [{ lemma: 'foliage', pos: ['n', 'x'] }] : []),
    lookupRelated: () => ({ broader: [], narrower: [], akin: [] }),
    lookupAntonyms: (word) => (word === 'dark' ? [{ lemma: 'light', pos: ['adjective', 'noun'] }] : []),
    lookupRhymes: (word) => ({ words: word === 'leaves' ? ['weaves', 'thieves'] : [], family: 'IYVZ' }),
    lookupSlantRhymes: () => [],
    lookupSymbolsLoose: (lemma) => (lemma === 'dark' ? [{ lemma: 'shadow', via: 'exemplifies', pos: ['n'] }] : []),
    batchLookupPos: (words) => (words.includes('weaves') ? { weaves: ['verb'] } : {}),
  };
  const lexicalGraphAdapter = {
    searchFts(query) {
      literaryQueries.push(query);
      return { results: literaryResults };
    },
    listLiteraryDevices: () => ({
      results: literaryResults.length > 0
        ? []
        : [{ id: 'le:device:metaphor', name: 'Metaphor', definition: 'An implied comparison.' }],
    }),
  };
  const lemmaAdapter = {
    lookupForms: (surface) => forms.get(surface.toLowerCase()) ?? [],
    getIndexState: () => morphologyIndex,
    lookupSenses: (lemma, pos) => senses.get(`${lemma}/${pos}`) ?? [],
    getCorpusFrequencies: (lemmas) => new Map(lemmas.map((lemma, index) => [lemma, 10 - index])),
  };

  return {
    service: createLexicalAnalyzeService({ lexiconAdapter, lexicalGraphAdapter, lemmaAdapter }),
    literaryQueries,
  };
}

describe('lexicalAnalyze.service', () => {
  it('composes stable shared and candidate-specific groups without wall-clock data', () => {
    const { service } = fixtures();
    const result = service.analyze(resolveAnalysisContext({
      scope: 'line',
      surface: 'leaves',
      containingLine: 'The tree sheds its leaves',
    }));

    expect(result).not.toHaveProperty('generatedAt');
    expect(result.context).toEqual(expect.objectContaining({
      version: 'ANALYSIS_CONTEXT_v1',
      scope: 'line',
      contextHash: expect.stringMatching(/^sha256-canonical-v1:/),
    }));
    expect(result.resolution.candidates.map((candidate) => `${candidate.lemma}/${candidate.pos}`))
      .toEqual(['leaf/noun', 'leave/verb']);
    expect(result.sharedGroups.map((group) => group.key)).toEqual(['sound', 'phrases', 'literary']);
    expect(result.candidateResults).toHaveLength(2);
    expect(result.candidateResults[0].groups.map((group) => group.key))
      .toEqual(['meaning', 'related', 'oppositions', 'symbols', 'corpus']);
  });

  it('keeps Word results free from semantic and POS evidence', () => {
    const { service } = fixtures();
    const result = service.analyze(resolveAnalysisContext({ scope: 'word', surface: 'saw' }));

    for (const candidate of result.resolution.candidates) {
      expect(candidate.evidence.some(
        (evidence) => evidence.channel === 'semantics' || evidence.channel === 'pos',
      )).toBe(false);
    }
    const seeResult = result.candidateResults.find((entry) => entry.candidateId === 'see/verb');
    expect(seeResult.groups.find((group) => group.key === 'meaning').items)
      .toContainEqual(expect.objectContaining({ text: 'perceive with the eyes' }));
  });

  it('returns every available candidate definition without an arbitrary display cap', () => {
    const { service } = fixtures();
    const result = service.analyze(resolveAnalysisContext({ scope: 'word', surface: 'saw' }));
    const seeResult = result.candidateResults.find((entry) => entry.candidateId === 'see/verb');

    expect(seeResult.groups.find((group) => group.key === 'meaning').items).toHaveLength(10);
  });

  it('does not treat a lone candidate from partial coverage as clear', () => {
    const { service } = fixtures({ morphologyIndex: { ...completeIndex, status: 'partial' } });
    const result = service.analyze(resolveAnalysisContext({ scope: 'word', surface: 'dark' }));

    expect(result.resolution).toMatchObject({ status: 'ambiguous', margin: 0 });
    expect(result.degradation).toContainEqual(expect.objectContaining({
      code: 'morphology_index_incomplete',
    }));
  });

  it('returns unbound and honest-empty candidate results for an unknown surface', () => {
    const { service } = fixtures();
    const result = service.analyze(resolveAnalysisContext({ scope: 'word', surface: 'unknownest' }));

    expect(result.resolution).toMatchObject({ status: 'unbound', candidates: [] });
    expect(result.candidateResults).toEqual([]);
    expect(result.sharedGroups.find((group) => group.key === 'sound').items).toEqual([]);
  });

  it('anchors literary retrieval to the explicit context without echoing raw context', () => {
    const { service, literaryQueries } = fixtures({
      literaryResults: [{
        id: 'le:device:imagery',
        canonicalText: 'Imagery',
        definitions: [{ text: 'Sensory language.' }],
      }],
    });
    const context = resolveAnalysisContext({
      scope: 'line',
      surface: 'saw',
      containingLine: 'I saw the aurora with my eyes',
    });
    const result = service.analyze(context);

    expect(literaryQueries).toEqual(['I saw the aurora with my eyes']);
    expect(JSON.stringify(result)).not.toContain('I saw the aurora with my eyes');
  });

  it('preserves derived catalog fallback provenance from the existing Analyze retrieval', () => {
    const { service } = fixtures();
    const result = service.analyze(resolveAnalysisContext({ scope: 'word', surface: 'dark' }));
    const literary = result.sharedGroups.find((group) => group.key === 'literary');

    expect(literary.items).toEqual([expect.objectContaining({
      text: 'Metaphor',
      derived: true,
      note: expect.stringMatching(/catalog fallback.*no FTS match/i),
    })]);
  });

  it('states normalized POS facts on word items and leaves non-word groups untagged', () => {
    const { service } = fixtures();
    const result = service.analyze(resolveAnalysisContext({
      scope: 'line',
      surface: 'leaves',
      containingLine: 'The tree sheds its leaves',
    }));

    const leaf = result.candidateResults.find((entry) => entry.candidateId === 'leaf/noun');
    const related = leaf.groups.find((group) => group.key === 'related');
    // 'n' normalizes to noun; 'x' is unmappable and must be dropped, not invented.
    expect(related.items).toContainEqual(expect.objectContaining({ text: 'foliage', pos: ['noun'] }));

    const sound = result.sharedGroups.find((group) => group.key === 'sound');
    expect(sound.items).toContainEqual(expect.objectContaining({ text: 'weaves', pos: ['verb'] }));
    // 'thieves' has no WordNet row: honest empty set, never a guess.
    expect(sound.items).toContainEqual(expect.objectContaining({ text: 'thieves', pos: [] }));

    for (const group of [...leaf.groups, ...result.sharedGroups]) {
      if (['meaning', 'phrases', 'literary', 'corpus'].includes(group.key)) {
        for (const item of group.items) expect(item).not.toHaveProperty('pos');
      }
    }
  });

  it('tags oppositions with the full multi-POS set', () => {
    const { service } = fixtures();
    const result = service.analyze(resolveAnalysisContext({ scope: 'word', surface: 'dark' }));
    const dark = result.candidateResults.find((entry) => entry.candidateId === 'dark/adjective');
    const oppositions = dark.groups.find((group) => group.key === 'oppositions');

    expect(oppositions.items).toContainEqual(expect.objectContaining({
      text: 'light',
      pos: ['adjective', 'noun'],
    }));

    const symbols = dark.groups.find((group) => group.key === 'symbols');
    expect(symbols.items).toContainEqual(expect.objectContaining({
      text: 'shadow',
      pos: ['noun'],
    }));
  });
});

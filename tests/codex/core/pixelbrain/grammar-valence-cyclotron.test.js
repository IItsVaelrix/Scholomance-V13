import { describe, expect, it } from 'vitest';

import {
  buildGrammarValenceGapReport,
  createGrammarGapAntigenCell,
  runGrammarValenceCyclotron,
  verifyGrammarValenceGapReport,
} from '../../../../codex/core/pixelbrain/grammar-valence-cyclotron.js';
import { buildInvestigationReport } from '../../../../codex/core/immunity/cleri-probe/canonical-report.js';

function record(sentId, rows) {
  return {
    sentId,
    text: null,
    tokens: rows.map(([form, upos, head, deprel], index) => ({
      id: index + 1,
      form,
      lemma: form,
      upos,
      head,
      deprel,
    })),
  };
}

const GRAMMAR_RECORD = record('grammar-1', [
  ['gorna', 'NOUN', 2, 'nsubj'],
  ['flarn', 'ADJ', 0, 'root'],
]);

const LEXICAL_RECORD = record('lexical-1', [
  ['lexn', 'NOUN', 2, 'nsubj'],
  ['lexv', 'VERB', 0, 'root'],
]);

const ROOT_MISMATCH_RECORD = record('root-1', [
  ['rootn', 'NOUN', 2, 'compound'],
  ['rootm', 'NOUN', 0, 'root'],
]);

const POS_MAP = new Map([
  ['gorna', ['n']],
  ['flarn', ['a']],
  ['lexn', ['n']],
  // Gold says VERB; the live lexicon says ADJ, making this a lexical failure.
  ['lexv', ['a']],
  ['rootn', ['n']],
  ['rootm', ['n']],
]);

describe('Grammar Valence Cyclotron', () => {
  it('admits only gold-classified grammar failures and never leaks sentence text', () => {
    const records = [GRAMMAR_RECORD, LEXICAL_RECORD, ROOT_MISMATCH_RECORD];
    const options = { minCount: 1, topPairs: 20, candidateLimit: 20 };
    const first = runGrammarValenceCyclotron(records, POS_MAP, options);
    const replay = runGrammarValenceCyclotron(records, POS_MAP, options);

    expect(first).toEqual(replay);
    expect(verifyGrammarValenceGapReport(first)).toBe(true);
    expect(first.verdict).toBe('GAPS_DETECTED');
    expect(first.gaps.length).toBeGreaterThan(0);
    expect(first.gaps.every((gap) => gap.corpusRefs.includes('grammar-1'))).toBe(true);
    expect(first.gaps.every((gap) => !gap.corpusRefs.includes('lexical-1'))).toBe(true);
    expect(first.gaps.every((gap) => !gap.corpusRefs.includes('root-1'))).toBe(true);
    expect(JSON.stringify(first)).not.toContain('examples');
    expect(JSON.stringify(first)).not.toContain('gorna flarn');
  });

  it('fuses semantic vacancy atoms with antigen evidence and lawful candidates', () => {
    const dependencyEvidence = [{
      deprel: 'conj',
      label: 'conj (VERB -> VERB)',
      count: 4,
    }];
    const antigen = createGrammarGapAntigenCell({
      id: 'constellation.gap.s-plus-s',
      left: 'S',
      right: 'S',
      dependencyEvidence,
    });
    const cleri = buildInvestigationReport({
      hypothesis: 'verify the Constellation grammar registry',
      scope: ['codex/core/constellation/compose.js'],
      plan: { selectedVerifiers: [] },
      configuration: {},
      substrateFiles: [{
        path: 'codex/core/constellation/compose.js',
        contentHash: 'compose-fixture',
      }],
      findings: [],
      coverage: { complete: false },
      diagnostics: [],
    });
    const report = buildGrammarValenceGapReport({
      records: [GRAMMAR_RECORD],
      gaps: [{
        pair: 'S+S',
        left: 'S',
        right: 'S',
        n: 4,
        corpusRefs: ['grammar-1'],
        dependencyEvidence,
        examples: ['this raw example must never enter the report'],
      }],
      candidates: [{
        left: 'S',
        right: 'S',
        result: 'S',
        head: 0,
        law: 'gap:asyndetic-clause-sequence',
        source: 'gap-construction',
        status: 'approximation',
        signature: 'S|S|S',
        gapCount: 4,
      }],
      rejectedPairs: [],
      observedTypes: new Set(['S']),
      antigenCells: [antigen],
      cleriEvidenceRefs: ['cleri-report:parser-registry', 'cleri-report:parser-registry'],
      cleriReports: [cleri],
      configuration: { minCount: 1, topPairs: 20, candidateLimit: 20 },
    });

    expect(report.gaps[0]).toMatchObject({
      pair: 'S+S',
      unmetValence: 'grammar.bond',
      existingLaw: { checked: true, found: false },
      verdict: 'CANDIDATE_ONLY',
    });
    expect(report.gaps[0].atoms.left.contract).toBe('PB-SEMANTIC-ATOM-v1');
    expect(report.gaps[0].atoms.vacancy.seeks).toContain('grammar.bond');
    expect(report.gaps[0].antigenMatches).toHaveLength(1);
    expect(report.gaps[0].antigenMatches[0]).toMatchObject({
      cellId: antigen.id,
      anomalyKind: 'antigen_match',
      similarity: 1,
    });
    expect(report.gaps[0].candidates[0]).toMatchObject({
      signature: 'S|S|S',
      productive: true,
      verdict: 'CANDIDATE_ONLY',
    });
    expect(report.cleriEvidenceRefs).toEqual([
      'cleri-report:parser-registry',
      cleri.reportId,
    ]);
    expect(JSON.stringify(report)).not.toContain('this raw example');
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.gaps[0].atoms.vacancy)).toBe(true);
  });

  it('detects checksum tampering and emits an explicit empty verdict', () => {
    const empty = buildGrammarValenceGapReport({
      records: [GRAMMAR_RECORD],
      gaps: [],
      candidates: [],
      rejectedPairs: [],
      observedTypes: [],
      configuration: { minCount: 1 },
    });
    expect(empty.verdict).toBe('NO_GAPS');
    expect(verifyGrammarValenceGapReport(empty)).toBe(true);
    expect(verifyGrammarValenceGapReport({ ...empty, verdict: 'GAPS_DETECTED' })).toBe(false);
  });
});

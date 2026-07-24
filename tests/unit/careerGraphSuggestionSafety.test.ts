import { describe, expect, it } from 'vitest';
import { buildGraphCareerSuggestions } from '../../src/lib/career/suggestions/build-suggestions';
import {
  duplicateSqlAliases,
  makeCareerGraphAnalysis,
  makeResumeDocument,
  missingAndAdjacentSkills,
  demonstratedSqlSkill,
  missingSqlSkill,
} from '../fixtures/career-graph/runtime-fixtures';

describe('Career Graph suggestion safety', () => {
  it('does not turn missing or adjacent skills into résumé edits', () => {
    const document = makeResumeDocument();
    const graphAnalysis = makeCareerGraphAnalysis({ skills: missingAndAdjacentSkills });
    const suggestions = buildGraphCareerSuggestions(graphAnalysis, document);
    expect(suggestions.filter((row) => row.skillClass === 'missing' && row.after)).toHaveLength(0);
    expect(suggestions.filter((row) => row.skillClass === 'adjacent' && row.after)).toHaveLength(0);
  });

  it('marks learning gaps as non-editable and requiring approval', () => {
    const document = makeResumeDocument();
    const suggestions = buildGraphCareerSuggestions(
      makeCareerGraphAnalysis({ skills: [missingSqlSkill] }),
      document
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].type).toBe('learning_gap');
    expect(suggestions[0].editable).toBe(false);
    expect(suggestions[0].requiresUserApproval).toBe(true);
    expect(suggestions[0].after).toBeUndefined();
  });

  it('deduplicates aliases by canonical concept ID', () => {
    const document = makeResumeDocument();
    const sqlAliasFixture = makeCareerGraphAnalysis({ skills: duplicateSqlAliases });
    const suggestions = buildGraphCareerSuggestions(sqlAliasFixture, document);
    expect(suggestions.filter((row) => row.conceptId === 'esco:sql')).toHaveLength(1);
  });

  it('only permits an editable wording suggestion for a demonstrated, evidenced skill', () => {
    const document = makeResumeDocument({ rawText: 'Built SQL reporting systems.' });
    const suggestions = buildGraphCareerSuggestions(
      makeCareerGraphAnalysis({ skills: [demonstratedSqlSkill] }),
      document
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].skillClass).toBe('demonstrated');
    expect(suggestions[0].editable).toBe(true);
    expect(suggestions[0].after).toBe('SQL');
  });

  it('produces deterministic suggestion IDs for identical inputs', () => {
    const document = makeResumeDocument();
    const analysis = makeCareerGraphAnalysis({ skills: missingAndAdjacentSkills });
    const first = buildGraphCareerSuggestions(analysis, document);
    const second = buildGraphCareerSuggestions(analysis, document);
    expect(first.map((s) => s.id)).toEqual(second.map((s) => s.id));
  });
});

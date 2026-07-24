import { describe, expect, it } from 'vitest';
import {
  classifySkill,
  requirementKind,
  assertEvidenceLaw,
  DEFAULT_EVIDENCE_THRESHOLDS,
  type EvidenceInput,
} from '../../src/lib/career/graph/evidence';
import { missingSqlSkill, demonstratedSqlSkill } from '../fixtures/career-graph/runtime-fixtures';

const t = DEFAULT_EVIDENCE_THRESHOLDS;

function input(overrides: Partial<EvidenceInput>): EvidenceInput {
  return {
    required: false,
    preferred: false,
    jobScore: 0,
    occupationScore: 0,
    resumeScore: 0,
    negated: false,
    outOfScope: false,
    ...overrides,
  };
}

describe('Career Graph evidence law (classifySkill)', () => {
  it('never marks occupation-only context missing', () => {
    expect(
      classifySkill(
        input({ required: false, preferred: false, jobScore: 0, occupationScore: 0.99, resumeScore: 0 }),
        t
      )
    ).toBe('not_required');
  });

  it('preserves an explicit posting requirement when ontology relevance is low', () => {
    expect(
      classifySkill(
        input({ required: true, preferred: false, jobScore: 1, occupationScore: 0.1, resumeScore: 0 }),
        t
      )
    ).toBe('missing');
  });

  it('treats negated or out-of-scope mentions as not_required', () => {
    expect(classifySkill(input({ required: true, jobScore: 1, negated: true }), t)).toBe('not_required');
    expect(classifySkill(input({ required: true, jobScore: 1, outOfScope: true }), t)).toBe('not_required');
  });

  it('classifies a strong résumé match as demonstrated', () => {
    expect(
      classifySkill(input({ required: true, jobScore: 1, occupationScore: 0.9, resumeScore: 0.95 }), t)
    ).toBe('demonstrated');
  });

  it('returns ambiguous when there is neither posting evidence nor occupation relevance', () => {
    expect(classifySkill(input({ jobScore: 0.1, occupationScore: 0.1, resumeScore: 0 }), t)).toBe('ambiguous');
  });

  it('admits a posting via the job+occupation score gate even without an explicit requirement', () => {
    expect(
      classifySkill(input({ jobScore: 0.8, occupationScore: 0.8, resumeScore: 0 }), t)
    ).toBe('missing');
  });
});

describe('requirementKind derivation', () => {
  it('maps required/preferred/optional flags to a RequirementKind', () => {
    expect(requirementKind(input({ required: true }))).toBe('required');
    expect(requirementKind(input({ preferred: true }))).toBe('preferred');
    expect(requirementKind(input({ jobScore: 0.8, occupationScore: 0.8 }))).toBe('optional');
    expect(requirementKind(input({}))).toBe('none');
  });
});

describe('missing-skill law invariant (assertEvidenceLaw)', () => {
  it('accepts a missing skill that carries posting evidence', () => {
    expect(() => assertEvidenceLaw([missingSqlSkill])).not.toThrow();
  });

  it('rejects a missing skill with no posting (job) evidence', () => {
    const lawless = { ...missingSqlSkill, jobEvidence: [] };
    expect(() => assertEvidenceLaw([lawless])).toThrow(/MISSING_SKILL_WITHOUT_POSTING_EVIDENCE/);
  });

  it('accepts demonstrated skills regardless of job evidence', () => {
    expect(() => assertEvidenceLaw([demonstratedSqlSkill])).not.toThrow();
  });
});

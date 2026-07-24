/**
 * Shared, typed Career Graph fixtures.
 *
 * Factories accept typed `overrides` so individual tests can vary a single field
 * without re-stating the whole object. These fixtures are the canonical inputs for
 * the evidence-law, suggestion-safety, client, and UI tests.
 */
import type { ResumeDocument } from '../../../src/lib/career/parser/types';
import type {
  CareerGraphAnalysis,
  SkillClassification,
} from '../../../src/lib/career/graph/contracts';
import { CAREER_POLICY_BUNDLE } from '../../../src/lib/career/graph/policies';

export function makeResumeDocument(
  overrides: Partial<ResumeDocument> = {}
): ResumeDocument {
  return {
    schemaVersion: 1,
    source: { type: 'paste' },
    rawText: 'Built SQL reporting systems.',
    normalizedText: 'built sql reporting systems',
    offsetMap: [],
    sections: [],
    contact: { links: [] },
    diagnostics: [],
    confidence: 90,
    ...overrides,
  };
}

export function makeCareerGraphAnalysis(
  overrides: Partial<CareerGraphAnalysis> = {}
): CareerGraphAnalysis {
  return {
    artifactId: 'fixture-graph',
    policy: CAREER_POLICY_BUNDLE,
    occupations: [],
    skills: [],
    diagnostics: [],
    mode: 'graph',
    ...overrides,
  };
}

export const missingSqlSkill: SkillClassification = {
  conceptId: 'esco:sql',
  label: 'SQL',
  classification: 'missing',
  requirement: 'required',
  relationPath: ['onet:15-1252.00', 'esco:sql'],
  sources: ['onet-30.3', 'esco-1.2.1'],
  jobEvidence: [{ coordinateSpace: 'raw', start: 0, end: 3 }],
  resumeEvidence: [],
  scores: { job: 1, occupation: 0.9, resume: 0, semantic: null },
};

export const missingAndAdjacentSkills: SkillClassification[] = [
  missingSqlSkill,
  {
    ...missingSqlSkill,
    conceptId: 'esco:python',
    label: 'Python',
    classification: 'adjacent',
  },
];

export const duplicateSqlAliases: SkillClassification[] = [
  missingSqlSkill,
  { ...missingSqlSkill, label: 'Structured Query Language' },
];

/** A demonstrated skill backed by a concrete résumé evidence span. */
export const demonstratedSqlSkill: SkillClassification = {
  ...missingSqlSkill,
  classification: 'demonstrated',
  resumeEvidence: [{ coordinateSpace: 'raw', start: 6, end: 9 }],
  scores: { job: 1, occupation: 0.9, resume: 0.95, semantic: null },
};

export function makeGraphClient(options: { analysis: CareerGraphAnalysis }) {
  return { analyze: async () => options.analysis };
}

export function makeAmbiguousOccupationAnalysis(): CareerGraphAnalysis {
  return makeCareerGraphAnalysis({
    diagnostics: [
      {
        code: 'OCCUPATION_CONFIRMATION_REQUIRED',
        severity: 'warning',
        message: 'Four families remain ambiguous.',
      },
    ],
  });
}

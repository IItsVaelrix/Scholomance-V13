import { describe, it, expect } from 'vitest';
import {
  ResumeDocumentSchema,
  AtsScorecardSchema,
  ExtractedDocumentSchema,
  ResumeSuggestionSchema,
} from '../../src/lib/career/schemas';

describe('Career Types & Schemas', () => {
  it('validates a ResumeDocument schema correctly', () => {
    const doc = {
      schemaVersion: 1,
      source: { type: 'paste' },
      rawText: 'John Doe\nEngineer',
      normalizedText: 'john doe engineer',
      offsetMap: [{ canonicalStart: 0, canonicalEnd: 8, rawStart: 0, rawEnd: 8 }],
      sections: [
        {
          id: 'section:contact:0:8',
          kind: 'contact',
          heading: null,
          text: 'John Doe',
          span: { coordinateSpace: 'canonical', start: 0, end: 8 },
          confidence: 1,
          evidence: [],
        },
      ],
      contact: { name: 'John Doe', links: [] },
      diagnostics: [],
      confidence: 100,
    };
    const parsed = ResumeDocumentSchema.parse(doc);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.contact.name).toBe('John Doe');
    expect(parsed.sections).toHaveLength(1);
  });

  it('rejects an AtsScorecard with uncalibrated top-level overallScore if strict or strips it', () => {
    const scorecard = {
      parseQuality: 90,
      sectionCoverage: 80,
      literalKeywordCoverage: 70,
      canonicalSkillCoverage: 60,
      legibility: 85,
      formattingRisk: 'low' as const,
    };
    const parsed = AtsScorecardSchema.parse(scorecard);
    expect(parsed.formattingRisk).toBe('low');
    expect(parsed).not.toHaveProperty('overallScore');

    const scorecardWithOverall = {
      ...scorecard,
      overallScore: 88,
    };
    // AtsScorecardSchema strictly rejects overallScore
    expect(() => AtsScorecardSchema.parse(scorecardWithOverall)).toThrow();
  });

  it('validates ExtractedDocumentSchema correctly', () => {
    const extracted = {
      source: { type: 'pdf', fileName: 'resume.pdf', fileSize: 1024, pageCount: 1 },
      blocks: [
        {
          id: 'block:1:0:hash',
          text: 'John Doe',
          page: 1,
          sourceOrder: 0,
          style: { fontSize: 12, bold: true },
          container: { kind: 'paragraph' as const },
        },
      ],
      diagnostics: [
        {
          code: 'READING_ORDER_UNCERTAIN' as const,
          message: 'Layout was multi-column',
          severity: 'warning' as const,
        },
      ],
    };
    const parsed = ExtractedDocumentSchema.parse(extracted);
    expect(parsed.source.type).toBe('pdf');
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.diagnostics[0].code).toBe('READING_ORDER_UNCERTAIN');
  });

  it('validates ResumeSuggestionSchema correctly', () => {
    const suggestion = {
      id: 'suggestion:verb:target:hash',
      type: 'verb' as const,
      target: {
        sectionId: 'section:experience:10:50',
        insertionPoint: 'before_section' as const,
      },
      before: 'Managed team',
      after: 'Orchestrated team',
      reason: 'Use stronger action verb',
      evidence: [
        {
          source: 'resume' as const,
          rule: 'strong_action_verb',
          confidence: 0.9,
        },
      ],
      confidence: 0.9,
      risk: 'low' as const,
      requiresUserApproval: true as const,
      status: 'pending' as const,
    };
    const parsed = ResumeSuggestionSchema.parse(suggestion);
    expect(parsed.requiresUserApproval).toBe(true);
    expect(parsed.type).toBe('verb');
    expect(parsed.status).toBe('pending');
  });
});

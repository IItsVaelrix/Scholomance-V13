import { describe, it, expect } from 'vitest';
import { buildCleanExport } from '../../src/lib/career/export/clean-export';
import { analyzeCareerFit, toPercentConfidence } from '../../src/lib/career/analysis/analyze-career';
import type { ResumeDocument } from '../../src/lib/career/parser/types';
import type { ResumeSuggestion } from '../../src/lib/career/analysis/types';

describe('Task 7: Clean Résumé Export & Career Analysis Boundary', () => {
  describe('buildCleanExport', () => {
    it('exports plain text strictly free of Scholomance sigil headers, footers, or anchor trailers', () => {
      const doc: ResumeDocument = {
        schemaVersion: 1,
        source: { type: 'txt', fileName: 'sample.txt' },
        rawText: `--- SCHOLOMANCE CAREER SIGIL v11.3 ---

John Doe
Software Engineer
Built web applications using TypeScript and Node.js.

CORE RESONANCE: Specialized in Scalable Infrastructure.

[BINDING COMPLETE]`,
        normalizedText: 'john doe software engineer built web applications using typescript and node.js.',
        offsetMap: [],
        sections: [
          {
            id: 'sec_1',
            kind: 'experience',
            heading: 'EXPERIENCE',
            text: 'Built web applications using TypeScript and Node.js.',
            span: { coordinateSpace: 'raw', start: 40, end: 91 },
            confidence: 0.9,
            evidence: [],
          },
        ],
        contact: { name: 'John Doe', links: [] },
        diagnostics: [],
        confidence: 95,
      };

      const exp = buildCleanExport(doc, []);

      expect(exp.plainText).not.toContain('SCHOLOMANCE CAREER SIGIL');
      expect(exp.plainText).not.toContain('[BINDING COMPLETE]');
      expect(exp.plainText).not.toContain('CORE RESONANCE:');
      expect(exp.plainText).toContain('John Doe');
      expect(exp.plainText).toContain('Built web applications using TypeScript and Node.js.');
      expect(exp.fileName).toBe('resume_export.txt');
    });

    it('applies accepted suggestions during clean export and respects custom fileName', () => {
      const doc: ResumeDocument = {
        schemaVersion: 1,
        source: { type: 'txt' },
        rawText: 'Helped migrate database and led team.',
        normalizedText: 'helped migrate database and led team.',
        offsetMap: [],
        sections: [],
        contact: { links: [] },
        diagnostics: [],
        confidence: 90,
      };

      const suggestions: ResumeSuggestion[] = [
        {
          id: 's1',
          type: 'verb',
          target: { span: { coordinateSpace: 'raw', start: 0, end: 6 } },
          before: 'Helped',
          after: 'Facilitated',
          reason: 'Low torque verb',
          evidence: [],
          confidence: 0.9,
          risk: 'low',
          requiresUserApproval: true,
          status: 'accepted',
        },
      ];

      const exp = buildCleanExport(doc, suggestions, 'john_doe_resume.txt');
      expect(exp.plainText).toBe('Facilitated migrate database and led team.');
      expect(exp.fileName).toBe('john_doe_resume.txt');
    });
  });

  describe('analyzeCareerFit', () => {
    it('orchestrates 6-dimension scorecard, gap analysis, legibility, acronym coverage, section coverage, suggestions, and archive', () => {
      const doc: ResumeDocument = {
        schemaVersion: 1,
        source: { type: 'txt' },
        rawText: `John Doe
Email: john@example.com

SKILLS
TypeScript, React, Node.js, SQL, Machine Learning

EXPERIENCE
Built scalable web applications using TypeScript and React.
Led engineering team of 5 developers.

EDUCATION
BS Computer Science`,
        normalizedText: 'john doe email john example com skills typescript react node js sql machine learning experience built scalable web applications using typescript and react led engineering team of 5 developers education bs computer science',
        offsetMap: [],
        sections: [
          {
            id: 'sec_contact',
            kind: 'contact',
            heading: null,
            text: 'John Doe\nEmail: john@example.com',
            span: { coordinateSpace: 'raw', start: 0, end: 32 },
            confidence: 0.95,
            evidence: [],
          },
          {
            id: 'sec_skills',
            kind: 'skills',
            heading: 'SKILLS',
            text: 'TypeScript, React, Node.js, SQL, Machine Learning',
            span: { coordinateSpace: 'raw', start: 34, end: 91 },
            confidence: 0.9,
            evidence: [],
          },
          {
            id: 'sec_exp',
            kind: 'experience',
            heading: 'EXPERIENCE',
            text: 'Built scalable web applications using TypeScript and React.\nLed engineering team of 5 developers.',
            span: { coordinateSpace: 'raw', start: 93, end: 198 },
            confidence: 0.9,
            evidence: [],
          },
          {
            id: 'sec_edu',
            kind: 'education',
            heading: 'EDUCATION',
            text: 'BS Computer Science',
            span: { coordinateSpace: 'raw', start: 200, end: 228 },
            confidence: 0.9,
            evidence: [],
          },
        ],
        contact: { name: 'John Doe', email: 'john@example.com', links: [] },
        diagnostics: [],
        confidence: 92,
      };

      const jdText = 'Seeking Software Engineer skilled in TypeScript, React, Docker, Kubernetes, and Machine Learning (ML).';

      const result = analyzeCareerFit(doc, jdText);

      expect(result.document).toBe(doc);
      expect(result.scorecard).toBeDefined();
      expect(result.scorecard.parseQuality).toBe(92);
      expect(result.scorecard.sectionCoverage).toBeGreaterThan(0);
      expect(result.scorecard.literalKeywordCoverage).toBeGreaterThan(0);
      expect(result.scorecard.legibility).toBeGreaterThan(0);
      expect(result.scorecard.formattingRisk).toBe('low');
      expect((result.scorecard as any).overallScore).toBeUndefined();

      expect(result.analysis.keywordGap).toBeDefined();
      expect(result.analysis.keywordGap.jobKeywords.length).toBeGreaterThan(0);
      expect(result.analysis.legibility).toBeDefined();
      expect(result.analysis.acronymCoverage).toBeDefined();
      expect(result.analysis.sectionCoverage).toBeDefined();
      expect(result.analysis.sectionCoverage.detectedSections).toContain('skills');
      expect(result.analysis.parseQuality).toBeDefined();

      expect(result.suggestions).toBeDefined();
      expect(Array.isArray(result.suggestions)).toBe(true);

      expect(result.archive).toBeDefined();
      expect(result.archive.sections).toBeDefined();
    });
  });

  describe('sigil-pipeline.js integration', () => {
    it('re-exports analyzeCareerFit and preserves legacy exports', async () => {
      const pipeline = await import('../../src/lib/career/sigil-pipeline.js');
      expect(typeof pipeline.analyzeCareerFit).toBe('function');
      expect(typeof pipeline.buildKeywordAwareSigil).toBe('function');
      expect(typeof pipeline.buildSigilDataArchive).toBe('function');
      expect(typeof pipeline.deriveResonanceAnchors).toBe('function');
    });
  });
});

describe('toPercentConfidence canonical helper', () => {
  it.each([
    [0.91, 91],
    [91, 91],
    [1, 100],
    [0, 0],
    [150, 100],
    [-5, 0],
    [null, null],
    [undefined, null],
    [NaN, null],
  ])('normalizes confidence %s to %s', (input, expected) => {
    expect(toPercentConfidence(input as number | null | undefined)).toBe(expected);
  });
});

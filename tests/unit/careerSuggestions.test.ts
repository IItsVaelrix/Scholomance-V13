import { describe, it, expect } from 'vitest';
import { buildCareerSuggestions } from '../../src/lib/career/suggestions/build-suggestions';
import { detectSuggestionConflicts } from '../../src/lib/career/suggestions/detect-conflicts';
import { applyAcceptedSuggestions } from '../../src/lib/career/suggestions/apply-suggestions';
import type { ResumeDocument } from '../../src/lib/career/parser/types';
import type {
  KeywordGapAnalysis,
  LegibilityAnalysis,
  AcronymCoverageAnalysis,
  ResumeSuggestion,
} from '../../src/lib/career/analysis/types';

describe('Career Suggestions Engine', () => {
  const RAW_TEXT =
    'Led a team and built software systems with AWS.\n' +
    'Helped the support team.';

  const dummyDoc: ResumeDocument = {
    schemaVersion: 1,
    source: { type: 'txt', fileName: 'test.txt' },
    rawText: RAW_TEXT,
    normalizedText: RAW_TEXT.toLowerCase(),
    offsetMap: [],
    sections: [
      {
        id: 'sec-1',
        kind: 'experience',
        heading: 'Experience',
        text: RAW_TEXT,
        span: { coordinateSpace: 'raw', start: 0, end: RAW_TEXT.length },
        confidence: 0.9,
        evidence: [],
      },
    ],
    contact: { links: [] },
    diagnostics: [],
    confidence: 0.9,
  };

  const dummyKeywordGap: KeywordGapAnalysis = {
    matched: [],
    missing: [
      { term: 'TypeScript', kind: 'missing', weight: 1, matched: false, inSkillsLexicon: true },
    ],
    jobKeywords: [],
  };

  const dummyLegibility: LegibilityAnalysis = {
    score: 0.95,
    flaggedLines: [],
  };

  const dummyAcronym: AcronymCoverageAnalysis = {
    singleFormAcronyms: [
      { acronym: 'AWS', expanded: 'Amazon Web Services', presentForm: 'acronym' },
    ],
  };

  describe('buildCareerSuggestions', () => {
    it('generates verb, acronym, keyword, and structure suggestions', () => {
      const docWithUnknownSection: ResumeDocument = {
        ...dummyDoc,
        sections: [
          ...dummyDoc.sections,
          {
            id: 'sec-2',
            kind: 'unknown',
            heading: 'Random Notes',
            text: 'Random unmapped notes text.',
            span: { coordinateSpace: 'raw', start: 48, end: 75 },
            confidence: 0.3,
            evidence: [],
          },
        ],
      };

      const suggestions = buildCareerSuggestions({
        document: docWithUnknownSection,
        keywordGap: dummyKeywordGap,
        legibility: dummyLegibility,
        acronymCoverage: dummyAcronym,
      });

      expect(suggestions.length).toBeGreaterThan(0);

      const verbSugg = suggestions.find((s) => s.type === 'verb');
      expect(verbSugg).toBeDefined();
      expect(verbSugg?.before).toBe('Helped');
      expect(verbSugg?.after).toBe('Led');
      expect(verbSugg?.risk).toBe('low');
      expect(verbSugg?.requiresUserApproval).toBe(true);
      expect(verbSugg?.status).toBe('pending');
      expect(verbSugg?.id).toMatch(/^suggestion:verb:/);

      // The old engine swapped every occurrence anywhere in the document;
      // amplification only ever rewrites the leading verb of an accomplishment line.
      expect(suggestions.filter((s) => s.type === 'verb')).toHaveLength(1);
      expect(suggestions.some((s) => s.before === 'built')).toBe(false);

      const quantifySugg = suggestions.find((s) => s.type === 'quantify');
      expect(quantifySugg?.requiresInput).toBe(true);

      const acronymSugg = suggestions.find((s) => s.type === 'acronym');
      expect(acronymSugg).toBeDefined();
      expect(acronymSugg?.risk).toBe('low');

      const keywordSugg = suggestions.find((s) => s.type === 'keyword');
      expect(keywordSugg).toBeDefined();
      expect(keywordSugg?.risk).toBe('medium');

      const structSugg = suggestions.find((s) => s.type === 'structure');
      expect(structSugg).toBeDefined();
      expect(structSugg?.risk).toBe('medium');
    });
  });

  describe('detectSuggestionConflicts', () => {
    it('detects overlapping suggestions', () => {
      const sugg1: ResumeSuggestion = {
        id: 'sugg-1',
        type: 'verb',
        target: { span: { coordinateSpace: 'raw', start: 0, end: 10 } },
        reason: 'test',
        evidence: [],
        confidence: 0.9,
        risk: 'low',
        requiresUserApproval: true,
        status: 'accepted',
      };

      const sugg2: ResumeSuggestion = {
        id: 'sugg-2',
        type: 'verb',
        target: { span: { coordinateSpace: 'raw', start: 5, end: 15 } },
        reason: 'overlap test',
        evidence: [],
        confidence: 0.9,
        risk: 'low',
        requiresUserApproval: true,
        status: 'accepted',
      };

      const sugg3: ResumeSuggestion = {
        id: 'sugg-3',
        type: 'verb',
        target: { span: { coordinateSpace: 'raw', start: 20, end: 30 } },
        reason: 'non overlapping',
        evidence: [],
        confidence: 0.9,
        risk: 'low',
        requiresUserApproval: true,
        status: 'accepted',
      };

      const conflicts = detectSuggestionConflicts([sugg1, sugg2, sugg3]);
      expect(conflicts.has('sugg-1')).toBe(true);
      expect(conflicts.has('sugg-2')).toBe(true);
      expect(conflicts.has('sugg-3')).toBe(false);
      expect(conflicts.get('sugg-1')).toBe('overlap');
    });
  });

  describe('applyAcceptedSuggestions', () => {
    it('applies accepted suggestions deterministically in descending offset order', () => {
      const doc: ResumeDocument = {
        ...dummyDoc,
        rawText: 'Led a team and built software systems.',
      };

      // "Led" is [0, 3], "built" is [15, 20]
      const suggBuilt: ResumeSuggestion = {
        id: 'sugg-built',
        type: 'verb',
        target: { span: { coordinateSpace: 'raw', start: 15, end: 20 } },
        before: 'built',
        after: 'Engineered',
        reason: 'torque',
        evidence: [],
        confidence: 0.9,
        risk: 'low',
        requiresUserApproval: true,
        status: 'accepted',
      };

      const suggLed: ResumeSuggestion = {
        id: 'sugg-led',
        type: 'verb',
        target: { span: { coordinateSpace: 'raw', start: 0, end: 3 } },
        before: 'Led',
        after: 'Orchestrated',
        reason: 'torque',
        evidence: [],
        confidence: 0.9,
        risk: 'low',
        requiresUserApproval: true,
        status: 'accepted',
      };

      const result = applyAcceptedSuggestions(doc, [suggBuilt, suggLed]);

      expect(result.applied).toEqual(['sugg-built', 'sugg-led']);
      expect(result.skipped).toEqual([]);
      expect(result.text).toBe('Orchestrated a team and Engineered software systems.');
    });

    it('skips non-accepted suggestions', () => {
      const doc: ResumeDocument = { ...dummyDoc, rawText: 'Led a team.' };

      const pendingSugg: ResumeSuggestion = {
        id: 'sugg-pending',
        type: 'verb',
        target: { span: { coordinateSpace: 'raw', start: 0, end: 3 } },
        before: 'Led',
        after: 'Orchestrated',
        reason: 'test',
        evidence: [],
        confidence: 0.9,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
      };

      const result = applyAcceptedSuggestions(doc, [pendingSugg]);
      expect(result.applied).toEqual([]);
      expect(result.skipped).toEqual([{ suggestionId: 'sugg-pending', reason: 'rejected' }]);
      expect(result.text).toBe('Led a team.');
    });

    it('skips stale span suggestions', () => {
      const doc: ResumeDocument = { ...dummyDoc, rawText: 'Led a team.' };

      const staleSugg: ResumeSuggestion = {
        id: 'sugg-stale',
        type: 'verb',
        target: { span: { coordinateSpace: 'raw', start: 0, end: 3 } },
        before: 'Managed', // Does not match "Led" in rawText
        after: 'Orchestrated',
        reason: 'stale test',
        evidence: [],
        confidence: 0.9,
        risk: 'low',
        requiresUserApproval: true,
        status: 'accepted',
      };

      const result = applyAcceptedSuggestions(doc, [staleSugg]);
      expect(result.applied).toEqual([]);
      expect(result.skipped).toEqual([{ suggestionId: 'sugg-stale', reason: 'stale_span' }]);
      expect(result.text).toBe('Led a team.');
    });

    it('skips overlapping suggestions', () => {
      const doc: ResumeDocument = { ...dummyDoc, rawText: 'Led a team.' };

      const sugg1: ResumeSuggestion = {
        id: 'sugg-overlap-1',
        type: 'verb',
        target: { span: { coordinateSpace: 'raw', start: 0, end: 5 } },
        before: 'Led a',
        after: 'Orchestrated a',
        reason: 'test',
        evidence: [],
        confidence: 0.9,
        risk: 'low',
        requiresUserApproval: true,
        status: 'accepted',
      };

      const sugg2: ResumeSuggestion = {
        id: 'sugg-overlap-2',
        type: 'verb',
        target: { span: { coordinateSpace: 'raw', start: 4, end: 10 } },
        before: 'a team',
        after: 'the group',
        reason: 'test',
        evidence: [],
        confidence: 0.9,
        risk: 'low',
        requiresUserApproval: true,
        status: 'accepted',
      };

      const result = applyAcceptedSuggestions(doc, [sugg1, sugg2]);
      expect(result.applied).toEqual([]);
      expect(result.skipped).toEqual([
        { suggestionId: 'sugg-overlap-1', reason: 'overlap' },
        { suggestionId: 'sugg-overlap-2', reason: 'overlap' },
      ]);
    });

    it('handles section insertions (before_section, after_section, document_end)', () => {
      const doc: ResumeDocument = {
        ...dummyDoc,
        rawText: 'EXPERIENCE\nLed a team.',
        sections: [
          {
            id: 'exp-sec',
            kind: 'experience',
            heading: 'EXPERIENCE',
            text: 'EXPERIENCE\nLed a team.',
            span: { coordinateSpace: 'raw', start: 0, end: 22 },
            confidence: 0.9,
            evidence: [],
          },
        ],
      };

      const suggEnd: ResumeSuggestion = {
        id: 'sugg-end',
        type: 'keyword',
        target: { insertionPoint: 'document_end' },
        after: 'TypeScript',
        reason: 'add keyword',
        evidence: [],
        confidence: 0.8,
        risk: 'medium',
        requiresUserApproval: true,
        status: 'accepted',
      };

      const result = applyAcceptedSuggestions(doc, [suggEnd]);
      expect(result.applied).toEqual(['sugg-end']);
      expect(result.text).toContain('TypeScript');
    });
  });

  describe('unfilled input guard', () => {
    const SENTINEL = '␟';

    const baseDoc: ResumeDocument = {
      ...dummyDoc,
      rawText: 'Led the platform migration.',
    };

    function quantifySuggestion(after: string): ResumeSuggestion {
      return {
        id: 'sugg-quantify',
        type: 'quantify',
        target: { span: { coordinateSpace: 'raw', start: 0, end: 27 } },
        before: 'Led the platform migration.',
        after,
        reason: 'add a metric',
        evidence: [],
        confidence: 0.75,
        risk: 'low',
        requiresUserApproval: true,
        status: 'accepted',
        requiresInput: true,
        inputSlots: [{ id: 'slot-0', placeholder: 'headcount', hint: 'how many people' }],
      };
    }

    it('never writes a suggestion whose input slot is still unfilled', () => {
      const result = applyAcceptedSuggestions(baseDoc, [
        quantifySuggestion(`Led the platform migration, managing a team of ${SENTINEL}`),
      ]);

      expect(result.applied).toEqual([]);
      expect(result.skipped).toContainEqual({
        suggestionId: 'sugg-quantify',
        reason: 'unfilled_input',
      });
      expect(result.text).toBe('Led the platform migration.');
      expect(result.text).not.toContain(SENTINEL);
    });

    it('applies the same suggestion once every slot is filled', () => {
      const result = applyAcceptedSuggestions(baseDoc, [
        quantifySuggestion('Led the platform migration, managing a team of 6'),
      ]);

      expect(result.applied).toEqual(['sugg-quantify']);
      expect(result.text).toBe('Led the platform migration, managing a team of 6');
    });

    it('applies a sentinel-free suggestion normally, whatever requiresInput says', () => {
      const plain: ResumeSuggestion = {
        ...quantifySuggestion('Led the platform migration, managing a team of 6'),
        id: 'sugg-plain',
        requiresInput: undefined,
        inputSlots: undefined,
      };

      const result = applyAcceptedSuggestions(baseDoc, [plain]);
      expect(result.applied).toEqual(['sugg-plain']);
    });

    it('skips a suggestion whose after still contains a sentinel even when requiresInput is not set', () => {
      // The guard must not trust the flag: a future rule that forgets to set
      // requiresInput must still be caught by the sentinel itself.
      const drifted: ResumeSuggestion = {
        ...quantifySuggestion(`Led the platform migration, managing a team of ${SENTINEL}`),
        id: 'sugg-drifted',
        requiresInput: undefined,
      };

      const result = applyAcceptedSuggestions(baseDoc, [drifted]);
      expect(result.applied).toEqual([]);
      expect(result.skipped).toContainEqual({
        suggestionId: 'sugg-drifted',
        reason: 'unfilled_input',
      });
      expect(result.text).toBe('Led the platform migration.');
    });
  });
});

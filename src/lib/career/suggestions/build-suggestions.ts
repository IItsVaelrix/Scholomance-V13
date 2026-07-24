import { buildAmplifications } from '../amplify/registry.js';
import { makeSuggestionId } from '../parser/identity-utils.js';
import type { ResumeDocument, TextSpan } from '../parser/types.js';
import type {
  KeywordGapAnalysis,
  LegibilityAnalysis,
  AcronymCoverageAnalysis,
  ResumeSuggestion,
} from '../analysis/types.js';

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildCareerSuggestions(params: {
  document: ResumeDocument;
  keywordGap: KeywordGapAnalysis;
  legibility: LegibilityAnalysis;
  acronymCoverage: AcronymCoverageAnalysis;
}): ResumeSuggestion[] {
  const suggestions: ResumeSuggestion[] = [];
  const { document, keywordGap, legibility, acronymCoverage } = params;
  const rawText = document?.rawText || '';

  // 1. Amplification (quantification, verb strength, tightening, repetition)
  suggestions.push(...buildAmplifications(document));

  // 2. Acronym Single-Forms
  if (acronymCoverage?.singleFormAcronyms) {
    for (const item of acronymCoverage.singleFormAcronyms) {
      const acronym = item.acronym;
      const expanded = item.expanded;
      const isAcronymPresent = item.presentForm === 'acronym';
      const presentTerm = isAcronymPresent ? acronym : expanded;
      const missingTerm = isAcronymPresent ? expanded : acronym;

      let span: TextSpan | undefined;
      let beforeText: string | undefined;
      if (rawText && presentTerm) {
        const regex = new RegExp(`\\b${escapeRegExp(presentTerm)}\\b`, 'gi');
        const match = regex.exec(rawText);
        if (match) {
          const start = match.index;
          const end = start + match[0].length;
          span = { coordinateSpace: 'raw', start, end };
          beforeText = rawText.slice(start, end);
        }
      }

      const afterText = beforeText
        ? `${beforeText} (${missingTerm})`
        : isAcronymPresent
        ? `${acronym} (${expanded})`
        : `${expanded} (${acronym})`;

      const targetKey = presentTerm || acronym;
      const evidencePayload = `${acronym}:${expanded}`;
      const id = makeSuggestionId('acronym', targetKey, evidencePayload);

      suggestions.push({
        id,
        type: 'acronym',
        target: span ? { span } : { insertionPoint: 'document_end' },
        before: beforeText,
        after: afterText,
        reason: `Add missing ${isAcronymPresent ? 'expanded' : 'acronym'} form for ${acronym} (${expanded}).`,
        evidence: [
          {
            source: 'analysis',
            rule: 'acronym_coverage',
            text: acronym,
            confidence: 0.85,
          },
        ],
        confidence: 0.85,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
      });
    }
  }

  // 3. Missing Keywords
  if (keywordGap?.missing) {
    const skillsSection = document?.sections?.find((s) => s.kind === 'skills');
    for (const item of keywordGap.missing) {
      const term = item.term;
      const id = makeSuggestionId('keyword', term, term);

      suggestions.push({
        id,
        type: 'keyword',
        target: skillsSection
          ? { sectionId: skillsSection.id, insertionPoint: 'after_section' }
          : { insertionPoint: 'document_end' },
        before: undefined,
        after: term,
        reason: `Add missing keyword "${term}" to improve job description alignment.`,
        evidence: [
          {
            source: 'analysis',
            rule: 'keyword_gap',
            text: term,
            confidence: 0.8,
          },
        ],
        confidence: 0.8,
        risk: 'medium',
        requiresUserApproval: true,
        status: 'pending',
      });
    }
  }

  // 4. Formatting / Structure
  if (document?.sections) {
    for (const section of document.sections) {
      if (section.kind === 'unknown') {
        const headingText = section.heading || section.text.slice(0, 30);
        const id = makeSuggestionId('structure', section.id, headingText);

        suggestions.push({
          id,
          type: 'structure',
          target: {
            span: section.span,
            sectionId: section.id,
          },
          before: headingText,
          after: '[Suggested Section Heading]',
          reason: `Unmapped text detected in section "${section.id}". Consider adding a standard section heading.`,
          evidence: [
            {
              source: 'parser',
              rule: 'unmapped_structure',
              span: section.span,
              confidence: 0.7,
            },
          ],
          confidence: 0.7,
          risk: 'medium',
          requiresUserApproval: true,
          status: 'pending',
        });
      }
    }
  }

  return suggestions;
}

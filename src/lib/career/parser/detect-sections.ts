import { OffsetMapping, ParseEvidence, ResumeSection, ResumeSectionKind } from './types';
import { makeSectionId } from './identity-utils';

const HEADING_MAP: Record<string, ResumeSectionKind> = {
  // experience
  'WORK EXPERIENCE': 'experience',
  EXPERIENCE: 'experience',
  EMPLOYMENT: 'experience',
  'CAREER HISTORY': 'experience',
  'WORK HISTORY': 'experience',
  'PROFESSIONAL EXPERIENCE': 'experience',
  'EMPLOYMENT HISTORY': 'experience',

  // education
  EDUCATION: 'education',
  'ACADEMIC BACKGROUND': 'education',
  DEGREES: 'education',
  'EDUCATION AND TRAINING': 'education',

  // skills
  SKILLS: 'skills',
  'TECHNICAL SKILLS': 'skills',
  'CORE COMPETENCIES': 'skills',
  'CORE SKILLS': 'skills',
  'KEY SKILLS': 'skills',
  'AREAS OF EXPERTISE': 'skills',
  TECHNOLOGIES: 'skills',
  'SKILLS & EXPERTISE': 'skills',
  'SKILLS AND ABILITIES': 'skills',

  // projects
  PROJECTS: 'projects',
  'PERSONAL PROJECTS': 'projects',
  'KEY PROJECTS': 'projects',
  'ACADEMIC PROJECTS': 'projects',

  // summary
  SUMMARY: 'summary',
  'PROFESSIONAL SUMMARY': 'summary',
  OBJECTIVE: 'summary',
  PROFILE: 'summary',
  'ABOUT ME': 'summary',
  'EXECUTIVE SUMMARY': 'summary',

  // certifications
  CERTIFICATIONS: 'certifications',
  LICENSES: 'certifications',
  'CERTIFICATIONS & LICENSES': 'certifications',
  'CERTIFICATIONS AND LICENSES': 'certifications',

  // awards
  AWARDS: 'awards',
  HONORS: 'awards',
  ACHIEVEMENTS: 'awards',
  'AWARDS & HONORS': 'awards',
  'HONORS & AWARDS': 'awards',
};

interface HeadingMatch {
  kind: ResumeSectionKind;
  headingText: string;
  start: number;
  end: number;
}

export function detectResumeSections(
  rawText: string,
  _offsetMap: OffsetMapping[]
): ResumeSection[] {
  if (!rawText || !rawText.trim()) {
    return [];
  }

  const matches: HeadingMatch[] = [];
  const lines = rawText.split(/\r?\n/);
  let currentOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = currentOffset;
    const lineEnd = currentOffset + line.length;
    currentOffset = lineEnd + 1; // +1 for newline

    const trimmed = line.trim();
    if (!trimmed) continue;

    const normalizedHeading = trimmed.replace(/:$/, '').toUpperCase();
    if (HEADING_MAP[normalizedHeading]) {
      matches.push({
        kind: HEADING_MAP[normalizedHeading],
        headingText: trimmed,
        start: lineStart,
        end: lineEnd,
      });
    }
  }

  const sections: ResumeSection[] = [];

  if (matches.length === 0) {
    const span = {
      coordinateSpace: 'raw' as const,
      start: 0,
      end: rawText.length,
    };
    sections.push({
      id: makeSectionId('unknown', span.start, span.end),
      kind: 'unknown',
      heading: null,
      text: rawText,
      span,
      confidence: 0.5,
      evidence: [
        {
          rule: 'fallback_whole_document',
          span,
          text: rawText.slice(0, 100),
          confidence: 0.5,
        },
      ],
    });
    return sections;
  }

  // Pre-heading preamble section (if present)
  if (matches[0].start > 0) {
    const preText = rawText.slice(0, matches[0].start);
    if (preText.trim()) {
      const span = {
        coordinateSpace: 'raw' as const,
        start: 0,
        end: matches[0].start,
      };
      sections.push({
        id: makeSectionId('contact', span.start, span.end),
        kind: 'contact',
        heading: null,
        text: preText,
        span,
        confidence: 0.8,
        evidence: [
          {
            rule: 'preamble_header_block',
            span,
            text: preText.slice(0, 50),
            confidence: 0.8,
          },
        ],
      });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const nextStart =
      i + 1 < matches.length ? matches[i + 1].start : rawText.length;
    const span = {
      coordinateSpace: 'raw' as const,
      start: match.start,
      end: nextStart,
    };
    const text = rawText.slice(span.start, span.end);

    const headingSpan = {
      coordinateSpace: 'raw' as const,
      start: match.start,
      end: match.end,
    };

    const evidence: ParseEvidence[] = [
      {
        rule: 'heading_keyword_match',
        span: headingSpan,
        text: match.headingText,
        confidence: 0.95,
      },
    ];

    sections.push({
      id: makeSectionId(match.kind, span.start, span.end),
      kind: match.kind,
      heading: match.headingText,
      text,
      span,
      confidence: 0.95,
      evidence,
    });
  }

  return sections;
}

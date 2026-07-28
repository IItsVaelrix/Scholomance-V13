import { OffsetMapping, ParseEvidence, ResumeSection, ResumeSectionKind } from './types';
import { makeSectionId } from './identity-utils';
import { lineHasDate } from './segment-entries';

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

/**
 * Kind inference for a heading the exact map does not know. Ordered — first hit wins, so
 * "TECHNICAL SKILLS & PROJECTS" resolves to skills, not projects.
 */
const HEADING_KIND_HINTS: ReadonlyArray<readonly [RegExp, ResumeSectionKind]> = [
  [/\b(?:EXPERIENCE|EMPLOYMENT|WORK\s+HISTORY|CAREER)\b/, 'experience'],
  [/\b(?:EDUCATION|ACADEMIC|DEGREES?|TRAINING)\b/, 'education'],
  [/\b(?:SKILLS?|COMPETENC\w*|TECHNICAL|TECHNOLOG\w*|PROFICIENC\w*|TOOLS?|READINESS|EXPERTISE)\b/, 'skills'],
  [/\b(?:PROJECTS?|PORTFOLIO)\b/, 'projects'],
  [/\b(?:SUMMARY|PROFILE|OBJECTIVE|ABOUT)\b/, 'summary'],
  [/\b(?:CERTIFICAT\w*|LICENS\w*|CREDENTIALS?)\b/, 'certifications'],
  [/\b(?:AWARDS?|HONORS?|HONOURS?|ACHIEVEMENTS?)\b/, 'awards'],
];

const BULLET_PREFIX = /^(?:[•·▪◦–—*-]|\d+[.)])\s+/;
/** A heading is a label, not a paragraph — beyond this it is prose. */
const MAX_HEADING_LENGTH = 50;
const MAX_HEADING_WORDS = 6;
/** Above this share of all-caps lines the document is caps-STYLED, so caps says nothing. */
const CAPS_DOCUMENT_RATIO = 0.5;

function isAllCaps(text: string): boolean {
  return /[A-Z]/.test(text) && !/[a-z]/.test(text);
}

/** A short date-bearing line ("2019 - 2021") — the shape that follows a role title. */
function isDateOnlyLine(text: string): boolean {
  return lineHasDate(text) && text.length <= 40;
}

/**
 * A section heading the whitelist does not know ("TECHNICAL & REMOTE READINESS").
 *
 * Structural, never semantic: an all-caps label line, short, unpunctuated, carrying no date
 * and not introducing one. Those last two guards are what separate a heading from an
 * all-caps ROLE line ("SENIOR ANALYST - ACME CORP" / "2019 - 2021"), which would otherwise
 * shatter an experience section into one section per job.
 */
function isStructuralHeading(trimmed: string, nextNonEmpty: string | null): boolean {
  if (BULLET_PREFIX.test(trimmed)) return false;
  const t = trimmed.replace(/:$/, '').trim();
  if (!t || t.length > MAX_HEADING_LENGTH) return false;
  if (/[.!?,;]$/.test(t)) return false;
  if (/@|https?:\/\/|www\./i.test(t)) return false;
  if (!isAllCaps(t)) return false;
  if (t.split(/\s+/).length > MAX_HEADING_WORDS) return false;
  if (lineHasDate(t)) return false;
  if (nextNonEmpty && isDateOnlyLine(nextNonEmpty)) return false;
  return true;
}

function inferHeadingKind(heading: string): ResumeSectionKind {
  const upper = heading.toUpperCase();
  for (const [pattern, kind] of HEADING_KIND_HINTS) {
    if (pattern.test(upper)) return kind;
  }
  return 'unknown';
}

interface HeadingMatch {
  kind: ResumeSectionKind;
  headingText: string;
  start: number;
  end: number;
  /** How the line was recognised — carried into section evidence. */
  rule: 'heading_keyword_match' | 'structural_heading_line';
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

  // Index the non-empty lines once: the structural test needs each candidate's successor,
  // and the caps-ratio guard needs the population.
  const nonEmpty: Array<{ index: number; trimmed: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed) nonEmpty.push({ index: i, trimmed });
  }
  const capsLines = nonEmpty.filter((l) => isAllCaps(l.trimmed)).length;
  // A résumé typeset entirely in caps gives the signal no discriminating power, and the
  // FIRST non-empty line is the candidate's name — never a section heading.
  const capsIsMeaningful =
    nonEmpty.length > 0 && capsLines / nonEmpty.length < CAPS_DOCUMENT_RATIO;
  const firstNonEmptyIndex = nonEmpty.length > 0 ? nonEmpty[0].index : -1;

  const successorOf = new Map<number, string>();
  for (let n = 0; n + 1 < nonEmpty.length; n++) {
    successorOf.set(nonEmpty[n].index, nonEmpty[n + 1].trimmed);
  }

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
        rule: 'heading_keyword_match',
      });
      continue;
    }

    // A heading the whitelist has never seen still owns its content. Without this, the line
    // becomes body text of the PREVIOUS section and its items are attributed to that
    // section's employer/school.
    if (
      capsIsMeaningful &&
      i !== firstNonEmptyIndex &&
      isStructuralHeading(trimmed, successorOf.get(i) ?? null)
    ) {
      matches.push({
        kind: inferHeadingKind(normalizedHeading),
        headingText: trimmed,
        start: lineStart,
        end: lineEnd,
        rule: 'structural_heading_line',
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

    // A structurally-recognised heading is a weaker claim than a whitelisted one: the line
    // is certainly a heading, but its KIND was inferred from wording.
    const confidence = match.rule === 'heading_keyword_match' ? 0.95 : 0.75;

    const evidence: ParseEvidence[] = [
      {
        rule: match.rule,
        span: headingSpan,
        text: match.headingText,
        confidence,
      },
    ];

    sections.push({
      id: makeSectionId(match.kind, span.start, span.end),
      kind: match.kind,
      heading: match.headingText,
      text,
      span,
      confidence,
      evidence,
    });
  }

  return sections;
}

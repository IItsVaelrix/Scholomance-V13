import type { ResumeDocument, TextSpan } from '../parser/types.js';
import {
  WEAK_VERBS,
  STRONG_VERBS,
  KNOWN_VERBS,
  OBJECT_CLASS_ORDER,
  OBJECT_CLASS_KEYWORDS,
  MAGNITUDE_RE,
  NUMBER_WORD_RE,
  type ObjectClass,
} from './data/verb-classes.js';

/** Only these sections contain accomplishments worth amplifying. */
const AMPLIFY_SECTION_KINDS: ReadonlySet<string> = new Set([
  'experience',
  'projects',
  'summary',
]);

const BULLET_PREFIX = /^(?:[•·▪◦–—*-]|\d+[.)])\s+/;

export interface AccomplishmentLine {
  /** Trimmed line text; byte-identical to rawText.slice(span.start, span.end). */
  text: string;
  span: TextSpan;
  sectionKind: string;
}

export interface AmplifyContext {
  document: ResumeDocument;
  lines: AccomplishmentLine[];
}

export interface VerbMatch {
  verb: string;
  span: TextSpan;
  /** Index of the verb inside line.text. */
  offsetInLine: number;
}

/**
 * Slice each amplifiable section straight out of rawText (never section.text) so every
 * emitted span is exact — apply-suggestions.ts rejects a suggestion whose `before`
 * does not match rawText at its span.
 */
export function getAccomplishmentLines(doc: ResumeDocument): AccomplishmentLine[] {
  const rawText = doc?.rawText || '';
  const out: AccomplishmentLine[] = [];

  for (const section of doc?.sections || []) {
    if (!AMPLIFY_SECTION_KINDS.has(section.kind)) continue;

    const span = section.span;
    if (!span || span.coordinateSpace !== 'raw') continue;
    const { start, end } = span;
    if (
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      start < 0 ||
      end > rawText.length ||
      start >= end
    ) {
      continue;
    }

    const heading = section.heading ? section.heading.trim() : null;
    let cursor = 0;
    let isFirstLine = true;

    for (const rawLine of rawText.slice(start, end).split('\n')) {
      const lineStart = start + cursor;
      cursor += rawLine.length + 1;

      const text = rawLine.trim();
      const wasFirst = isFirstLine;
      if (text) isFirstLine = false;
      if (!text) continue;
      if (wasFirst && heading && text === heading) continue;

      const leadingWs = rawLine.length - rawLine.trimStart().length;
      out.push({
        text,
        span: {
          coordinateSpace: 'raw',
          start: lineStart + leadingWs,
          end: lineStart + leadingWs + text.length,
        },
        sectionKind: section.kind,
      });
    }
  }

  return out;
}

/** The verb a bullet leads with, or null when the line is not a verb-led accomplishment. */
export function leadingVerb(line: AccomplishmentLine): VerbMatch | null {
  const bullet = BULLET_PREFIX.exec(line.text);
  const offset = bullet ? bullet[0].length : 0;
  const token = /^[A-Za-z]+/.exec(line.text.slice(offset));
  if (!token) return null;

  const word = token[0];
  const lower = word.toLowerCase();
  const isVerb =
    WEAK_VERBS.has(lower) ||
    STRONG_VERBS.has(lower) ||
    KNOWN_VERBS.has(lower) ||
    (lower.length > 4 && /(?:ed|ing)$/.test(lower));
  if (!isVerb) return null;

  return {
    verb: word,
    offsetInLine: offset,
    span: {
      coordinateSpace: 'raw',
      start: line.span.start + offset,
      end: line.span.start + offset + word.length,
    },
  };
}

/**
 * Conservative on purpose: a false positive suppresses a prompt (safe),
 * a false negative prompts for a metric that is already there (noise).
 */
export function isQuantified(text: string): boolean {
  if (/\d/.test(text)) return true;
  if (/[%$#]/.test(text)) return true;
  if (MAGNITUDE_RE.test(text)) return true;
  if (NUMBER_WORD_RE.test(text)) return true;
  return false;
}

function singular(token: string): string {
  return token.endsWith('s') && token.length > 3 ? token.slice(0, -1) : token;
}

/** First curated object-class keyword appearing after `fromOffset` (index into line.text). */
export function classifyObject(
  line: AccomplishmentLine,
  fromOffset: number
): { objectClass: ObjectClass; keyword: string } | null {
  const tokens = line.text.slice(fromOffset).toLowerCase().match(/[a-z][a-z-]*/g) || [];

  for (const token of tokens) {
    const base = singular(token);
    for (const cls of OBJECT_CLASS_ORDER) {
      const keywords = OBJECT_CLASS_KEYWORDS[cls];
      if (keywords.includes(token) || keywords.includes(base)) {
        return { objectClass: cls, keyword: token };
      }
    }
  }

  return null;
}

export function nextTokenAfter(
  line: AccomplishmentLine,
  fromOffset: number
): string | null {
  const match = /[A-Za-z][A-Za-z-]*/.exec(line.text.slice(fromOffset));
  return match ? match[0].toLowerCase() : null;
}

export function capitalizeFirst(word: string): string {
  return word.length === 0 ? word : word[0].toUpperCase() + word.slice(1);
}

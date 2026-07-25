import type { ResumeSection, ResumeBullet, ResumeExperienceEntry, TextSpan } from './types.js';
import { stableHash } from './identity-utils.js';

/**
 * Entry-aware segmentation (entry-aware correction to spec §4.1).
 *
 * The original flat model split a section into one movable bullet per nonblank line, so
 * the reorder rule promoted strong bullets to the top of the WHOLE section — crossing
 * employer boundaries and orphaning titles/dates ("luggage on the wrong carousel"). This
 * module instead recovers the employment-entry structure of an experience section:
 *
 *   ExperienceSection
 *   ├── ExperienceEntry: Vaelrix   { title, date, bullets[] }
 *   ├── ExperienceEntry: iQor      { title, date, bullets[] }
 *   └── ExperienceEntry: GC Services { title, date, bullets[] }
 *
 * Headings, role titles, and date lines are STRUCTURAL — they are never emitted as
 * `ResumeBullet`. A bullet may move only within its own entry (§4.5 move contract).
 *
 * Detection is deterministic and date-anchored (no ML):
 *   - a standalone date line ("2019 - 2021", "Jan 2020 – Present") is short and date-only;
 *   - a title is a non-bullet, non-sentence line that either carries an inline date
 *     ("Role - Company | 2019-2021") or is immediately followed by a date-only line;
 *   - everything else is an accomplishment bullet of the current entry.
 * A section with no detectable headers yields a single headerless entry, so a plain list
 * of bullets still segments exactly as before (one entry == the whole section).
 */

const BULLET_PREFIX = /^(?:[•·▪◦–—*-]|\d+[.)])\s+/;

/** A 4-digit year (1900-2099) not part of a longer number and not a percentage like "2019%". */
const YEAR_RE = /\b(?:19|20)\d{2}\b/g;
const MONTH_RE = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\b/i;
const PRESENT_RE = /\b(?:present|current|now)\b/i;
/** A date range/endpoint: "2019 - 2021", "Jan 2020 – Present", "2018 to 2020". */
const DATE_RANGE_RE =
  /(?:\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(?:19|20)\d{2}\b(?:\s*[-–—]|(?:\s+to\s+)|\s*\/\s*)?(?:(?:19|20)\d{2}\b|(?:present|current|now)\b)?/i;

/** Common leading accomplishment verbs — a title is a noun phrase, not a verb-led sentence.
 *  Self-contained (no amplify import) so the parser layer stays dependency-free. */
const LEADING_VERBS: ReadonlySet<string> = new Set([
  'led', 'managed', 'built', 'developed', 'created', 'designed', 'increased', 'reduced',
  'improved', 'wrote', 'ran', 'oversaw', 'delivered', 'launched', 'automated', 'streamlined',
  'drove', 'spearheaded', 'assisted', 'supported', 'coordinated', 'trained', 'implemented',
  'maintained', 'handled', 'owned', 'engineered', 'authored', 'resolved', 'negotiated',
  'migrated', 'saved', 'grew', 'cut', 'organized', 'filed', 'achieved', 'boosted', 'served',
  'performed', 'established', 'directed', 'headed', 'produced', 'analyzed', 'optimized',
]);

/** Role/company separators that mark a title line ("Role - Company", "Role | Company"). */
const TITLE_SEPARATOR_RE = /\s[-–—|·@]\s|\s\bat\b\s|,\s/;

interface LineRec {
  index: number;
  rawLine: string;
  trimmed: string;
  /** Offset of the trimmed line start within section.text. */
  lineStartInText: number;
  leadingWs: number;
  hasBullet: boolean;
  hasDate: boolean;
  dateOnly: boolean;
}

function hasBulletMarker(trimmed: string): boolean {
  return BULLET_PREFIX.test(trimmed);
}

/** True when the line carries a date token (a year, or month+year, or "Present" with a year). */
export function lineHasDate(text: string): boolean {
  const t = String(text ?? '');
  // A bare year, excluding percentages ("2019%") and longer digit runs.
  YEAR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = YEAR_RE.exec(t)) !== null) {
    const after = t[m.index + m[0].length];
    if (after !== '%') return true;
  }
  if (MONTH_RE.test(t) && YEAR_RE.test(t)) return true;
  if (PRESENT_RE.test(t) && /\b(?:19|20)\d{2}\b/.test(t)) return true;
  return false;
}

/** A standalone date line: short and date-bearing ("2019 - 2021", "Jan 2020 – Present"). */
function isDateOnlyLine(rec: LineRec): boolean {
  return rec.hasDate && rec.trimmed.length <= 40;
}

function firstWord(trimmed: string): string {
  const m = /^[A-Za-z]+/.exec(trimmed);
  return m ? m[0].toLowerCase() : '';
}

/** A non-bullet, non-sentence line that could be a role/company title. */
function isTitleCandidate(rec: LineRec): boolean {
  if (rec.hasBullet) return false;
  if (rec.dateOnly) return false;
  const t = rec.trimmed;
  if (!t || t.length > 70) return false;
  if (/[.!?]$/.test(t)) return false; // a sentence is an achievement, not a title
  // A title either has a role/company separator OR is not verb-led (a noun phrase).
  const sep = TITLE_SEPARATOR_RE.test(t);
  const verbLed = LEADING_VERBS.has(firstWord(t));
  return sep || !verbLed;
}

/** An inline-date title: "Role - Company | 2019-2021" — date-bearing and header-ish. */
function isInlineDateTitle(rec: LineRec): boolean {
  if (rec.hasBullet || !rec.hasDate || rec.dateOnly) return false;
  const t = rec.trimmed;
  if (/[.!?]$/.test(t)) return false;
  // Header-ish: has a separator, or is short. A long verb-led sentence with a year is an
  // achievement ("Increased sales 2019-2021 by 50%"), not a title.
  return TITLE_SEPARATOR_RE.test(t) || t.length <= 60;
}

function makeSpan(coordinateSpace: TextSpan['coordinateSpace'], base: number, start: number, end: number): TextSpan {
  return { coordinateSpace, start: base + start, end: base + end };
}

/** Split an inline-date title into { title, date } raw texts (date stripped from the title). */
function splitInlineDate(trimmed: string): { titleText: string; dateText: string; dateStart: number } {
  const m = DATE_RANGE_RE.exec(trimmed);
  if (!m) return { titleText: trimmed, dateText: '', dateStart: -1 };
  const dateText = m[0].trim();
  const dateStart = m.index;
  let titleText: string;
  if (m.index === 0) {
    // Date leads: "2019-2021 Role" — title is the remainder.
    titleText = trimmed.slice(m.index + m[0].length);
  } else {
    titleText = trimmed.slice(0, m.index);
  }
  // Strip trailing/leading separators and whitespace from the title.
  titleText = titleText.replace(/[\s,|·@-]+$/, '').replace(/^[\s,|·@-]+/, '').trim();
  return { titleText, dateText, dateStart };
}

export function makeEntryId(sectionId: string, ordinal: number, titleText: string): string {
  return `entry:${sectionId}:${ordinal}:${stableHash(titleText || `headerless:${ordinal}`)}`;
}

/** Build the stable bullet id (shared format with segment-bullets). */
function makeBulletId(sectionId: string, ordinal: number, rawText: string): string {
  return `bullet:${sectionId}:${ordinal}:${stableHash(rawText)}`;
}

function classifyLines(section: ResumeSection): LineRec[] {
  const recs: LineRec[] = [];
  if (!section || typeof section.text !== 'string' || !section.text) return recs;
  const heading = section.heading ? section.heading.trim() : null;

  let cursor = 0;
  let sawNonEmpty = false;
  let index = 0;
  for (const rawLine of section.text.split('\n')) {
    const lineStartInText = cursor;
    cursor += rawLine.length + 1;
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    // Skip the section heading line.
    if (!sawNonEmpty && heading && trimmed === heading) {
      sawNonEmpty = true;
      continue;
    }
    sawNonEmpty = true;
    const leadingWs = rawLine.length - rawLine.trimStart().length;
    const hasDate = lineHasDate(trimmed);
    const rec: LineRec = {
      index,
      rawLine,
      trimmed,
      lineStartInText,
      leadingWs,
      hasBullet: hasBulletMarker(trimmed),
      hasDate,
      dateOnly: false,
    };
    rec.dateOnly = isDateOnlyLine(rec);
    recs.push(rec);
    index += 1;
  }
  return recs;
}

/**
 * Segment a section into employment entries. Works for any section kind; non-experience
 * sections (or a headerless experience section) yield a single headerless entry whose
 * bullets are every non-structural line — preserving prior flat behavior for those.
 */
export function segmentEntries(section: ResumeSection): ResumeExperienceEntry[] {
  const entries: ResumeExperienceEntry[] = [];
  if (!section) return entries;

  const base = section.span && typeof section.span.start === 'number' ? section.span.start : 0;
  const coordinateSpace = section.span?.coordinateSpace ?? 'raw';
  const recs = classifyLines(section);
  if (recs.length === 0) return entries;

  let ordinal = 0;
  let bulletOrdinal = 0;
  let current: ResumeExperienceEntry | null = null;

  const ensureHeaderless = (): ResumeExperienceEntry => {
    if (!current) {
      current = {
        id: makeEntryId(section.id, ordinal, `headerless:${section.id}`),
        sectionId: section.id,
        bullets: [],
      };
      ordinal += 1;
      entries.push(current);
    }
    return current;
  };

  const pushBullet = (rec: LineRec, entry: ResumeExperienceEntry) => {
    const marker = BULLET_PREFIX.exec(rec.trimmed);
    const markerLength = marker ? marker[0].length : 0;
    const content = marker ? rec.trimmed.slice(markerLength).trim() : rec.trimmed;
    if (!content) return;
    const contentStartInText = rec.lineStartInText + rec.leadingWs + markerLength;
    entry.bullets.push({
      id: makeBulletId(section.id, bulletOrdinal, content),
      sectionId: section.id,
      entryId: entry.id,
      rawText: content,
      sourceSpan: makeSpan(coordinateSpace, base, contentStartInText, contentStartInText + content.length),
    });
    bulletOrdinal += 1;
  };

  let i = 0;
  while (i < recs.length) {
    const rec = recs[i];

    // A bullet always belongs to the current entry (creating a headerless one if needed).
    if (rec.hasBullet) {
      pushBullet(rec, ensureHeaderless());
      i += 1;
      continue;
    }

    // A standalone date-only line: attach as the current entry's date (if it has a title
    // and no date yet), else start a date-only entry.
    if (rec.dateOnly) {
      if (current && current.title && !current.date && current.bullets.length === 0) {
        current.date = {
          rawText: rec.trimmed,
          sourceSpan: makeSpan(coordinateSpace, base, rec.lineStartInText + rec.leadingWs, rec.lineStartInText + rec.leadingWs + rec.trimmed.length),
        };
      } else {
        current = {
          id: makeEntryId(section.id, ordinal, `date:${rec.trimmed}`),
          sectionId: section.id,
          date: {
            rawText: rec.trimmed,
            sourceSpan: makeSpan(coordinateSpace, base, rec.lineStartInText + rec.leadingWs, rec.lineStartInText + rec.leadingWs + rec.trimmed.length),
          },
          bullets: [],
        };
        ordinal += 1;
        entries.push(current);
      }
      i += 1;
      continue;
    }

    // Title-then-date: a title candidate immediately followed by a date-only line.
    const next = recs[i + 1];
    if (isTitleCandidate(rec) && next && next.dateOnly) {
      current = {
        id: makeEntryId(section.id, ordinal, rec.trimmed),
        sectionId: section.id,
        title: {
          rawText: rec.trimmed,
          sourceSpan: makeSpan(coordinateSpace, base, rec.lineStartInText + rec.leadingWs, rec.lineStartInText + rec.leadingWs + rec.trimmed.length),
        },
        date: {
          rawText: next.trimmed,
          sourceSpan: makeSpan(coordinateSpace, base, next.lineStartInText + next.leadingWs, next.lineStartInText + next.leadingWs + next.trimmed.length),
        },
        bullets: [],
      };
      ordinal += 1;
      entries.push(current);
      i += 2; // consume title + date
      continue;
    }

    // Inline-date title: "Role - Company | 2019-2021".
    if (isInlineDateTitle(rec)) {
      const { titleText, dateText, dateStart } = splitInlineDate(rec.trimmed);
      const titleSpanStart = rec.lineStartInText + rec.leadingWs;
      current = {
        id: makeEntryId(section.id, ordinal, titleText || rec.trimmed),
        sectionId: section.id,
        title: titleText
          ? { rawText: titleText, sourceSpan: makeSpan(coordinateSpace, base, titleSpanStart, titleSpanStart + rec.trimmed.length) }
          : undefined,
        date: dateText
          ? { rawText: dateText, sourceSpan: makeSpan(coordinateSpace, base, titleSpanStart + Math.max(dateStart, 0), titleSpanStart + rec.trimmed.length) }
          : undefined,
        bullets: [],
      };
      ordinal += 1;
      entries.push(current);
      i += 1;
      continue;
    }

    // Otherwise: a non-marked achievement line — a bullet of the current entry.
    pushBullet(rec, ensureHeaderless());
    i += 1;
  }

  return entries;
}

/** All bullets across a section's entries, in document order (each tagged with entryId). */
export function segmentEntryBullets(section: ResumeSection): ResumeBullet[] {
  const out: ResumeBullet[] = [];
  for (const entry of segmentEntries(section)) {
    out.push(...entry.bullets);
  }
  return out;
}

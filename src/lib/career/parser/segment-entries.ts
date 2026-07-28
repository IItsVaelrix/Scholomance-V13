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
/**
 * A date range/endpoint: "2019 - 2021", "Jan 2020 – Present", "2018 to 2020".
 *
 * The dash alternative consumes the whitespace on BOTH sides. Without the trailing `\s*` the
 * separator matched " -" and left " 2024" unconsumed, so the optional end-year group could
 * not reach it and the range truncated to "2022 -" — a mangled date shipped into the export.
 */
const DATE_RANGE_RE =
  /(?:\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(?:19|20)\d{2}\b(?:\s*[-–—]\s*|(?:\s+to\s+)|\s*\/\s*)?(?:(?:19|20)\d{2}\b|(?:present|current|now)\b)?/i;

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

/**
 * The separators trusted to mark a title when there is NO date to corroborate it. The comma
 * is deliberately excluded: with a date present "Analyst, Acme | 2019-2021" is plainly a
 * header, but dateless a comma is just a list ("Salesforce, Zendesk, Excel").
 */
const DATELESS_TITLE_SEPARATOR_RE = /\s[-–—|·@]\s|\s\bat\b\s/;

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
  // A verb-led line is an achievement whatever else it looks like — "Trained new hires -
  // including the 2021 cohort" carries both a separator and a year, and the length test
  // alone let short ones through ("Increased sales 2019-2021 by 50%"). A title is a noun
  // phrase; the accomplishment verb is the discriminator, not the punctuation.
  if (LEADING_VERBS.has(firstWord(t))) return false;
  // Header-ish: has a separator, or is short.
  return TITLE_SEPARATOR_RE.test(t) || t.length <= 60;
}

/**
 * Header material: a short, capitalised noun phrase that could be a role or company line.
 *
 * This is the shape test ONLY — it says "this line is not an achievement", not "this line
 * is a title". Position decides the latter (see `isDatelessTitle` and the section-opening
 * rule), because in the middle of an entry the same shape is a legitimate unmarked bullet.
 */
function isHeaderMaterial(rec: LineRec): boolean {
  if (rec.hasBullet || rec.hasDate || rec.dateOnly) return false;
  const t = rec.trimmed;
  if (!t || t.length > 70) return false;
  if (/[.!?]$/.test(t)) return false;
  if (!/^[A-Z]/.test(t)) return false;
  return !LEADING_VERBS.has(firstWord(t));
}

/**
 * A role title carrying no date at all — "Founder & Systems Architect - Vaelrix".
 *
 * Current roles, self-employment, and freelance entries routinely omit the date line, and
 * the date-anchored tests above then fall through to `pushBullet`: the role renders as a
 * bullet while its dated siblings render as bold titles. This path restores it, on a
 * deliberately narrow signal — an explicit role/company separator on an unpunctuated,
 * capitalised noun phrase — and only inside a section whose lines are ROLES to begin with
 * (see `allowsDatelessTitles`). A skills or education list never reaches it.
 */
function isDatelessTitle(rec: LineRec): boolean {
  if (!isHeaderMaterial(rec)) return false;
  return DATELESS_TITLE_SEPARATOR_RE.test(rec.trimmed);
}

/**
 * Function words that mark a line as a CLAUSE rather than a noun phrase.
 *
 * This is what `LEADING_VERBS` was approximating and could not reach: that list has to know
 * every accomplishment verb in English, and it does not ("partnered", "queried"). A title is
 * a noun phrase — "Social Media Manager / Sales", "Customer Service Representative" — and an
 * achievement is a clause — "Queried the database for ad-hoc analysis". Articles,
 * infinitival "to", and clause prepositions appear in the second and never in the first, so
 * the closed function-word set does the work the open verb set cannot.
 *
 * "of", "and", and "&" are deliberately EXCLUDED: "Director of Engineering", "Head of
 * Customer Success", and "Sales and Marketing Manager" are ordinary job titles.
 */
const CLAUSE_MARKERS: ReadonlySet<string> = new Set([
  'the', 'a', 'an', 'to', 'for', 'with', 'from', 'by', 'on', 'at', 'into', 'onto',
  'that', 'which', 'per', 'using', 'across', 'through', 'during', 'while', 'when',
]);

/** A noun phrase — no articles, no infinitival "to", no clause prepositions. */
function isNounPhrase(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length === 0 || words.length > MAX_TITLE_WORDS) return false;
  return !words.some((w) => CLAUSE_MARKERS.has(w));
}

/** Beyond this a line is prose, not a role heading. */
const MAX_TITLE_WORDS = 6;

/**
 * The FIRST content line of an experience section is a role heading.
 *
 * The separator test above is a proxy, and it only recognises the separators it lists: a
 * dateless role written "Social Media Manager / Sales" (slash) or "Social Media Manager"
 * (no separator at all) falls straight through to `pushBullet` and renders as a bullet
 * while its dated siblings render as bold headings. Position is the stronger signal and
 * needs no separator vocabulary: an experience section cannot OPEN with an achievement,
 * because there would be no employer for it to belong to.
 *
 * Position alone is not enough, though — it would eat the only line of a one-line section.
 * A heading is a noun phrase AND has something underneath it; an entry with no date and no
 * achievements is not an entry.
 */
function isSectionOpeningTitle(
  rec: LineRec,
  isFirstContentLine: boolean,
  hasFollowingContent: boolean
): boolean {
  if (!isFirstContentLine || !hasFollowingContent) return false;
  return isHeaderMaterial(rec) && isNounPhrase(rec.trimmed);
}

/** Only sections whose content is employment entries may promote a dateless title. */
function allowsDatelessTitles(section: ResumeSection): boolean {
  return section.kind === 'experience' || section.kind === 'projects';
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
      // A header block written across lines — "Social Media Manager / Sales" then "Vaelrix"
      // then "2022 - 2024" — is ONE job. Without this merge the second line opens a second
      // entry and the role line is stranded above it as a bullet, splitting one employer
      // into two. An entry that already has a title but no date and no bullets yet is still
      // inside its own header, so this line continues it rather than starting the next one.
      if (current?.title && !current.date && current.bullets.length === 0) {
        const titleStart = current.title.sourceSpan.start;
        const lineEnd = base + rec.lineStartInText + rec.leadingWs + rec.trimmed.length;
        current.title = {
          rawText: `${current.title.rawText} — ${rec.trimmed}`,
          sourceSpan: { coordinateSpace, start: titleStart, end: lineEnd },
          kind: 'role_heading',
        };
        current.date = {
          rawText: next.trimmed,
          sourceSpan: makeSpan(coordinateSpace, base, next.lineStartInText + next.leadingWs, next.lineStartInText + next.leadingWs + next.trimmed.length),
        };
        i += 2; // consume the continued header line + its date
        continue;
      }

      current = {
        id: makeEntryId(section.id, ordinal, rec.trimmed),
        sectionId: section.id,
        title: {
          rawText: rec.trimmed,
          sourceSpan: makeSpan(coordinateSpace, base, rec.lineStartInText + rec.leadingWs, rec.lineStartInText + rec.leadingWs + rec.trimmed.length),
          kind: 'role_heading',
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
          ? {
              rawText: titleText,
              sourceSpan: makeSpan(coordinateSpace, base, titleSpanStart, titleSpanStart + rec.trimmed.length),
              kind: 'role_heading' as const,
            }
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

    // A dateless role title starts its own entry, so its achievements stay under it. The
    // section's OPENING line qualifies on position alone — no separator vocabulary needed.
    if (
      allowsDatelessTitles(section) &&
      (isDatelessTitle(rec) || isSectionOpeningTitle(rec, i === 0, i + 1 < recs.length))
    ) {
      const titleSpanStart = rec.lineStartInText + rec.leadingWs;
      current = {
        id: makeEntryId(section.id, ordinal, rec.trimmed),
        sectionId: section.id,
        title: {
          rawText: rec.trimmed,
          sourceSpan: makeSpan(coordinateSpace, base, titleSpanStart, titleSpanStart + rec.trimmed.length),
          kind: 'role_heading',
        },
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

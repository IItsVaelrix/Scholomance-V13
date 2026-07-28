/**
 * ATS-safe, recruiter-polished DOCX export (spec §4.7), made entry-aware.
 *
 * `buildDocxExport(doc, meta)` renders the (improved, structured) résumé through ONE
 * ATS-safe template using the `docx` library (client-side, pure JS): single column,
 * consistent section headings, real indented bullet lists — NO `<w:tbl>`, no text boxes,
 * no headers/footers. fileName = `resume_<TargetRole|export>.docx`.
 *
 * Recruiter-polish correction: the prior export rendered every line with near-identical
 * formatting (dense page 1, no visible bullets, titles/dates/achievements all alike, and
 * headings styled inconsistently). Now:
 *   - EVERY major section heading shares one consistent style (bold, sized, spaced, with a
 *     uniform bottom rule) — "TECHNICAL & REMOTE READINESS" matches "EXPERIENCE" exactly;
 *   - experience sections are rendered entry-by-entry: role title (bold) + date (italic) +
 *     achievements (real bullet glyphs with hanging indentation), giving fast human
 *     scanning hierarchy;
 *   - bullets use an explicit numbering definition so the glyph and indent always render.
 * The document stays machine-safe: single column, no tables, no text boxes, no headers/
 * footers — paragraph borders and numbering are ATS-neutral.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  LevelFormat,
  BorderStyle,
} from 'docx';
import type { ResumeDocument, ResumeSection } from '../parser/types.js';
import { segmentEntries } from '../parser/segment-entries.js';

const BULLET_PREFIX = /^(?:[•·▪◦–—*-]|\d+[.)])\s+/;
const BULLET_NUMBERING_REF = 'resume-bullets';

export interface DocxExportMeta {
  targetRole?: string;
}

export interface DocxExportResult {
  blob: Blob;
  fileName: string;
}

function sanitizeRole(role: string | undefined): string {
  const cleaned = (role ?? '').trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'export';
}

/**
 * One consistent style for EVERY major section heading (uniform hierarchy).
 *
 * `keepNext` binds it to the first line beneath it: a heading is never the last thing on a
 * page with its section starting on the next one.
 */
function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 80 },
    keepNext: true,
    keepLines: true,
    border: {
      bottom: { color: '444444', space: 2, style: BorderStyle.SINGLE, size: 6 },
    },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 26 })],
  });
}

/** A real bullet paragraph: explicit numbering ref → visible glyph + hanging indent. */
function bulletParagraph(text: string, keepNext = false): Paragraph {
  return new Paragraph({
    numbering: { reference: BULLET_NUMBERING_REF, level: 0 },
    spacing: { after: 40 },
    // A bullet never breaks mid-way down a page; `keepNext` additionally holds the FIRST
    // bullet of an entry to the second, so a role can never open with a lone orphan line.
    keepLines: true,
    ...(keepNext ? { keepNext: true } : {}),
    children: [new TextRun({ text, size: 21 })],
  });
}

/**
 * Render one experience entry: bold title, italic date, then its achievement bullets.
 *
 * Pagination law for a role entry: the title, its date, and its first achievement are ONE
 * indivisible block. Word honours that with `keepNext` on the title and date (bind to the
 * paragraph below) plus `keepLines` (never split the paragraph itself). Without it the
 * title lands alone at the foot of a page and the date + bullets open the next one, which
 * reads to a recruiter as an entry with no role attached.
 */
function renderExperienceEntry(entry: ReturnType<typeof segmentEntries>[number]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const hasFollowingContent = Boolean(entry.date) || entry.bullets.length > 0;

  // Route on the parser's classification, never re-derive it here. A role heading is the
  // one thing this branch may draw in title position; anything else reaching `entry.title`
  // is a parser fault, and drawing it as ordinary text would hide that fault behind a
  // plausible-looking résumé line.
  if (entry.title && entry.title.kind === 'role_heading') {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 140, after: 0 },
        keepNext: hasFollowingContent,
        keepLines: true,
        children: [new TextRun({ text: entry.title.rawText, bold: true, size: 22 })],
      })
    );
  }
  if (entry.date) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 0, after: 40 },
        keepNext: entry.bullets.length > 0,
        keepLines: true,
        children: [new TextRun({ text: entry.date.rawText, italics: true, size: 20, color: '555555' })],
      })
    );
  }
  entry.bullets.forEach((bullet, index) => {
    // Bind the first bullet to the second so the block the title is held to is a real
    // achievement, not a single stranded line.
    paragraphs.push(bulletParagraph(bullet.rawText, index === 0 && entry.bullets.length > 1));
  });
  // A headerless entry with no title/date still renders its bullets (plain list).
  return paragraphs;
}

/** Render a non-experience section: a consistent heading + bullet/normal paragraphs. */
function renderGenericSection(section: ResumeSection): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const heading = section.heading ? section.heading.trim() : null;
  if (heading) paragraphs.push(sectionHeading(heading));

  const lines = (section.text ?? '').split(/\r?\n/);
  let sawNonEmpty = false;
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (!sawNonEmpty && heading && trimmed === heading) {
      sawNonEmpty = true;
      continue;
    }
    sawNonEmpty = true;
    const marker = BULLET_PREFIX.exec(trimmed);
    const content = marker ? trimmed.slice(marker[0].length).trim() : trimmed;
    if (!content) continue;
    if (marker) paragraphs.push(bulletParagraph(content));
    else
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { after: 40 },
          keepLines: true,
          children: [new TextRun({ text: content, size: 21 })],
        })
      );
  }
  return paragraphs;
}

/** Render one section: experience sections entry-aware; everything else generic. */
function renderSection(section: ResumeSection): Paragraph[] {
  if (section.kind === 'experience' || section.kind === 'projects') {
    const entries = segmentEntries(section);
    if (entries.length > 0) {
      const paragraphs: Paragraph[] = [];
      const heading = section.heading ? section.heading.trim() : null;
      if (heading) paragraphs.push(sectionHeading(heading));
      for (const entry of entries) paragraphs.push(...renderExperienceEntry(entry));
      return paragraphs;
    }
  }
  return renderGenericSection(section);
}

export async function buildDocxExport(
  doc: ResumeDocument,
  meta: DocxExportMeta = {}
): Promise<DocxExportResult> {
  const children: Paragraph[] = [];

  // Optional name line from contact, rendered as a title when present.
  const name = doc?.contact?.name;
  if (name) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: name, bold: true, size: 32 })],
      })
    );
  }

  for (const section of doc?.sections || []) {
    children.push(...renderSection(section));
  }

  const document = new Document({
    creator: 'Scholomance Career Scribe',
    title: `Resume ${meta.targetRole ?? ''}`.trim(),
    numbering: {
      config: [
        {
          reference: BULLET_NUMBERING_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 360, hanging: 200 } },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(document);
  const fileName = `resume_${sanitizeRole(meta.targetRole)}.docx`;
  return { blob, fileName };
}

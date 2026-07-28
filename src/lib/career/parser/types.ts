export type ResumeSourceType = 'pdf' | 'docx' | 'txt' | 'paste';

export interface ResumeSourceMetadata {
  type: ResumeSourceType;
  fileName?: string;
  fileSize?: number;
  pageCount?: number;
}

export interface TextSpan {
  coordinateSpace: 'raw' | 'canonical';
  start: number;
  end: number;
  page?: number;
  line?: number;
  blockId?: string;
}

export interface OffsetMapping {
  canonicalStart: number;
  canonicalEnd: number;
  rawStart: number;
  rawEnd: number;
}

export interface ExtractedTextBlock {
  id: string;
  text: string;
  page?: number;
  sourceOrder: number;
  bbox?: { x: number; y: number; width: number; height: number };
  style?: { fontSize?: number; bold?: boolean; italic?: boolean };
  container?: {
    kind: 'paragraph' | 'table_cell' | 'header' | 'footer' | 'unknown';
    tableId?: string;
    row?: number;
    column?: number;
  };
}

export type ParseDiagnosticCode =
  | 'EMPTY_DOCUMENT'
  | 'IMAGE_ONLY_PDF'
  | 'READING_ORDER_UNCERTAIN'
  | 'MULTI_COLUMN_LAYOUT'
  | 'TABLE_LAYOUT'
  | 'UNKNOWN_SECTION'
  | 'DATE_PAIRING_AMBIGUOUS'
  | 'CONTACT_FIELD_AMBIGUOUS'
  | 'UNSUPPORTED_FILE';

export interface ParseDiagnostic {
  code: ParseDiagnosticCode;
  message: string;
  severity: 'info' | 'warning' | 'error';
  span?: TextSpan;
}

export interface ExtractedDocument {
  source: ResumeSourceMetadata;
  blocks: ExtractedTextBlock[];
  diagnostics: ParseDiagnostic[];
}

export type ResumeSectionKind =
  | 'contact'
  | 'summary'
  | 'skills'
  | 'experience'
  | 'projects'
  | 'education'
  | 'certifications'
  | 'awards'
  | 'unknown';

export interface ParseEvidence {
  rule: string;
  span: TextSpan;
  text: string;
  confidence: number;
}

export interface ResumeSection {
  id: string;
  kind: ResumeSectionKind;
  heading: string | null;
  text: string;
  span: TextSpan;
  confidence: number;
  evidence: ParseEvidence[];
}

/**
 * A first-class résumé bullet (JD Improvement Advisor prerequisite — spec §4.1).
 *
 * `id` is the stable identity that controls movement (reorder rules key on it);
 * `sourceSpan` is provenance only — it validates staleness (the apply guard compares
 * `before` against rawText at this span) but never controls placement. This separation
 * is what lets an accepted rewrite and a later reorder coexist without one invalidating
 * the other.
 */
export interface ResumeBullet {
  /** Stable identity — `bullet:<sectionId>:<ordinal>:<contentHash>`. Controls movement. */
  id: string;
  sectionId: string;
  /**
   * The employment entry this bullet belongs to (spec §4.1 entry-aware correction). A
   * bullet may move ONLY within its own entry — `reorder` and `apply-moves` enforce
   * `sourceBullet.entryId === targetBullet.entryId`, so achievements can never cross an
   * employer boundary. Title/date lines are NOT bullets and therefore carry no bullet id.
   */
  entryId: string;
  /** Bullet content text, bullet marker stripped, byte-identical to rawText.slice(sourceSpan). */
  rawText: string;
  /** Provenance span in raw coordinate space. Validates staleness, never controls movement. */
  sourceSpan: TextSpan;
}

/**
 * A first-class employment entry inside an experience section (entry-aware correction).
 *
 * The flat bullet model treated every nonblank line as a movable bullet, so the reorder
 * rule promoted strong bullets to the top of the WHOLE section — crossing employer
 * boundaries and leaving titles/dates behind "like luggage on the wrong carousel". An
 * entry groups a role title, its optional date line, and ONLY its own bullets. Headings,
 * role titles, and date lines are structural — they are never emitted as `ResumeBullet`.
 */
export interface ResumeExperienceEntry {
  /** Stable identity — `entry:<sectionId>:<ordinal>:<titleHash>`. */
  id: string;
  sectionId: string;
  /**
   * Role/company title line (date stripped when it was inline). Absent for a headerless entry.
   *
   * `kind` is the structural invariant: a title is a ROLE HEADING, never an achievement. It
   * exists so the export routes on the parser's classification rather than re-deriving it —
   * a title that reaches the renderer without this tag is not drawn as body text, it is not
   * drawn at all. Every entry that has a title has `title.kind === 'role_heading'`.
   */
  title?: { rawText: string; sourceSpan: TextSpan; kind: 'role_heading' };
  /** Date or date range line (e.g. "2019 - 2021", "Jan 2020 – Present"). */
  date?: { rawText: string; sourceSpan: TextSpan };
  /** The entry's accomplishment bullets, in document order. */
  bullets: ResumeBullet[];
}

export interface ResumeContact {
  name?: string;
  email?: string;
  phone?: string;
  links: string[];
}

export interface ResumeDocument {
  schemaVersion: 1;
  source: ResumeSourceMetadata;
  rawText: string;
  normalizedText: string;
  offsetMap: OffsetMapping[];
  sections: ResumeSection[];
  contact: ResumeContact;
  diagnostics: ParseDiagnostic[];
  confidence: number;
}

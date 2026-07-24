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

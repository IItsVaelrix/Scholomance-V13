import { z } from 'zod';

export const ResumeSourceTypeSchema = z.enum(['pdf', 'docx', 'txt', 'paste']);

export const ResumeSourceMetadataSchema = z.object({
  type: ResumeSourceTypeSchema,
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  pageCount: z.number().optional(),
});

export const TextSpanSchema = z.object({
  coordinateSpace: z.enum(['raw', 'canonical']),
  start: z.number(),
  end: z.number(),
  page: z.number().optional(),
  line: z.number().optional(),
  blockId: z.string().optional(),
});

export const OffsetMappingSchema = z.object({
  canonicalStart: z.number(),
  canonicalEnd: z.number(),
  rawStart: z.number(),
  rawEnd: z.number(),
});

export const ExtractedTextBlockSchema = z.object({
  id: z.string(),
  text: z.string(),
  page: z.number().optional(),
  sourceOrder: z.number(),
  bbox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  style: z
    .object({
      fontSize: z.number().optional(),
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
    })
    .optional(),
  container: z
    .object({
      kind: z.enum(['paragraph', 'table_cell', 'header', 'footer', 'unknown']),
      tableId: z.string().optional(),
      row: z.number().optional(),
      column: z.number().optional(),
    })
    .optional(),
});

export const ParseDiagnosticCodeSchema = z.enum([
  'EMPTY_DOCUMENT',
  'IMAGE_ONLY_PDF',
  'READING_ORDER_UNCERTAIN',
  'MULTI_COLUMN_LAYOUT',
  'TABLE_LAYOUT',
  'UNKNOWN_SECTION',
  'DATE_PAIRING_AMBIGUOUS',
  'CONTACT_FIELD_AMBIGUOUS',
  'UNSUPPORTED_FILE',
]);

export const ParseDiagnosticSchema = z.object({
  code: ParseDiagnosticCodeSchema,
  message: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
  span: TextSpanSchema.optional(),
});

export const ExtractedDocumentSchema = z.object({
  source: ResumeSourceMetadataSchema,
  blocks: z.array(ExtractedTextBlockSchema),
  diagnostics: z.array(ParseDiagnosticSchema),
});

export const ResumeSectionKindSchema = z.enum([
  'contact',
  'summary',
  'skills',
  'experience',
  'projects',
  'education',
  'certifications',
  'awards',
  'unknown',
]);

export const ParseEvidenceSchema = z.object({
  rule: z.string(),
  span: TextSpanSchema,
  text: z.string(),
  confidence: z.number(),
});

export const ResumeSectionSchema = z.object({
  id: z.string(),
  kind: ResumeSectionKindSchema,
  heading: z.string().nullable(),
  text: z.string(),
  span: TextSpanSchema,
  confidence: z.number(),
  evidence: z.array(ParseEvidenceSchema),
});

export const ResumeContactSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  links: z.array(z.string()),
});

export const ResumeDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  source: ResumeSourceMetadataSchema,
  rawText: z.string(),
  normalizedText: z.string(),
  offsetMap: z.array(OffsetMappingSchema),
  sections: z.array(ResumeSectionSchema),
  contact: ResumeContactSchema,
  diagnostics: z.array(ParseDiagnosticSchema),
  confidence: z.number(),
});

export const AtsScorecardSchema = z
  .object({
    parseQuality: z.number().nullable(),
    sectionCoverage: z.number(),
    literalKeywordCoverage: z.number(),
    canonicalSkillCoverage: z.number(),
    legibility: z.number(),
    formattingRisk: z.enum(['low', 'medium', 'high']),
    composite: z
      .object({
        score: z.number(),
        formulaVersion: z.string(),
        calibrated: z.boolean(),
      })
      .optional(),
  })
  .strict();

export const AnalysisEvidenceSchema = z.object({
  source: z.enum(['resume', 'job_description', 'parser', 'analysis']),
  rule: z.string(),
  text: z.string().optional(),
  span: TextSpanSchema.optional(),
  confidence: z.number(),
});

export const SuggestionInputSlotSchema = z.object({
  id: z.string(),
  placeholder: z.string(),
  hint: z.string(),
});

export const ResumeSuggestionSchema = z.object({
  id: z.string(),
  type: z.enum([
    'verb',
    'keyword',
    'acronym',
    'format',
    'structure',
    'quantify',
    'tighten',
  ]),
  target: z
    .object({
      span: TextSpanSchema.optional(),
      sectionId: z.string().optional(),
      insertionPoint: z
        .enum(['before_section', 'after_section', 'document_end'])
        .optional(),
    })
    .optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  reason: z.string(),
  evidence: z.array(AnalysisEvidenceSchema),
  confidence: z.number(),
  risk: z.enum(['low', 'medium', 'high']),
  requiresUserApproval: z.literal(true),
  status: z.enum(['pending', 'accepted', 'rejected', 'edited']),
  requiresInput: z.boolean().optional(),
  inputSlots: z.array(SuggestionInputSlotSchema).optional(),
});

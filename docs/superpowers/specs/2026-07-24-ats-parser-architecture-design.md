# ATS Document-Ingestion and Structural-Parsing Architecture Specification

**Date**: 2026-07-24  
**Status**: Approved & Refined (V2)  
**Topic**: Transitioning Career Ignition Chamber from a text analyzer/rewriter to a true structured ATS Parser & Analysis Engine  

---

## 1. Overview & Core Philosophy

The ATS system is evolving from a plain-text analyzer and automatic rewriter into a **structural ATS parser and diagnostic analysis platform**. 

### Key Architectural Principles
1. **Document Boundary**: Introduce a first-class `ResumeDocument` contract representing parsed sections, field extraction, reading order, and evidence-bearing spans.
2. **Intermediate Layout Extraction**: Separate raw file extraction (`ExtractedDocument` & `ExtractedTextBlock`) from semantic résumé structure (`ResumeDocument`).
3. **Span Coordinate Law**: Explicitly track `coordinateSpace` ('raw' vs 'canonical') and maintain an `offsetMap: OffsetMapping[]` on `ResumeDocument` to prevent coordinate drift.
4. **Phrase Match Accuracy**: Replace loose stem co-occurrence bigram matching with explicit match classes (`exact_phrase`, `normalized_phrase`, `recognized_alias`, `component_only`, `missing`). Require contiguous phrase token runs for phrase match credit.
5. **Decompressed Scorecard (No Uncalibrated Overall Score)**: Replace the single collapsed 0–100 score with a multi-dimensional `AtsScorecard` (`parseQuality`, `sectionCoverage`, `literalKeywordCoverage`, `canonicalSkillCoverage`, `legibility`, `formattingRisk`).
6. **Reviewable Suggestions & Application Engine**: Convert transmutations into reviewable `ResumeSuggestion` objects with explicit risk ratings (`low` | `medium` | `high`) and generalized `AnalysisEvidence`. Provide a deterministic suggestion application engine (`applyAcceptedSuggestions`) that applies changes from highest offset to lowest and handles conflict resolution.
7. **Clean Résumé Export**: Export clean résumé text containing strictly résumé content without Scholomance headers, footers, or appended keyword piles.
8. **Deterministic Identity Law**: Generate stable, content-derived IDs for blocks, sections, and suggestions without timestamps or random UUIDs.
9. **Edit/Reparse Boundary**: Maintain `CareerWorkspace` tracking document revisions (`revision` vs `analyzedRevision`) to prevent stale analysis/suggestions from displaying on edited text.
10. **Observable Parser Preview UI**: Introduce a parser preview state machine (`IDLE` → `EXTRACTING` → `PARSING` → `PARSE_REVIEW` → `ANALYZING` → `COMPLETE`).

---

## 2. Core Data Contracts

### 2.1 Intermediate Extraction Contracts (`src/lib/career/parser/types.ts`)

```typescript
export type ResumeSourceType = 'pdf' | 'docx' | 'txt' | 'paste';

export interface ResumeSourceMetadata {
  type: ResumeSourceType;
  fileName?: string;
  fileSize?: number;
  pageCount?: number;
}

export interface ExtractedTextBlock {
  id: string; // Deterministic: `block:${page ?? 0}:${sourceOrder}:${stableHash(text)}`
  text: string;
  page?: number;
  sourceOrder: number;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  style?: {
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
  };
  container?: {
    kind: 'paragraph' | 'table_cell' | 'header' | 'footer' | 'unknown';
    tableId?: string;
    row?: number;
    column?: number;
  };
}

export interface ParseDiagnostic {
  code:
    | 'EMPTY_DOCUMENT'
    | 'IMAGE_ONLY_PDF'
    | 'READING_ORDER_UNCERTAIN'
    | 'MULTI_COLUMN_LAYOUT'
    | 'TABLE_LAYOUT'
    | 'UNKNOWN_SECTION'
    | 'DATE_PAIRING_AMBIGUOUS'
    | 'CONTACT_FIELD_AMBIGUOUS'
    | 'UNSUPPORTED_FILE';
  message: string;
  severity: 'info' | 'warning' | 'error';
  span?: TextSpan;
}

export interface ExtractedDocument {
  source: ResumeSourceMetadata;
  blocks: ExtractedTextBlock[];
  diagnostics: ParseDiagnostic[];
}
```

### 2.2 Coordinate Law & Parsed Document Schema

```typescript
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
  id: string; // Deterministic: `section:${kind}:${rawSpan.start}:${rawSpan.end}`
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
```

### 2.3 Decompressed Scorecard & Generalized Suggestions

```typescript
export type MatchKind =
  | 'exact_phrase'
  | 'normalized_phrase'
  | 'recognized_alias'
  | 'component_only'
  | 'missing';

export interface AtsScorecard {
  parseQuality: number | null;
  sectionCoverage: number;
  literalKeywordCoverage: number;
  canonicalSkillCoverage: number;
  legibility: number;
  formattingRisk: 'low' | 'medium' | 'high';

  // Composite score omitted in V1 until corpus calibration.
  composite?: {
    score: number;
    formulaVersion: string;
    calibrated: boolean;
  };
}

export interface AnalysisEvidence {
  source: 'resume' | 'job_description' | 'parser' | 'analysis';
  rule: string;
  text?: string;
  span?: TextSpan;
  confidence: number;
}

export interface ResumeSuggestion {
  id: string; // Deterministic: `suggestion:${type}:${targetKey}:${stableHash(evidencePayload)}`
  type: 'verb' | 'keyword' | 'acronym' | 'format' | 'structure';

  target?: {
    span?: TextSpan;
    sectionId?: string;
    insertionPoint?: 'before_section' | 'after_section' | 'document_end';
  };

  before?: string;
  after?: string;

  reason: string;
  evidence: AnalysisEvidence[];
  confidence: number;
  risk: 'low' | 'medium' | 'high';

  requiresUserApproval: true;
  status: 'pending' | 'accepted' | 'rejected' | 'edited';
}

export interface KeywordGapAnalysis {
  matched: Array<{ term: string; kind: MatchKind; weight: number }>;
  missing: Array<{ term: string; kind: MatchKind; weight: number }>;
  jobKeywords: Array<{ term: string; weight: number }>;
}

export interface LegibilityAnalysis {
  score: number;
  flaggedLines: Array<{ lineNumber: number; lineText: string; logProb: number }>;
}

export interface AcronymCoverageAnalysis {
  singleFormAcronyms: Array<{ acronym: string; expanded: string; presentForm: string }>;
}

export interface SectionCoverageAnalysis {
  score: number;
  detectedSections: ResumeSectionKind[];
  missingSections: ResumeSectionKind[];
}

export interface ParseQualityAnalysis {
  score: number;
  diagnostics: ParseDiagnostic[];
}

export interface CareerAnalysisResult {
  document: ResumeDocument;
  scorecard: AtsScorecard;
  analysis: {
    keywordGap: KeywordGapAnalysis;
    legibility: LegibilityAnalysis;
    acronymCoverage: AcronymCoverageAnalysis;
    sectionCoverage: SectionCoverageAnalysis;
    parseQuality: ParseQualityAnalysis;
  };
  suggestions: ResumeSuggestion[];
  archive: any;
}
```

### 2.4 Suggestion Application Engine (`src/lib/career/suggestions/`)

```typescript
export interface SuggestionApplicationResult {
  text: string;
  applied: string[];
  skipped: Array<{
    suggestionId: string;
    reason:
      | 'rejected'
      | 'stale_span'
      | 'overlap'
      | 'missing_target'
      | 'conflict';
  }>;
}

export function applyAcceptedSuggestions(
  document: ResumeDocument,
  suggestions: ResumeSuggestion[]
): SuggestionApplicationResult;
```

---

## 3. Workspace & Revision Boundary (`CareerWorkspace`)

```typescript
export interface CareerWorkspace {
  sourceDocument: ExtractedDocument; // immutable extraction result
  parsedDocument: ResumeDocument;    // parser output
  canonicalDocument: ResumeDocument; // user-reviewed version

  revision: number;
  analyzedRevision: number | null;
}
```
* **Revision Rule**: Editing parsed text increments `revision`. `analyzedRevision` is set to `revision` only when analysis completes. The UI will never render stale scorecards or suggestions when `revision !== analyzedRevision`.

---

## 4. Ingestion Adapters & File Requirements

1. **DOCX Adapter**:
   - Uses `fflate` to unzip `.docx` archives and parse `word/document.xml`.
   - Explicitly preserves paragraph order (`<w:p>`), tables/cells (`<w:tbl>`, `<w:tr>`, `<w:tc>`), tabs (`<w:tab>`), and hyperlinks (`word/_rels/document.xml.rels`).
   - Prevents table concatenation into unsegmented word piles.
   - Enforces a 10MB file size limit.
2. **PDF Adapter**:
   - Client-side PDF text stream parser with multi-column layout detection and text bounding box tracking.
   - Explicitly checks for machine-readable text layer. If text is missing or 0 bytes:
     - Emits `IMAGE_ONLY_PDF` error diagnostic.
     - Message: `"No machine-readable text layer was detected. Upload a text-based PDF, DOCX, TXT, or paste the résumé."`
   - Enforces a 10-page limit and 10MB size limit.

---

## 5. Deterministic Identity Law

All IDs in the parser and suggestion engine must be deterministic and content-derived:
- `block.id = block:${page ?? 0}:${sourceOrder}:${stableHash(text)}`
- `section.id = section:${kind}:${rawSpan.start}:${rawSpan.end}`
- `suggestion.id = suggestion:${type}:${targetKey}:${stableHash(evidencePayload)}`

Where `stableHash` uses a deterministic DJB2 algorithm. Random UUIDs or timestamps are forbidden.

---

## 6. Acceptance Gates & Verification Standards

### 6.1 Parser Quality Criteria
- [x] 100% contact-field accuracy across canonical test fixtures.
- [x] 100% section-heading detection for standard heading aliases.
- [x] Zero cross-column phantom phrase construction in multi-column PDFs.
- [x] Employer/title/date association preserved across all fixture goldens.
- [x] Image-only PDFs always produce an `IMAGE_ONLY_PDF` error diagnostic.
- [x] Repeated parsing produces byte-identical `ResumeDocument` output.
- [x] Every extracted field contains a valid supporting `ParseEvidence` entry.

### 6.2 Match Quality Criteria
- [x] Disconnected phrase components return `component_only` and contribute **0 points** to literal keyword coverage.
- [x] Contiguous normalized phrase returns `normalized_phrase`.
- [x] Acronym expansion returns `recognized_alias`.
- [x] Every credited match includes résumé and JD evidence spans.

### 6.3 Suggestion Safety Criteria
- [x] No suggestion is automatically accepted or applied without user approval.
- [x] No unsupported skills are invented or injected.
- [x] Overlapping edits are flagged as conflicts and skipped safely.
- [x] Stale suggestions cannot modify a newer workspace revision.
- [x] Rejecting all suggestions exports the canonical résumé text byte-identical to source.
- [x] Clean export contains no Sigil headers, footers, or appended anchor lines.

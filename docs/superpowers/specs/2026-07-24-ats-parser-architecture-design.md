# ATS Document-Ingestion and Structural-Parsing Architecture Specification

**Date**: 2026-07-24  
**Status**: Approved  
**Topic**: Transitioning Career Ignition Chamber from a text analyzer/rewriter to a true structured ATS Parser & Analysis Engine  

---

## 1. Overview & Core Philosophy

The ATS system is evolving from a plain-text analyzer and automatic rewriter into a **structural ATS parser and diagnostic analysis platform**. 

### Key Architectural Shifts
1. **Document Boundary**: Introduce a first-class `ResumeDocument` contract representing parsed sections, field extraction, reading order, and evidence-bearing spans.
2. **Ingestion Layer**: Add dedicated file adapters (`pasted-text`, `plain-text`, `docx`, `pdf`) capable of text extraction, reading-order recovery, layout diagnostic reporting, and graceful error handling.
3. **Phrase Match Accuracy**: Replace loose stem co-occurrence bigram matching with explicit match classes (`exact_phrase`, `normalized_phrase`, `recognized_alias`, `component_only`, `missing`). Require contiguous phrase token runs for phrase match credit.
4. **Decompressed Scorecard**: Replace the single collapsed 0–100 score with a multi-dimensional `AtsScorecard` (`parseQuality`, `sectionCoverage`, `literalKeywordCoverage`, `canonicalSkillCoverage`, `legibility`, `formattingRisk`).
5. **Reviewable Suggestions & Clean Export**: Convert automatic verb transmutations into reviewable `ResumeSuggestion` objects requiring explicit user approval/rejection/editing. Export clean résumé text containing strictly résumé content without Scholomance headers, footers, or appended keyword piles.
6. **Observable Parser Preview UI**: Introduce a parser preview state machine (`IDLE` → `EXTRACTING` → `PARSING` → `PARSE_REVIEW` → `ANALYZING` → `COMPLETE`) showing "What the parser saw" before running alignment scoring.

---

## 2. Core Data Contracts

### 2.1 Resume Document & Section Types (`src/lib/career/parser/types.ts`)

```typescript
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

export interface TextSpan {
  start: number;
  end: number;
  page?: number;
  line?: number;
}

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

export interface ResumeContact {
  name?: string;
  email?: string;
  phone?: string;
  links: string[];
}

export interface ResumeDocument {
  schemaVersion: 1;
  source: {
    type: 'pdf' | 'docx' | 'txt' | 'paste';
    fileName?: string;
    pageCount?: number;
  };
  rawText: string;
  normalizedText: string;
  sections: ResumeSection[];
  contact: ResumeContact;
  diagnostics: ParseDiagnostic[];
  confidence: number;
}
```

### 2.2 Match Classification & ATS Scorecard (`src/lib/career/analysis/types.ts`)

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
  overallScore: number;
}

export interface ResumeSuggestion {
  id: string;
  type: 'verb' | 'keyword' | 'acronym' | 'format' | 'structure';
  sourceSpan: TextSpan;
  before: string;
  after?: string;
  reason: string;
  evidence: ParseEvidence[];
  confidence: number;
  requiresUserApproval: true;
  status: 'pending' | 'accepted' | 'rejected' | 'edited';
}

export interface CareerAnalysisResult {
  document: ResumeDocument;
  scorecard: AtsScorecard;
  analysis: {
    keywordGap: any;
    legibility: any;
    acronymCoverage: any;
    sectionCoverage: any;
    parseQuality: any;
  };
  suggestions: ResumeSuggestion[];
  archive: any;
}

export interface ResumeExport {
  plainText: string;
  fileName: string;
}
```

---

## 3. Ingestion & Extraction Architecture (`src/lib/career/parser/`)

### File Structure
```
src/lib/career/parser/
  types.ts                # ResumeDocument, ResumeSection, TextSpan, etc.
  parse-resume.ts         # Public parseResumeSource() API entry point
  normalize-document.ts   # Whitespace & Unicode normalization with span tracking
  detect-sections.ts      # Section boundary detection & classification
  extract-contact.ts      # Name, email, phone, link extraction
  validate-parse.ts       # Confidence calculation & diagnostic aggregation

  adapters/
    pasted-text.ts        # String / textarea input adapter
    plain-text.ts         # .txt file input adapter
    docx.ts               # .docx XML paragraph & text extractor (fflate)
    pdf.ts                # .pdf text stream & layout extractor
```

### Public API Contract
```typescript
export async function parseResumeSource(
  source: ResumeSource
): Promise<ResumeDocument>
```

---

## 4. Analysis Layer & Keyword Matching Engine (`src/lib/career/analysis/`)

### Phrase Match Rules
1. **`exact_phrase`**: Raw text exact case-insensitive contiguous substring match.
2. **`normalized_phrase`**: Stemmed contiguous token run within the same phrase segment.
3. **`recognized_alias`**: Synonym mapping or acronym expanded form.
4. **`component_only`**: Words appear across disconnected locations. Surfaced in diagnostic evidence, but **0 points** toward phrase match coverage score.
5. **`missing`**: No match found.

---

## 5. UI State Machine & Workflow (`src/pages/Career/`)

### State Machine
```typescript
type CareerStatus =
  | 'IDLE'
  | 'EXTRACTING'
  | 'PARSING'
  | 'PARSE_REVIEW'
  | 'ANALYZING'
  | 'COMPLETE'
  | 'ERROR';
```

### User Journey
1. **Input**: File drop (`.pdf`, `.docx`, `.txt`) or pasted text + Target Job Description.
2. **Parsing & Review**: Shows "What the parser saw" preview:
   - Visual breakdown of detected sections (Contact, Skills, Experience, Education).
   - Extracted contact details.
   - Diagnostic warnings (e.g. multi-column layout, unpunctuated runs, unmapped sections).
   - User confirms or edits parsed text/sections.
3. **Alignment & Reviewable Suggestions**:
   - `AtsScorecard` displayed across all 6 dimensions.
   - Keyword gap report grouped by `MatchKind`.
   - Verb transmutation suggestions listed with `Accept`, `Reject`, `Edit`, and `Accept All Low-Risk`.
4. **Clean Export**: Download clean, unbranded `.txt` file containing strictly résumé content.

---

## 6. Testing & Verification Plan

### Parser Unit & Integration Tests (`tests/unit/careerParser.test.js`)
- Single-column plain text parsing.
- DOCX XML structure extraction via `fflate`.
- Multi-column and image-only PDF diagnostic assertions.
- Contact extraction (Email, Phone, Links, Name).
- Section boundary identification.

### Analyzer Unit Tests (`tests/unit/careerAnalyzer.test.js`)
- Contiguous bigram phrase matching (`component_only` vs `exact_phrase`).
- Decompressed `AtsScorecard` calculations.
- Suggestion generation and approval state handling.
- Clean export verification (absence of Sigil headers/footers/anchors).

---

## 7. Spec Self-Review
- [x] **Placeholder scan**: All contracts, types, and module paths explicitly specified.
- [x] **Internal consistency**: Data flow aligns across parser, analyzer, scorecard, suggestions, export, and UI.
- [x] **Scope check**: Well-defined boundaries between ingestion, structural parsing, analysis, and rendering.
- [x] **Ambiguity check**: Clear definition of phrase match rules and clean export contents.

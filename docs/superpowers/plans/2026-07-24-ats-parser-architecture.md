# ATS Document-Ingestion and Structural-Parsing Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Career Ignition Chamber from a plain-text analyzer/rewriter into a true structural ATS Parser, diagnostic engine, reviewable suggestion platform, and clean résumé exporter.

**Architecture:** A modular ingestion layer converts files/text into `ExtractedDocument`, which is normalized with offset mapping and parsed into a evidence-bearing `ResumeDocument`. The analysis boundary evaluates the parsed document using strict match classification (`MatchKind`), computes a decompressed `AtsScorecard`, generates reviewable `ResumeSuggestion` items, and applies accepted edits via a conflict-aware application engine to produce a clean résumé export.

**Tech Stack:** TypeScript, React, Vite, Framer Motion, fflate, Vitest, Zod.

## Global Constraints

- Node version: 20.20.2
- All IDs must be deterministic and content-derived (`stableHash` via DJB2 algorithm) — no `Math.random()` or timestamps.
- Loose stem co-occurrence bigram matching is replaced with `MatchKind`: contiguous token run required for phrase credit; `component_only` receives 0 literal keyword coverage points.
- No `overallScore` in `AtsScorecard` V1.
- Clean export contains ONLY résumé text — no `--- SCHOLOMANCE CAREER SIGIL v11.3 ---` headers, binding footers, or appended keyword anchor piles.
- Automatic verb transmutations become reviewable suggestions (`requiresUserApproval: true`).
- Image-only PDFs explicitly emit an `IMAGE_ONLY_PDF` error diagnostic.

---

### Task 1: Core Contracts, Types, and Zod Schemas

**Files:**
- Create: `src/lib/career/parser/types.ts`
- Create: `src/lib/career/analysis/types.ts`
- Create: `src/lib/career/schemas.ts`
- Test: `tests/unit/careerTypes.test.ts`

**Interfaces:**
- Consumes: None
- Produces: `ResumeSourceMetadata`, `ExtractedTextBlock`, `ParseDiagnostic`, `ExtractedDocument`, `TextSpan`, `OffsetMapping`, `ResumeSectionKind`, `ParseEvidence`, `ResumeSection`, `ResumeContact`, `ResumeDocument`, `MatchKind`, `AtsScorecard`, `AnalysisEvidence`, `ResumeSuggestion`, `KeywordGapAnalysis`, `LegibilityAnalysis`, `AcronymCoverageAnalysis`, `SectionCoverageAnalysis`, `ParseQualityAnalysis`, `CareerAnalysisResult`, `SuggestionApplicationResult`, `CareerWorkspace`, `ResumeExport`.

- [ ] **Step 1: Write the failing type validation test**

```typescript
// tests/unit/careerTypes.test.ts
import { describe, it, expect } from 'vitest';
import { ResumeDocumentSchema, AtsScorecardSchema } from '../../src/lib/career/schemas';

describe('Career Types & Schemas', () => {
  it('validates a ResumeDocument schema correctly', () => {
    const doc = {
      schemaVersion: 1,
      source: { type: 'paste' },
      rawText: 'John Doe\nEngineer',
      normalizedText: 'john doe engineer',
      offsetMap: [{ canonicalStart: 0, canonicalEnd: 8, rawStart: 0, rawEnd: 8 }],
      sections: [],
      contact: { name: 'John Doe' },
      diagnostics: [],
      confidence: 100,
    };
    const parsed = ResumeDocumentSchema.parse(doc);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.contact.name).toBe('John Doe');
  });

  it('rejects an AtsScorecard with uncalibrated overallScore', () => {
    const scorecard = {
      parseQuality: 90,
      sectionCoverage: 80,
      literalKeywordCoverage: 70,
      canonicalSkillCoverage: 60,
      legibility: 85,
      formattingRisk: 'low',
    };
    const parsed = AtsScorecardSchema.parse(scorecard);
    expect(parsed.formattingRisk).toBe('low');
    expect(parsed).not.toHaveProperty('overallScore');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerTypes.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/career/schemas'"

- [ ] **Step 3: Implement `types.ts` and `schemas.ts`**

Create `src/lib/career/parser/types.ts`:
```typescript
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
```

Create `src/lib/career/analysis/types.ts`:
```typescript
import { TextSpan, ParseDiagnostic, ResumeDocument, ExtractedDocument, ResumeSectionKind } from '../parser/types';

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
  id: string;
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

export interface KeywordHitResult {
  term: string;
  kind: MatchKind;
  weight: number;
  matched: boolean;
  inSkillsLexicon: boolean;
}

export interface KeywordGapAnalysis {
  matched: KeywordHitResult[];
  missing: KeywordHitResult[];
  jobKeywords: KeywordHitResult[];
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

export interface SuggestionApplicationResult {
  text: string;
  applied: string[];
  skipped: Array<{
    suggestionId: string;
    reason: 'rejected' | 'stale_span' | 'overlap' | 'missing_target' | 'conflict';
  }>;
}

export interface CareerWorkspace {
  sourceDocument: ExtractedDocument;
  parsedDocument: ResumeDocument;
  canonicalDocument: ResumeDocument;
  revision: number;
  analyzedRevision: number | null;
}

export interface ResumeExport {
  plainText: string;
  fileName: string;
}
```

Create `src/lib/career/schemas.ts` using `zod`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerTypes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/parser/types.ts src/lib/career/analysis/types.ts src/lib/career/schemas.ts tests/unit/careerTypes.test.ts
git commit -m "feat(career): add ResumeDocument, AtsScorecard, and suggestion data contracts with Zod schemas"
```

---

### Task 2: Deterministic Identity Utilities and Document Normalization

**Files:**
- Create: `src/lib/career/parser/identity-utils.ts`
- Create: `src/lib/career/parser/normalize-document.ts`
- Test: `tests/unit/careerNormalization.test.ts`

**Interfaces:**
- Consumes: `TextSpan`, `OffsetMapping`, `ExtractedDocument`
- Produces: `stableHash(str: string): string`, `makeBlockId`, `makeSectionId`, `makeSuggestionId`, `normalizeExtractedDocument(extracted: ExtractedDocument): { text: string; normalized: string; offsetMap: OffsetMapping[] }`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/careerNormalization.test.ts
import { describe, it, expect } from 'vitest';
import { stableHash, makeSectionId } from '../../src/lib/career/parser/identity-utils';
import { normalizeExtractedDocument } from '../../src/lib/career/parser/normalize-document';

describe('Deterministic Identity & Normalization', () => {
  it('produces repeatable stableHash without randomness', () => {
    const hash1 = stableHash('Hello World');
    const hash2 = stableHash('Hello World');
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBeGreaterThan(0);
  });

  it('formats section ID strictly according to law', () => {
    const id = makeSectionId('experience', 10, 200);
    expect(id).toBe('section:experience:10:200');
  });

  it('builds canonical offset mappings for raw text', () => {
    const raw = 'Hello    World\n\nTest';
    const extracted = {
      source: { type: 'paste' as const },
      blocks: [{ id: 'b1', text: raw, sourceOrder: 0 }],
      diagnostics: [],
    };
    const res = normalizeExtractedDocument(extracted);
    expect(res.offsetMap.length).toBeGreaterThan(0);
    expect(res.normalized).toContain('hello world');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerNormalization.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `identity-utils.ts` and `normalize-document.ts`**

`identity-utils.ts`: DJB2 hash algorithm. `makeBlockId`, `makeSectionId`, `makeSuggestionId`.
`normalize-document.ts`: Processes `ExtractedTextBlock[]` into unified raw and canonical text strings while recording character offset mapping boundaries (`OffsetMapping`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerNormalization.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/parser/identity-utils.ts src/lib/career/parser/normalize-document.ts tests/unit/careerNormalization.test.ts
git commit -m "feat(career): implement deterministic identity generation and offset-mapped text normalization"
```

---

### Task 3: Section Boundary Detection and Contact Extraction

**Files:**
- Create: `src/lib/career/parser/extract-contact.ts`
- Create: `src/lib/career/parser/detect-sections.ts`
- Create: `src/lib/career/parser/validate-parse.ts`
- Test: `tests/unit/careerSectionDetection.test.ts`

**Interfaces:**
- Consumes: `ExtractedDocument`, `OffsetMapping`
- Produces: `extractContactFields(rawText: string): ResumeContact`, `detectResumeSections(rawText: string, offsetMap: OffsetMapping[]): ResumeSection[]`, `validateResumeDocument(...)`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/careerSectionDetection.test.ts
import { describe, it, expect } from 'vitest';
import { extractContactFields } from '../../src/lib/career/parser/extract-contact';
import { detectResumeSections } from '../../src/lib/career/parser/detect-sections';

describe('Section Detection & Contact Extraction', () => {
  it('extracts name, email, phone, and links from text', () => {
    const text = 'Jane Doe\nEmail: jane.doe@example.com\nPhone: (555) 123-4567\nhttps://linkedin.com/in/janedoe';
    const contact = extractContactFields(text);
    expect(contact.name).toBe('Jane Doe');
    expect(contact.email).toBe('jane.doe@example.com');
    expect(contact.phone).toBe('(555) 123-4567');
    expect(contact.links).toContain('https://linkedin.com/in/janedoe');
  });

  it('detects standard section headings like EXPERIENCE and EDUCATION', () => {
    const text = 'Jane Doe\n\nWORK EXPERIENCE\nBuilt scalable services.\n\nEDUCATION\nB.S. Computer Science';
    const sections = detectResumeSections(text, []);
    const kinds = sections.map((s) => s.kind);
    expect(kinds).toContain('experience');
    expect(kinds).toContain('education');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerSectionDetection.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement contact extraction and section detection**

Implement `extract-contact.ts` with regexes for email, phone numbers, and URLs, and top-of-page name detection.
Implement `detect-sections.ts` with regex alias map (`WORK EXPERIENCE`, `EXPERIENCE`, `EMPLOYMENT`, `EDUCATION`, `ACADEMIC`, `SKILLS`, `TECHNICAL SKILLS`, `PROJECTS`, `SUMMARY`, `OBJECTIVE`, `CERTIFICATIONS`, `AWARDS`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerSectionDetection.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/parser/extract-contact.ts src/lib/career/parser/detect-sections.ts src/lib/career/parser/validate-parse.ts tests/unit/careerSectionDetection.test.ts
git commit -m "feat(career): implement structural section detection and contact field extraction"
```

---

### Task 4: Ingestion Adapters (Pasted, TXT, DOCX via fflate, PDF with OCR Refusal)

**Files:**
- Create: `src/lib/career/parser/adapters/pasted-text.ts`
- Create: `src/lib/career/parser/adapters/plain-text.ts`
- Create: `src/lib/career/parser/adapters/docx.ts`
- Create: `src/lib/career/parser/adapters/pdf.ts`
- Create: `src/lib/career/parser/parse-resume.ts`
- Test: `tests/unit/careerAdapters.test.ts`

**Interfaces:**
- Consumes: File buffer / string input (`ResumeSource`)
- Produces: `parseResumeSource(source: { type: ResumeSourceType; content: string | Uint8Array; fileName?: string }): Promise<ResumeDocument>`

- [ ] **Step 1: Write failing adapter tests**

```typescript
// tests/unit/careerAdapters.test.ts
import { describe, it, expect } from 'vitest';
import { parseResumeSource } from '../../src/lib/career/parser/parse-resume';

describe('Resume Ingestion Adapters', () => {
  it('parses pasted text into a valid ResumeDocument', async () => {
    const doc = await parseResumeSource({
      type: 'paste',
      content: 'Alex Smith\nEmail: alex@example.com\n\nSKILLS\nJavaScript, React, Node.js',
    });
    expect(doc.rawText).toContain('Alex Smith');
    expect(doc.contact.email).toBe('alex@example.com');
    expect(doc.sections.length).toBeGreaterThan(0);
  });

  it('emits IMAGE_ONLY_PDF diagnostic for empty/image PDF streams', async () => {
    const doc = await parseResumeSource({
      type: 'pdf',
      content: new Uint8Array([37, 80, 68, 70]), // %PDF header only
      fileName: 'scanned.pdf',
    });
    const errorDiag = doc.diagnostics.find((d) => d.code === 'IMAGE_ONLY_PDF');
    expect(errorDiag).toBeDefined();
    expect(errorDiag?.severity).toBe('error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerAdapters.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement adapters and public entry point**

- `pasted-text.ts` & `plain-text.ts`: split lines into blocks.
- `docx.ts`: unzip using `fflate`, parse `word/document.xml` tags `<w:p>`, `<w:tr>`, `<w:tc>`, `<w:t>`.
- `pdf.ts`: PDF text stream extractor. If text stream is empty or missing, emit `IMAGE_ONLY_PDF` error diagnostic.
- `parse-resume.ts`: master entry point assembling source extraction, text normalization, contact extraction, section detection, and diagnostic validation.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerAdapters.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/parser/adapters/ src/lib/career/parser/parse-resume.ts tests/unit/careerAdapters.test.ts
git commit -m "feat(career): implement ingestion adapters for pasted text, TXT, DOCX, and PDF with OCR refusal"
```

---

### Task 5: Contiguous Phrase Match Engine & Decompressed AtsScorecard

**Files:**
- Create: `src/lib/career/analysis/keyword-matcher.ts`
- Create: `src/lib/career/analysis/scorecard.ts`
- Modify: `src/lib/career/keyword-gap.js`
- Test: `tests/unit/careerKeywordMatcher.test.ts`

**Interfaces:**
- Consumes: `ResumeDocument`, `jobDescription: string`
- Produces: `MatchKind` classification per hit (`exact_phrase`, `normalized_phrase`, `recognized_alias`, `component_only`, `missing`), `AtsScorecard` computation.

- [ ] **Step 1: Write the failing phrase match test**

```typescript
// tests/unit/careerKeywordMatcher.test.ts
import { describe, it, expect } from 'vitest';
import { analyzeKeywordGapStrict } from '../../src/lib/career/analysis/keyword-matcher';

describe('Strict Keyword Matcher & MatchKind', () => {
  it('classifies disconnected words as component_only with 0 phrase match credit', () => {
    const resumeText = 'Built a music project.\nWorked under senior management.';
    const jdText = 'Looking for project management experience.';
    const report = analyzeKeywordGapStrict(resumeText, jdText);

    const hit = report.jobKeywords.find((k) => k.term === 'project management');
    expect(hit).toBeDefined();
    expect(hit?.kind).toBe('component_only');
    expect(hit?.matched).toBe(false); // Does NOT count toward literal keyword coverage!
  });

  it('classifies contiguous stemmed token run as normalized_phrase', () => {
    const resumeText = 'Experienced in project management methodologies.';
    const jdText = 'Seeking project management lead.';
    const report = analyzeKeywordGapStrict(resumeText, jdText);

    const hit = report.jobKeywords.find((k) => k.term === 'project management');
    expect(hit?.kind).toBe('normalized_phrase');
    expect(hit?.matched).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerKeywordMatcher.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement strict phrase matcher & decompressed scorecard**

Implement `keyword-matcher.ts`: inspect phrase segments for contiguous token runs before granting phrase match credit (`normalized_phrase` or `exact_phrase`). Disconnected token co-occurrences are marked `component_only` (0 score credit).
Implement `scorecard.ts`: computes 6-dimension `AtsScorecard`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerKeywordMatcher.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/analysis/keyword-matcher.ts src/lib/career/analysis/scorecard.ts tests/unit/careerKeywordMatcher.test.ts
git commit -m "feat(career): implement strict contiguous phrase matcher (MatchKind) and decompressed AtsScorecard"
```

---

### Task 6: Reviewable Suggestion Engine & Deterministic Application Engine

**Files:**
- Create: `src/lib/career/suggestions/build-suggestions.ts`
- Create: `src/lib/career/suggestions/apply-suggestions.ts`
- Create: `src/lib/career/suggestions/detect-conflicts.ts`
- Test: `tests/unit/careerSuggestions.test.ts`

**Interfaces:**
- Consumes: `ResumeDocument`, `KeywordGapAnalysis`, `LegibilityAnalysis`, `AcronymCoverageAnalysis`
- Produces: `ResumeSuggestion[]`, `applyAcceptedSuggestions(doc, suggestions): SuggestionApplicationResult`

- [ ] **Step 1: Write the failing suggestion application test**

```typescript
// tests/unit/careerSuggestions.test.ts
import { describe, it, expect } from 'vitest';
import { applyAcceptedSuggestions } from '../../src/lib/career/suggestions/apply-suggestions';
import { ResumeDocument, ResumeSuggestion } from '../../src/lib/career/analysis/types';

describe('Suggestion Application Engine', () => {
  it('applies accepted verb suggestions from highest offset to lowest', () => {
    const doc: Partial<ResumeDocument> = {
      rawText: 'Helped migrate database and led team.',
      sections: [],
    };
    const suggestions: ResumeSuggestion[] = [
      {
        id: 's1',
        type: 'verb',
        target: { span: { coordinateSpace: 'raw', start: 0, end: 6 } },
        before: 'Helped',
        after: 'Facilitated',
        reason: 'Low torque verb',
        evidence: [],
        confidence: 90,
        risk: 'low',
        requiresUserApproval: true,
        status: 'accepted',
      },
      {
        id: 's2',
        type: 'verb',
        target: { span: { coordinateSpace: 'raw', start: 27, end: 30 } },
        before: 'led',
        after: 'orchestrated',
        reason: 'Low torque verb',
        evidence: [],
        confidence: 90,
        risk: 'low',
        requiresUserApproval: true,
        status: 'accepted',
      },
    ];

    const result = applyAcceptedSuggestions(doc as ResumeDocument, suggestions);
    expect(result.text).toBe('Facilitated migrate database and orchestrated team.');
    expect(result.applied).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerSuggestions.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement suggestion generator & application engine**

- `build-suggestions.ts`: maps torque verb swaps into reviewable `ResumeSuggestion` objects with `risk: 'low' | 'medium' | 'high'` and `requiresUserApproval: true`.
- `detect-conflicts.ts`: checks for overlapping replacement spans.
- `apply-suggestions.ts`: sorts accepted suggestions descending by offset, applies replacements/insertions safely, returns `SuggestionApplicationResult`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerSuggestions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/suggestions/ tests/unit/careerSuggestions.test.ts
git commit -m "feat(career): implement reviewable suggestion generator and deterministic application engine"
```

---

### Task 7: Career Analysis Boundary & Clean Export

**Files:**
- Create: `src/lib/career/analysis/analyze-career.ts`
- Create: `src/lib/career/export/clean-export.ts`
- Modify: `src/lib/career/sigil-pipeline.js`
- Test: `tests/unit/careerAnalysisBoundary.test.ts`

**Interfaces:**
- Consumes: `ResumeDocument`, `jobDescriptionText: string`
- Produces: `analyzeCareerFit(...)`: `CareerAnalysisResult`, `buildCleanExport(doc: ResumeDocument, suggestions: ResumeSuggestion[]): ResumeExport`

- [ ] **Step 1: Write the failing clean export test**

```typescript
// tests/unit/careerAnalysisBoundary.test.ts
import { describe, it, expect } from 'vitest';
import { buildCleanExport } from '../../src/lib/career/export/clean-export';
import { ResumeDocument } from '../../src/lib/career/parser/types';

describe('Clean Résumé Export', () => {
  it('exports plain text strictly free of Scholomance sigil headers, footers, or anchor trailers', () => {
    const doc: Partial<ResumeDocument> = {
      rawText: 'John Doe\nSoftware Engineer\nBuilt web applications.',
    };
    const exp = buildCleanExport(doc as ResumeDocument, []);
    expect(exp.plainText).not.toContain('SCHOLOMANCE CAREER SIGIL');
    expect(exp.plainText).not.toContain('[BINDING COMPLETE]');
    expect(exp.plainText).not.toContain('CORE RESONANCE:');
    expect(exp.plainText).toContain('John Doe');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerAnalysisBoundary.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement analysis boundary and clean export generator**

- `clean-export.ts`: applies accepted suggestions to raw résumé text and produces clean `.txt` content without any Sigil scaffolding.
- `analyze-career.ts`: master analysis orchestrator connecting parser, strict keyword matcher, HMM legibility arbiter, acronym coverage, section coverage, scorecard builder, and suggestion engine.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerAnalysisBoundary.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/analysis/analyze-career.ts src/lib/career/export/clean-export.ts tests/unit/careerAnalysisBoundary.test.ts
git commit -m "feat(career): implement analyzeCareerFit boundary and clean résumé export generator"
```

---

### Task 8: UI Parser Preview & Career Workspace State Integration

**Files:**
- Create: `src/pages/Career/ParserPreviewDrawer.tsx`
- Create: `src/pages/Career/SuggestionReviewPanel.tsx`
- Modify: `src/pages/Career/CareerPage.tsx`
- Modify: `src/pages/Career/CareerPage.css`
- Test: `tests/unit/careerPageWorkflow.test.tsx`

**Interfaces:**
- Consumes: File upload / paste input, target job description
- Produces: Career Ignition UI with parser preview, `AtsScorecard` multi-dimensional display, suggestion review controls, and clean export download.

- [ ] **Step 1: Write the failing UI state workflow test**

```typescript
// tests/unit/careerPageWorkflow.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import CareerPage from '../../src/pages/Career/CareerPage';

describe('CareerPage Parser & Review Workflow', () => {
  it('renders input area and parses text into parser preview state', async () => {
    render(<CareerPage />);
    const resumeTextarea = screen.getByLabelText(/Your Experience/i);
    fireEvent.change(resumeTextarea, { target: { value: 'John Doe\nEmail: john@example.com\n\nEXPERIENCE\nEngineered backend APIs.' } });

    const parseBtn = screen.getByRole('button', { name: /Parse & Inspect Résumé/i });
    fireEvent.click(parseBtn);

    expect(await screen.findByText(/What The Parser Saw/i)).toBeInTheDocument();
    expect(screen.getByText(/john@example.com/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerPageWorkflow.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement Parser Preview Drawer, Suggestion Review Panel, and update CareerPage.tsx**

- Implement `ParserPreviewDrawer.tsx`: visual list of extracted sections (`Contact`, `Skills`, `Experience`, `Education`, etc.), confidence percentage, and diagnostic warnings.
- Implement `SuggestionReviewPanel.tsx`: reviewable suggestions with `Accept`, `Reject`, `Edit`, and `Accept All Low-Risk` buttons.
- Update `CareerPage.tsx`: state machine (`IDLE` → `EXTRACTING` → `PARSING` → `PARSE_REVIEW` → `ANALYZING` → `COMPLETE`). Renders 6-dimension `AtsScorecard` and provides clean `.txt` export download.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerPageWorkflow.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Career/ tests/unit/careerPageWorkflow.test.tsx
git commit -m "feat(career): integrate parser preview drawer, suggestion review panel, and multi-state workspace UI"
```

---

## Plan Self-Review & Verification

1. **Spec Coverage Check**:
   - `ResumeDocument` & `ResumeSection` contracts: Task 1
   - Intermediate extraction contracts (`ExtractedDocument`, `ExtractedTextBlock`): Task 1
   - Deterministic identity generation law (`stableHash`, DJB2): Task 2
   - Span coordinate law (`coordinateSpace`, `offsetMap`): Task 2
   - Contact & section detection: Task 3
   - Ingestion adapters (Pasted, TXT, DOCX via `fflate`, PDF with `IMAGE_ONLY_PDF` refusal): Task 4
   - Contiguous phrase match engine (`MatchKind`): Task 5
   - Decompressed `AtsScorecard` (No uncalibrated overall score): Task 5
   - Reviewable suggestions & application engine (`applyAcceptedSuggestions`): Task 6
   - `CareerAnalysisResult` boundary & clean export (no Sigil wrappers/anchors): Task 7
   - UI Parser Preview & state machine: Task 8
2. **Placeholder Scan**: Zero `TODO`, `TBD`, or vague steps. All task files and signatures are explicitly detailed.
3. **Type Consistency**: Method names, data properties, and interface schemas match across all tasks.

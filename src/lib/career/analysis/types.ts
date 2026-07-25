import type {
  TextSpan,
  ParseDiagnostic,
  ResumeDocument,
  ExtractedDocument,
  ResumeSectionKind,
} from '../parser/types';
import type { SkillClass } from '../graph/contracts';
import type { MoveBulletOperation } from '../improve/types';

// Re-export parser document types so analysis consumers can import them from
// the analysis barrel without reaching into the parser layer directly.
export type {
  TextSpan,
  ParseDiagnostic,
  ResumeDocument,
  ExtractedDocument,
  ResumeSectionKind,
};

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

export interface SuggestionInputSlot {
  id: string;
  placeholder: string;
  hint: string;
}

export interface ResumeSuggestion {
  id: string;
  type:
    | 'verb'
    | 'keyword'
    | 'acronym'
    | 'format'
    | 'structure'
    | 'quantify'
    | 'tighten'
    | 'learning_gap';
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
  /** True when `after` contains one or more U+241F input sentinels the candidate must fill. */
  requiresInput?: boolean;
  /** One entry per sentinel in `after`, in left-to-right order. */
  inputSlots?: SuggestionInputSlot[];
  /** Career Graph canonical concept id (present for graph-derived suggestions). */
  conceptId?: string;
  /** Career Graph skill classification (present for graph-derived suggestions). */
  skillClass?: SkillClass;
  /** False when the suggestion is a non-editable learning/interview gap. */
  editable?: boolean;
  /**
   * Additive JD-Advisor extension (spec §4.5): a stable-id bullet move. Present only on
   * `structure` reorder suggestions. The apply engine resolves it by `bulletId`, so an
   * earlier accepted text rewrite cannot invalidate the move. Never carries a span.
   */
  move?: MoveBulletOperation;
}

export interface KeywordHitResult {
  term: string;
  kind: MatchKind;
  weight: number;
  matched: boolean;
  inSkillsLexicon: boolean;
}

export interface KeywordGapAnalysis {
  readonly matched: readonly KeywordHitResult[];
  readonly missing: readonly KeywordHitResult[];
  readonly jobKeywords: readonly KeywordHitResult[];
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
    reason:
      | 'rejected'
      | 'stale_span'
      | 'overlap'
      | 'missing_target'
      | 'conflict'
      | 'unfilled_input'
      | 'unprovenanced_number';
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

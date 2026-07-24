import {
  TextSpan,
  ParseDiagnostic,
  ResumeDocument,
  ExtractedDocument,
  ResumeSectionKind,
} from '../parser/types';

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

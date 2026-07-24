import type { ResumeDocument, ResumeSectionKind } from '../parser/types.js';
import type {
  CareerAnalysisResult,
  SectionCoverageAnalysis,
  ParseQualityAnalysis,
  LegibilityAnalysis,
  AcronymCoverageAnalysis,
} from './types.js';
import { analyzeKeywordGapStrict } from './keyword-matcher.js';
import { computeAtsScorecard } from './scorecard.js';
import { buildCareerSuggestions } from '../suggestions/build-suggestions.js';
import { analyzeAcronymCoverage } from '../acronyms.js';
import { assembleDataArchive } from '../data-archive.js';
import { analyzeResumeLegibility } from '../../../../codex/core/career/ats-hmm/index.js';

const EXPECTED_SECTIONS: ResumeSectionKind[] = [
  'contact',
  'summary',
  'skills',
  'experience',
  'education',
];

/**
 * Master analysis orchestrator for candidate résumé career fit.
 *
 * Runs strict phrase matching, HMM prose legibility audit, acronym coverage analysis,
 * section/parse quality analysis, computes a 6-dimension AtsScorecard, builds reviewable
 * suggestions, and assembles the plain-language Data Archive.
 */
export function analyzeCareerFit(
  document: ResumeDocument,
  jobDescriptionText: string = '',
  options: object = {}
): CareerAnalysisResult {
  const resumeText = document?.rawText || document?.normalizedText || '';

  // 1. Strict Keyword Gap Analysis
  const keywordGap = analyzeKeywordGapStrict(resumeText, jobDescriptionText, options);

  // 2. Prose Legibility Audit (HMM Pass)
  const rawLegibility = analyzeResumeLegibility(resumeText);
  const legibilityScore100 = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        typeof rawLegibility?.legibilityScore === 'number'
          ? rawLegibility.legibilityScore <= 1
            ? rawLegibility.legibilityScore * 100
            : rawLegibility.legibilityScore
          : 100
      )
    )
  );

  const legibility: LegibilityAnalysis & typeof rawLegibility = {
    ...rawLegibility,
    score: legibilityScore100,
    flaggedLines: (rawLegibility?.flagged || []).map((f: any) => ({
      lineNumber: f.lineNumber,
      lineText: f.text,
      logProb: f.signals?.perTokenLogProb ?? 0,
    })),
  };

  // 3. Acronym Coverage Analysis
  const rawAcronymCoverage = analyzeAcronymCoverage(
    resumeText,
    jobDescriptionText,
    options
  );
  const singleFormAcronyms = (rawAcronymCoverage?.gaps || []).map((gap: any) => ({
    acronym: gap.acronym,
    expanded: gap.expansion,
    presentForm: gap.present,
  }));
  const acronymCoverage: AcronymCoverageAnalysis & typeof rawAcronymCoverage = {
    ...rawAcronymCoverage,
    singleFormAcronyms,
  };

  // 4. Section Coverage Analysis
  const detectedSet = new Set<ResumeSectionKind>();
  if (
    document?.contact &&
    (document.contact.email ||
      document.contact.phone ||
      document.contact.name ||
      (document.contact.links && document.contact.links.length > 0))
  ) {
    detectedSet.add('contact');
  }
  for (const sec of document?.sections || []) {
    if (sec.kind && sec.kind !== 'unknown') {
      detectedSet.add(sec.kind);
    }
  }
  const detectedSections = Array.from(detectedSet);
  const missingSections = EXPECTED_SECTIONS.filter(
    (kind) => !detectedSet.has(kind)
  );
  const sectionCoverageScore = Math.min(
    100,
    Math.round((detectedSections.length / EXPECTED_SECTIONS.length) * 100)
  );

  const sectionCoverage: SectionCoverageAnalysis = {
    score: sectionCoverageScore,
    detectedSections,
    missingSections,
  };

  // 5. Parse Quality Analysis
  const parseQualityScore =
    typeof document?.confidence === 'number' && !Number.isNaN(document.confidence)
      ? Math.min(100, Math.max(0, Math.round(document.confidence)))
      : 100;

  const parseQuality: ParseQualityAnalysis = {
    score: parseQualityScore,
    diagnostics: document?.diagnostics || [],
  };

  // 6. Decompressed ATS Scorecard
  const scorecard = computeAtsScorecard({
    doc: document,
    keywordGap,
    legibility,
    acronymCoverage,
    sectionCoverage,
  });

  // 7. Reviewable Suggestions
  const suggestions = buildCareerSuggestions({
    document,
    keywordGap,
    legibility,
    acronymCoverage,
  });

  // 8. Data Archive
  const archive = assembleDataArchive({
    changes: [],
    report: {
      score: scorecard.literalKeywordCoverage,
      matched: keywordGap.matched,
      missing: keywordGap.missing,
      torqueConflicts: [],
    },
    legibility,
    acronymCoverage,
  });

  return {
    document,
    scorecard,
    analysis: {
      keywordGap,
      legibility,
      acronymCoverage,
      sectionCoverage,
      parseQuality,
    },
    suggestions,
    archive,
  };
}

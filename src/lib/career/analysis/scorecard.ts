import { normalizeText, stem } from '../text-utils.js';
import { STOPWORDS } from '../stopwords.js';
import { toPercentConfidence } from './analyze-career.js';
import type {
  ResumeDocument,
  KeywordGapAnalysis,
  LegibilityAnalysis,
  AcronymCoverageAnalysis,
  SectionCoverageAnalysis,
  AtsScorecard,
} from './types';

const DEFAULT_SKILLS_LEXICON = Object.freeze([
  'javascript', 'typescript', 'python', 'java', 'react', 'node', 'sql',
  'aws', 'azure', 'docker', 'kubernetes', 'graphql', 'rest', 'api',
  'ci-cd', 'devops', 'git', 'agile', 'scrum', 'testing', 'design', 'data',
  'machine learning', 'leadership', 'analytics', 'cloud', 'security',
]);

function buildStemSet(normalized: string): Set<string> {
  const set = new Set<string>();
  if (!normalized) return set;
  for (const tok of normalized.split(' ')) {
    if (tok.length >= 3 && !STOPWORDS.has(tok)) set.add(stem(tok));
  }
  return set;
}

/**
 * Computes decompressed ATS Scorecard with 6 explicit dimensions.
 * ABSOLUTELY NO top-level overallScore property.
 */
export function computeAtsScorecard(params: {
  doc: ResumeDocument;
  keywordGap: KeywordGapAnalysis;
  legibility: LegibilityAnalysis;
  acronymCoverage: AcronymCoverageAnalysis;
  sectionCoverage: SectionCoverageAnalysis;
}): AtsScorecard {
  const { doc, keywordGap, legibility, sectionCoverage } = params;

  // 1. parseQuality: doc.confidence normalized to a clamped 0-100 integer (or null)
  const parseQuality = toPercentConfidence(doc?.confidence);

  // 2. sectionCoverage: 0-100
  const sectionCoverageScore = Math.min(
    100,
    Math.max(0, Math.round(sectionCoverage?.score ?? 0))
  );

  // 3. literalKeywordCoverage: percentage of weighted top JD keywords matched with matched: true
  const jobKeywords = keywordGap?.jobKeywords ?? [];
  const totalWeight = jobKeywords.reduce((acc, k) => acc + (k.weight || 0), 0);
  const matchedWeight = jobKeywords
    .filter((k) => k.matched === true)
    .reduce((acc, k) => acc + (k.weight || 0), 0);

  const literalKeywordCoverage =
    totalWeight > 0 ? Math.round((100 * matchedWeight) / totalWeight) : 0;

  // 4. canonicalSkillCoverage: percentage of skill lexicon terms present in skills/experience sections
  const relevantSections = (doc?.sections ?? []).filter(
    (s) => s.kind === 'skills' || s.kind === 'experience'
  );

  const sectionText =
    relevantSections.length > 0
      ? relevantSections.map((s) => s.text).join(' ')
      : doc?.normalizedText || doc?.rawText || '';

  const normSectionText = normalizeText(sectionText);
  const sectionStems = buildStemSet(normSectionText);

  // Take skills lexicon terms
  const targetSkills = DEFAULT_SKILLS_LEXICON;
  let matchedSkillsCount = 0;

  for (const skill of targetSkills) {
    const normSkill = normalizeText(skill);
    const skillStems = normSkill.split(' ').map(stem).filter(Boolean);
    if (
      skillStems.length > 0 &&
      skillStems.every((s) => sectionStems.has(s))
    ) {
      matchedSkillsCount++;
    }
  }

  const canonicalSkillCoverage =
    targetSkills.length > 0
      ? Math.round((100 * matchedSkillsCount) / targetSkills.length)
      : 0;

  // 5. legibility: 0-100
  const legibilityScore = Math.min(
    100,
    Math.max(0, Math.round(legibility?.score ?? 100))
  );

  // 6. formattingRisk: 'low' | 'medium' | 'high'
  const diagnostics = doc?.diagnostics ?? [];
  const diagnosticCodes = new Set(diagnostics.map((d) => d.code));

  let formattingRisk: 'low' | 'medium' | 'high' = 'low';

  const highRiskCodes = new Set([
    'MULTI_COLUMN_LAYOUT',
    'IMAGE_ONLY_PDF',
    'UNSUPPORTED_FILE',
    'READING_ORDER_UNCERTAIN',
  ]);

  const mediumRiskCodes = new Set([
    'TABLE_LAYOUT',
    'UNKNOWN_SECTION',
    'DATE_PAIRING_AMBIGUOUS',
    'CONTACT_FIELD_AMBIGUOUS',
  ]);

  if (
    Array.from(diagnosticCodes).some((code) => highRiskCodes.has(code)) ||
    diagnostics.filter((d) => d.severity === 'error').length > 0
  ) {
    formattingRisk = 'high';
  } else if (
    Array.from(diagnosticCodes).some((code) => mediumRiskCodes.has(code)) ||
    diagnostics.filter((d) => d.severity === 'warning').length > 0 ||
    (sectionCoverage?.missingSections ?? []).length >= 2
  ) {
    formattingRisk = 'medium';
  }

  const scorecard: AtsScorecard = {
    parseQuality,
    sectionCoverage: sectionCoverageScore,
    literalKeywordCoverage,
    canonicalSkillCoverage,
    legibility: legibilityScore,
    formattingRisk,
  };

  return Object.freeze(scorecard);
}

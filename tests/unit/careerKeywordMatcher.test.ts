import { describe, it, expect } from 'vitest';
import { analyzeKeywordGapStrict } from '../../src/lib/career/analysis/keyword-matcher';
import { computeAtsScorecard } from '../../src/lib/career/analysis/scorecard';
import { AtsScorecardSchema } from '../../src/lib/career/schemas';
import type {
  ResumeDocument,
  LegibilityAnalysis,
  AcronymCoverageAnalysis,
  SectionCoverageAnalysis,
} from '../../src/lib/career/analysis/types';

describe('analyzeKeywordGapStrict — MatchKind classification', () => {
  it('classifies exact phrase matches', () => {
    const resume = 'Demonstrated experience in project management and TypeScript.';
    const jd = 'Seeking engineer with project management and TypeScript skills.';
    const analysis = analyzeKeywordGapStrict(resume, jd);

    const pmHit = analysis.jobKeywords.find((k) => k.term === 'project management');
    expect(pmHit).toBeDefined();
    expect(pmHit?.kind).toBe('exact_phrase');
    expect(pmHit?.matched).toBe(true);
    expect(analysis.matched).toContainEqual(pmHit);
  });

  it('classifies normalized phrase matches when stems are contiguous in a segment', () => {
    // "managing projects" -> stemmed segment has contiguous stems for "project" and "management"
    const resume = 'Responsible for managing projects in an agile environment.';
    const jd = 'Needs project management expertise.';
    const analysis = analyzeKeywordGapStrict(resume, jd);

    const pmHit = analysis.jobKeywords.find((k) => k.term === 'project management');
    expect(pmHit).toBeDefined();
    expect(pmHit?.kind).toBe('normalized_phrase');
    expect(pmHit?.matched).toBe(true);
  });

  it('classifies recognized acronym/alias matches', () => {
    const resume = 'Extensive experience with ML and AWS cloud infrastructure.';
    const jd = 'Must know Machine Learning and Amazon Web Services.';
    const analysis = analyzeKeywordGapStrict(resume, jd);

    const mlHit = analysis.jobKeywords.find((k) => k.term === 'machine learning');
    expect(mlHit).toBeDefined();
    expect(mlHit?.kind).toBe('recognized_alias');
    expect(mlHit?.matched).toBe(true);
  });

  it('classifies component_only matches when words exist in separate segments (matched: false)', () => {
    // "project" is in segment 1 ("Built a music project"), "management" is in segment 2 ("worked under senior management")
    const resume = 'Built a music project. Worked under senior management for two years.';
    const jd = 'Required: project management experience.';
    const analysis = analyzeKeywordGapStrict(resume, jd);

    const pmHit = analysis.jobKeywords.find((k) => k.term === 'project management');
    expect(pmHit).toBeDefined();
    expect(pmHit?.kind).toBe('component_only');
    expect(pmHit?.matched).toBe(false);
    expect(analysis.missing).toContainEqual(pmHit);
    expect(analysis.matched).not.toContainEqual(pmHit);
  });

  it('classifies completely missing keywords as missing (matched: false)', () => {
    const resume = 'Skilled in HTML and CSS.';
    const jd = 'Looking for Kubernetes and Docker expertise.';
    const analysis = analyzeKeywordGapStrict(resume, jd);

    const k8sHit = analysis.jobKeywords.find((k) => k.term === 'kubernetes');
    expect(k8sHit).toBeDefined();
    expect(k8sHit?.kind).toBe('missing');
    expect(k8sHit?.matched).toBe(false);
    expect(analysis.missing).toContainEqual(k8sHit);
  });

  it('only sets matched: true for exact_phrase, normalized_phrase, or recognized_alias', () => {
    const resume = 'Built a music project. Managed teams with Python.';
    const jd = 'project management Python Kubernetes ML';
    const analysis = analyzeKeywordGapStrict(resume, jd);

    for (const hit of analysis.matched) {
      expect(['exact_phrase', 'normalized_phrase', 'recognized_alias']).toContain(hit.kind);
      expect(hit.matched).toBe(true);
    }
    for (const hit of analysis.missing) {
      expect(['component_only', 'missing']).toContain(hit.kind);
      expect(hit.matched).toBe(false);
    }
  });
});

describe('computeAtsScorecard — 6 decompressed dimensions', () => {
  const dummyDoc: ResumeDocument = {
    schemaVersion: 1,
    source: { type: 'txt', fileName: 'resume.txt' },
    rawText: 'Experienced developer in TypeScript and React.',
    normalizedText: 'experienced developer in typescript and react',
    offsetMap: [],
    sections: [
      {
        id: 'sec-1',
        kind: 'skills',
        heading: 'Skills',
        text: 'TypeScript, React, Python, Node, SQL',
        span: { coordinateSpace: 'canonical', start: 0, end: 50 },
        confidence: 0.95,
        evidence: [],
      },
      {
        id: 'sec-2',
        kind: 'experience',
        heading: 'Experience',
        text: 'Software Engineer managing projects using AWS',
        span: { coordinateSpace: 'canonical', start: 51, end: 100 },
        confidence: 0.9,
        evidence: [],
      },
    ],
    contact: { links: [] },
    diagnostics: [],
    confidence: 88,
  };

  const dummyLegibility: LegibilityAnalysis = {
    score: 92,
    flaggedLines: [],
  };

  const dummyAcronym: AcronymCoverageAnalysis = {
    singleFormAcronyms: [],
  };

  const dummySection: SectionCoverageAnalysis = {
    score: 85,
    detectedSections: ['skills', 'experience', 'education'],
    missingSections: ['summary'],
  };

  it('computes 6 explicit dimensions without an overallScore property', () => {
    const resume = 'Built a music project. Worked under senior management. Skilled in Python.';
    const jd = 'project management Python Kubernetes';
    const keywordGap = analyzeKeywordGapStrict(resume, jd);

    const scorecard = computeAtsScorecard({
      doc: dummyDoc,
      keywordGap,
      legibility: dummyLegibility,
      acronymCoverage: dummyAcronym,
      sectionCoverage: dummySection,
    });

    expect(scorecard.parseQuality).toBe(88);
    expect(scorecard.sectionCoverage).toBe(85);
    expect(scorecard.legibility).toBe(92);
    expect(typeof scorecard.literalKeywordCoverage).toBe('number');
    expect(typeof scorecard.canonicalSkillCoverage).toBe('number');
    expect(['low', 'medium', 'high']).toContain(scorecard.formattingRisk);

    // CRITICAL REQUIREMENT: ABSOLUTELY NO top-level overallScore property!
    expect(scorecard).not.toHaveProperty('overallScore');

    // Schema validation MUST pass
    const parsed = AtsScorecardSchema.safeParse(scorecard);
    expect(parsed.success).toBe(true);
  });

  it('component_only keywords contribute 0 points to literalKeywordCoverage', () => {
    // "project management" is component_only -> matched: false.
    // "Python" is exact_phrase -> matched: true.
    const resume = 'Built a music project. Worked under senior management for Python development.';
    const jd = 'project management Python'; // two keywords: project management and Python
    const keywordGap = analyzeKeywordGapStrict(resume, jd, { includeBigrams: true });

    const scorecard = computeAtsScorecard({
      doc: dummyDoc,
      keywordGap,
      legibility: dummyLegibility,
      acronymCoverage: dummyAcronym,
      sectionCoverage: dummySection,
    });

    // Python is matched, project management is component_only (0 points)
    expect(scorecard.literalKeywordCoverage).toBeGreaterThan(0);
    expect(scorecard.literalKeywordCoverage).toBeLessThan(100);
  });
});

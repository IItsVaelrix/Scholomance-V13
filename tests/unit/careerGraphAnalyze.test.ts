import { describe, expect, it } from 'vitest';
import { analyzeCareerGraph, GRAPH_DIAGNOSTIC } from '../../src/lib/career/graph/analyze-graph';
import { createSeedGraphPort, SEED_ARTIFACT_ID } from '../../src/lib/career/graph/seed-graph';
import { assertEvidenceLaw } from '../../src/lib/career/graph/evidence';
import { CareerGraphAnalysisSchema } from '../../src/lib/career/graph/schemas';

const port = createSeedGraphPort();

const DATA_SCIENCE_POSTING =
  'Data scientist required. Must have Python, SQL, machine learning, and data analysis.';
const DATA_SCIENCE_RESUME =
  'Experienced with Python and SQL databases. Built data pipelines for reporting.';

describe('analyzeCareerGraph (seed)', () => {
  it('requires occupation confirmation when several families match', () => {
    const result = analyzeCareerGraph(port, {
      resumeText: 'Python, SQL, testing, marketing.',
      jobDescriptionText:
        'We need Python, SQL, machine learning, data analysis, software testing, marketing strategy and SEO.',
    });
    expect(result.mode).toBe('graph');
    expect(result.skills).toEqual([]);
    expect(result.occupations.length).toBeGreaterThan(1);
    expect(result.diagnostics.some((d) => d.code === GRAPH_DIAGNOSTIC.OCCUPATION_CONFIRMATION_REQUIRED)).toBe(true);
  });

  it('auto-confirms when exactly one occupation passes the frontier threshold', () => {
    const result = analyzeCareerGraph(port, {
      resumeText: 'Marketing background.',
      jobDescriptionText: 'SEO and marketing strategy role.',
    });
    expect(result.occupations).toHaveLength(1);
    expect(result.occupations[0].conceptId).toBe('onet:11-2021.00');
    expect(result.diagnostics.some((d) => d.code === GRAPH_DIAGNOSTIC.OCCUPATION_CONFIRMATION_REQUIRED)).toBe(false);
    expect(result.skills.length).toBeGreaterThan(0);
  });

  it('classifies demonstrated / adjacent / missing / not_required against a confirmed role', () => {
    const result = analyzeCareerGraph(port, {
      resumeText: DATA_SCIENCE_RESUME,
      jobDescriptionText: DATA_SCIENCE_POSTING,
      confirmedOccupationId: 'onet:15-2051.00',
    });

    const byId = Object.fromEntries(result.skills.map((s) => [s.conceptId, s]));
    expect(byId['onet:skill:python'].classification).toBe('demonstrated');
    expect(byId['onet:skill:sql'].classification).toBe('demonstrated');
    // Partial résumé evidence ('data' present, 'analysis' not) → adjacent band.
    expect(byId['onet:skill:data-analysis'].classification).toBe('adjacent');
    // Required by posting, absent from résumé → genuinely missing, with posting evidence.
    expect(byId['onet:skill:machine-learning'].classification).toBe('missing');
    expect(byId['onet:skill:machine-learning'].jobEvidence.length).toBeGreaterThan(0);
    // Occupation-only skill not in the posting → never missing.
    expect(byId['onet:skill:communication'].classification).toBe('not_required');
  });

  it('never classifies an occupation-only skill as missing (evidence law)', () => {
    const result = analyzeCareerGraph(port, {
      resumeText: 'No relevant skills listed.',
      jobDescriptionText: 'Marketing strategy and SEO only.',
      confirmedOccupationId: 'onet:11-2021.00',
    });
    // Throws if any `missing` skill lacks posting evidence.
    expect(() => assertEvidenceLaw(result.skills)).not.toThrow();
    for (const skill of result.skills) {
      if (skill.classification === 'missing') {
        expect(skill.jobEvidence.length).toBeGreaterThan(0);
      }
    }
  });

  it('returns a coherent empty result when no occupation matches', () => {
    const result = analyzeCareerGraph(port, {
      resumeText: 'Underwater basket weaving.',
      jobDescriptionText: 'zzz qqq xxx',
    });
    expect(result.occupations).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.diagnostics.some((d) => d.code === GRAPH_DIAGNOSTIC.NO_OCCUPATION_MATCH)).toBe(true);
  });

  it('is deterministic and schema-valid', () => {
    const input = {
      resumeText: DATA_SCIENCE_RESUME,
      jobDescriptionText: DATA_SCIENCE_POSTING,
      confirmedOccupationId: 'onet:15-2051.00',
    };
    const a = analyzeCareerGraph(port, input);
    const b = analyzeCareerGraph(port, input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.artifactId).toBe(SEED_ARTIFACT_ID);
    expect(CareerGraphAnalysisSchema.safeParse(a).success).toBe(true);
    // No top-level ATS probability is ever produced.
    expect((a as Record<string, unknown>).overallScore).toBeUndefined();
  });

  it('always embeds the seed-demo transparency diagnostic', () => {
    const result = analyzeCareerGraph(port, {
      resumeText: 'Python.',
      jobDescriptionText: 'Python developer.',
    });
    expect(result.diagnostics.some((d) => d.code === GRAPH_DIAGNOSTIC.SEED_DEMO)).toBe(true);
  });
});

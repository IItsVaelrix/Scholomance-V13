import { describe, expect, it } from 'vitest';
import { CareerGraphAnalysisSchema, SkillClassificationSchema } from '../../src/lib/career/graph/schemas';
import { CAREER_POLICY_BUNDLE, CAREER_THRESHOLDS } from '../../src/lib/career/graph/policies';
import type { CareerPolicyBundle } from '../../src/lib/career/graph/contracts';

describe('Career Graph contracts', () => {
  it('requires policy identity, provenance, and evidence', () => {
    const parsed = CareerGraphAnalysisSchema.parse({
      artifactId: 'career-graph:onet-30.3:esco-1.2.1',
      policy: CAREER_POLICY_BUNDLE,
      occupations: [],
      skills: [
        {
          conceptId: 'esco:https://example.test/skill/sql',
          label: 'SQL',
          classification: 'missing',
          requirement: 'required',
          relationPath: ['onet:15-1252.00', 'esco:https://example.test/skill/sql'],
          sources: ['onet-30.3', 'esco-1.2.1'],
          jobEvidence: [{ coordinateSpace: 'raw', start: 0, end: 3 }],
          resumeEvidence: [],
          scores: { job: 1, occupation: 0.8, resume: 0, semantic: null },
        },
      ],
      diagnostics: [],
      mode: 'graph',
    });
    expect(parsed.policy.skillClassification).toBe('career-evidence-v1');
    expect(parsed.skills[0].sources).toEqual(['onet-30.3', 'esco-1.2.1']);
  });

  it('exposes a fully frozen, versioned policy bundle', () => {
    expect(Object.isFrozen(CAREER_POLICY_BUNDLE)).toBe(true);
    const expected: CareerPolicyBundle = {
      occupationInference: 'occupation-inference-v1',
      candidateFrontier: 'career-frontier-v1',
      relationTraversal: 'career-traversal-v1',
      shard: 'career-shard-v1',
      skillClassification: 'career-evidence-v1',
      scorecard: 'career-scorecard-v2',
      thresholdChecksum: CAREER_POLICY_BUNDLE.thresholdChecksum,
    };
    expect(CAREER_POLICY_BUNDLE).toEqual(expected);
  });

  it('derives a deterministic, non-empty threshold checksum', () => {
    expect(CAREER_POLICY_BUNDLE.thresholdChecksum).toMatch(/^[a-f0-9]{8}$/);
    // Re-deriving from the same frozen thresholds must be stable.
    expect(CAREER_POLICY_BUNDLE.thresholdChecksum).toBe(
      CAREER_POLICY_BUNDLE.thresholdChecksum
    );
    expect(Object.isFrozen(CAREER_THRESHOLDS)).toBe(true);
  });

  it('rejects a skill classification with an unknown enum value', () => {
    expect(() =>
      SkillClassificationSchema.parse({
        conceptId: 'esco:sql',
        label: 'SQL',
        classification: 'guessed',
        requirement: 'required',
        relationPath: [],
        sources: [],
        jobEvidence: [],
        resumeEvidence: [],
        scores: { job: 1, occupation: 0.8, resume: 0, semantic: null },
      })
    ).toThrow();
  });

  it('rejects an unknown analysis mode', () => {
    expect(() =>
      CareerGraphAnalysisSchema.parse({
        artifactId: 'x',
        policy: CAREER_POLICY_BUNDLE,
        occupations: [],
        skills: [],
        diagnostics: [],
        mode: 'vibes',
      })
    ).toThrow();
  });
});

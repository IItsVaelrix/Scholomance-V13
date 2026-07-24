import { describe, expect, it } from 'vitest';
import {
  inferOccupations,
  compareOccupations,
  buildSkillFrontier,
  type CareerGraphQueryPort,
  type OccupationRow,
  type SkillRelationRow,
} from '../../src/lib/career/graph/reference-query';
import { CAREER_POLICY_BUNDLE } from '../../src/lib/career/graph/policies';
import type { OccupationCandidate } from '../../src/lib/career/graph/contracts';

function makePort(rows: OccupationRow[]): CareerGraphQueryPort {
  return {
    searchOccupations: () => rows,
    relatedSkills: () => [],
  };
}

const row = (overrides: Partial<OccupationRow>): OccupationRow => ({
  conceptId: 'onet:15-1252.00',
  label: 'Software Developers',
  namespace: 'onet',
  matchKind: 'exact',
  matchScore: 1,
  sourceRelease: 'onet-30.3',
  ...overrides,
});

describe('Career Graph reference retrieval', () => {
  it('orders candidates by bucket desc, score desc, conceptId asc', () => {
    const port = makePort([
      row({ conceptId: 'onet:15-1252.00', matchKind: 'fts', matchScore: 0.9 }),
      row({ conceptId: 'onet:15-1256.00', matchKind: 'exact', matchScore: 1 }),
      row({ conceptId: 'onet:15-1251.00', matchKind: 'alias', matchScore: 0.85 }),
      row({ conceptId: 'onet:15-1250.00', matchKind: 'alias', matchScore: 0.85 }),
    ]);
    const result = inferOccupations(port, 'software developer', { policy: CAREER_POLICY_BUNDLE });
    expect(result.map((r) => r.conceptId)).toEqual([
      'onet:15-1256.00', // exact
      'onet:15-1250.00', // alias 0.85, lower conceptId first
      'onet:15-1251.00', // alias 0.85
      'onet:15-1252.00', // fts
    ]);
  });

  it('deduplicates by conceptId, keeping the strongest bucket/score', () => {
    const port = makePort([
      row({ conceptId: 'onet:15-1252.00', matchKind: 'fts', matchScore: 0.6 }),
      row({ conceptId: 'onet:15-1252.00', matchKind: 'exact', matchScore: 1 }),
    ]);
    const result = inferOccupations(port, 'software developer', { policy: CAREER_POLICY_BUNDLE });
    expect(result).toHaveLength(1);
    expect(result[0].bucket).toBe('exact');
    expect(result[0].score).toBe(1);
  });

  it('bounds the frontier to the policy maxCandidates', () => {
    const rows = Array.from({ length: 80 }, (_, i) =>
      row({ conceptId: `onet:15-${String(1000 + i)}`, matchKind: 'fts', matchScore: 0.5 })
    );
    const port = makePort(rows);
    const result = inferOccupations(port, 'developer', { policy: CAREER_POLICY_BUNDLE });
    expect(result).toHaveLength(CAREER_POLICY_BUNDLE ? 50 : 50);
  });

  it('carries deterministic provenance (relationPath and sources)', () => {
    const port = makePort([row({ conceptId: 'onet:15-1252.00', sourceRelease: 'onet-30.3' })]);
    const result = inferOccupations(port, 'software developer', { policy: CAREER_POLICY_BUNDLE });
    expect(result[0].relationPath).toEqual(['onet:15-1252.00']);
    expect(result[0].sources).toEqual(['onet-30.3']);
  });

  it('is deterministic across repeated calls', () => {
    const port = makePort([
      row({ conceptId: 'onet:b', matchKind: 'alias', matchScore: 0.8 }),
      row({ conceptId: 'onet:a', matchKind: 'alias', matchScore: 0.8 }),
    ]);
    const first = inferOccupations(port, 'x', { policy: CAREER_POLICY_BUNDLE });
    const second = inferOccupations(port, 'x', { policy: CAREER_POLICY_BUNDLE });
    expect(first).toEqual(second);
  });

  it('compareOccupations is a stable total order', () => {
    const a: OccupationCandidate = {
      conceptId: 'onet:a', label: 'A', namespace: 'onet', score: 0.8, bucket: 'alias',
      relationPath: [], sources: [], jobEvidence: [],
    };
    const b: OccupationCandidate = { ...a, conceptId: 'onet:b' };
    expect(compareOccupations(a, b)).toBeLessThan(0);
    expect(compareOccupations(b, a)).toBeGreaterThan(0);
    expect(compareOccupations(a, a)).toBe(0);
  });
});

describe('Career Graph skill frontier traversal', () => {
  const rel = (overrides: Partial<SkillRelationRow>): SkillRelationRow => ({
    conceptId: 'esco:sql',
    label: 'SQL',
    namespace: 'esco',
    requirementKind: 'required',
    importance: 0.9,
    level: 0.8,
    sourceRelease: 'esco-1.2.1',
    viaOccupation: 'onet:15-1252.00',
    ...overrides,
  });

  it('deduplicates skills by conceptId keeping the highest importance', () => {
    const port: CareerGraphQueryPort = {
      searchOccupations: () => [],
      relatedSkills: (occId) =>
        occId === 'onet:a'
          ? [rel({ conceptId: 'esco:sql', importance: 0.5, viaOccupation: 'onet:a' })]
          : [rel({ conceptId: 'esco:sql', importance: 0.95, viaOccupation: 'onet:b' })],
    };
    const frontier = buildSkillFrontier(port, ['onet:a', 'onet:b'], { policy: CAREER_POLICY_BUNDLE });
    expect(frontier).toHaveLength(1);
    expect(frontier[0].importance).toBe(0.95);
    expect(frontier[0].viaOccupation).toBe('onet:b');
  });

  it('orders the frontier by importance desc then conceptId asc', () => {
    const port: CareerGraphQueryPort = {
      searchOccupations: () => [],
      relatedSkills: () => [
        rel({ conceptId: 'esco:python', importance: 0.7 }),
        rel({ conceptId: 'esco:sql', importance: 0.9 }),
        rel({ conceptId: 'esco:aws', importance: 0.7 }),
      ],
    };
    const frontier = buildSkillFrontier(port, ['onet:a'], { policy: CAREER_POLICY_BUNDLE });
    expect(frontier.map((r) => r.conceptId)).toEqual(['esco:sql', 'esco:aws', 'esco:python']);
  });
});

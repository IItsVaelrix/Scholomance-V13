/**
 * Requirement canonicalization against the real corpus.
 *
 * The seeded evidence law carries invented concept ids (`onet:sql`, `onet:python`, …) that
 * exist in no built shard, so every suggestion the advisor emitted referenced a dangling
 * concept. The Career Graph worker already resolves real ids and hands them back on
 * `CareerGraphAnalysis.skills`; the advisor accepts that vocabulary so its suggestions
 * point at concepts that actually exist.
 */
import { describe, it, expect } from 'vitest';
import { buildRequirementLedger } from '../../src/lib/career/improve/requirement-ledger';
import { buildImprovements } from '../../src/lib/career/improve/build-improvements';
import { makeImproveDoc } from './fixtures/career-improve-doc';

const CORPUS_SKILLS = [
  { conceptId: 'esco:sql-1', label: 'SQL' },
  { conceptId: 'esco:python-1', label: 'Python' },
];

describe('requirement ledger — canonical skill vocabulary', () => {
  it('prefers a corpus concept id over the seeded law placeholder', () => {
    const reqs = buildRequirementLedger('Required: SQL.', undefined, CORPUS_SKILLS);
    const sql = reqs.find((r) => r.term === 'sql');
    expect(sql).toBeTruthy();
    expect(sql!.canonicalConceptId).toBe('esco:sql-1');
    expect(sql!.canonicalLabel).toBe('SQL');
  });

  it('resolves a law alias to the corpus concept it canonicalizes to', () => {
    // "postgres" canonicalizes to SQL via the evidence law; the id must still be the real one.
    const reqs = buildRequirementLedger('Required: Postgres.', undefined, CORPUS_SKILLS);
    const pg = reqs.find((r) => r.canonicalLabel === 'SQL');
    expect(pg).toBeTruthy();
    expect(pg!.canonicalConceptId).toBe('esco:sql-1');
  });

  it('keeps the seeded id when the corpus vocabulary does not cover the term', () => {
    const reqs = buildRequirementLedger('Required: Kubernetes.', undefined, CORPUS_SKILLS);
    const k8s = reqs.find((r) => r.canonicalLabel === 'Kubernetes');
    expect(k8s?.canonicalConceptId).toBe('onet:kubernetes');
  });

  it('stamps the corpus concept id onto the suggestions the advisor emits', () => {
    const doc = makeImproveDoc(
      'EXPERIENCE\nWrote Postgres queries to build weekly reports',
      'experience',
      'EXPERIENCE'
    );
    const sugs = buildImprovements(
      'Required: SQL and Postgres. Must have strong SQL.',
      doc,
      undefined,
      CORPUS_SKILLS
    );
    const kw = sugs.find((s) => s.type === 'keyword');
    expect(kw).toBeTruthy();
    expect(kw!.conceptId).toBe('esco:sql-1');
  });
});

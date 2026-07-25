/**
 * Skill Phrase Bridge — morphological evidence matching.
 *
 * The seeded evidence law covers five skills. Every other requirement fell back to exact
 * label matching, so an ordinary résumé produced `missing` for almost every requirement
 * and the four improvement rules (which all gate on `support !== 'missing'`) emitted
 * nothing. These tests pin the generalized matcher: inflected surface forms count as
 * evidence, partial coverage of a multi-word requirement is `adjacent` (never
 * `demonstrated`), and a single-token requirement still never yields a speculative
 * `adjacent`.
 */
import { describe, it, expect } from 'vitest';
import { bridgeEvidenceDetail } from '../../src/lib/career/improve/skill-phrase-bridge';
import type { Requirement } from '../../src/lib/career/improve/types';

function req(term: string, canonicalLabel?: string): Requirement {
  return { term, canonicalLabel, weight: 1, jdEvidence: [] };
}

describe('skill phrase bridge — morphological matching', () => {
  it('treats an inflected verb form as evidence for the requirement noun', () => {
    const result = bridgeEvidenceDetail(req('training'), 'Trained new hires on company systems');
    expect(result.tier).toBe('demonstrated');
  });

  it('matches a plural surface form against a singular requirement', () => {
    const result = bridgeEvidenceDetail(
      req('communication'),
      'Owned communications with regional stakeholders'
    );
    expect(result.tier).toBe('demonstrated');
  });

  it('reports partial coverage of a multi-word requirement as adjacent', () => {
    const result = bridgeEvidenceDetail(
      req('customer retention'),
      'Responsible for handling inbound customer calls'
    );
    expect(result.tier).toBe('adjacent');
    expect(result.matchedPhrase).toBe('customer');
  });

  it('never yields a speculative adjacent for an unmatched single-token requirement', () => {
    const result = bridgeEvidenceDetail(
      req('salesforce'),
      'Responsible for handling inbound customer calls'
    );
    expect(result.tier).toBe('none');
  });

  it('credits a bullet that literally names a skill that also has a seeded law', () => {
    // "Leadership" is seeded, but its law lists neither the bare label nor this phrasing,
    // so the law-only path scored an explicit mention as `none`.
    const result = bridgeEvidenceDetail(
      req('team leadership', 'Leadership'),
      'Leadership of the regional rollout'
    );
    expect(result.tier).toBe('demonstrated');
  });

  it('still refuses to treat querying a database as SQL authorship', () => {
    const result = bridgeEvidenceDetail(req('sql', 'SQL'), 'Queried the reporting database daily');
    expect(result.tier).toBe('adjacent');
  });
});

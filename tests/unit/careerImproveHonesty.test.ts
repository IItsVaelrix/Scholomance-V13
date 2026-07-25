import { describe, it, expect } from 'vitest';
import {
  extractClaim,
  assertClaimPreserved,
  roleOfVerb,
  PERMITS,
} from '../../src/lib/career/improve/honesty/claim-preservation';
import { assertTokenProvenance } from '../../src/lib/career/improve/honesty/token-provenance';
import { bridgeEvidence } from '../../src/lib/career/improve/skill-phrase-bridge';
import type { Requirement } from '../../src/lib/career/improve/types';

const SPAN = { coordinateSpace: 'raw' as const, start: 0, end: 10 };
const sqlReq: Requirement = { term: 'sql', canonicalLabel: 'SQL', weight: 1, jdEvidence: [] };

describe('honesty guard — §5.3 worked example (ownership falsification)', () => {
  const before = 'Assisted a manager in training 15 agents.';
  const after = 'Managed and trained 15 agents.';

  it('token provenance ALONE would pass the escalation (proving it is insufficient)', () => {
    // managed/trained are strong verbs, 15 is numeric, agents is from before, and is closed.
    expect(assertTokenProvenance(before, after, []).ok).toBe(true);
  });

  it('derives role support from "assisted" and owner from "managed"', () => {
    expect(roleOfVerb('assisted')).toBe('support');
    expect(roleOfVerb('managed')).toBe('owner');
    expect(extractClaim(before, SPAN)?.role).toBe('support');
    expect(extractClaim(after, SPAN)?.role).toBe('owner');
  });

  it('claim preservation REJECTS the support→owner escalation', () => {
    const beforeClaim = extractClaim(before, SPAN)!;
    const afterClaim = extractClaim(after, SPAN)!;
    const verdict = assertClaimPreserved(beforeClaim, afterClaim, PERMITS.vocabulary);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('role_support_to_owner');
  });

  it('also rejects the reverse downgrade (owner→support)', () => {
    const beforeClaim = extractClaim(after, SPAN)!; // "Managed..." = owner
    const afterClaim = extractClaim(before, SPAN)!; // "Assisted..." = support
    const verdict = assertClaimPreserved(beforeClaim, afterClaim, PERMITS.vocabulary);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('role_owner_to_support');
  });
});

describe('honesty guard — metric binding (test 2)', () => {
  it('rejects re-binding a stated metric to a different object', () => {
    const before = 'Drove a 15% revenue increase across the region.';
    const after = 'Drove a 15% engagement increase across the region.';
    const beforeClaim = extractClaim(before, SPAN)!;
    const afterClaim = extractClaim(after, SPAN)!;
    expect(beforeClaim.quantity?.bindsTo).toBe('revenue');
    expect(afterClaim.quantity?.bindsTo).toBe('engagement');
    const verdict = assertClaimPreserved(beforeClaim, afterClaim, PERMITS.vocabulary);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('quantity_rebind');
  });

  it('accepts a like-for-like vocabulary swap that preserves role and metric', () => {
    const before = 'Wrote Postgres queries to build weekly reports.';
    const after = 'Wrote SQL/Postgres queries to build weekly reports.';
    const beforeClaim = extractClaim(before, SPAN)!;
    const afterClaim = extractClaim(after, SPAN)!;
    expect(assertClaimPreserved(beforeClaim, afterClaim, PERMITS.vocabulary).ok).toBe(true);
  });
});

describe('honesty guard — token provenance (test: fabrication rejected)', () => {
  it('rejects an after that introduces an un-provenanced content word', () => {
    const before = 'Wrote Postgres queries to build weekly reports.';
    const after = 'Wrote Postgres queries to build Kubernetes dashboards.'; // "kubernetes"/"dashboards" not in before/allowed
    expect(assertTokenProvenance(before, after, []).ok).toBe(false);
  });

  it('accepts an after whose new word comes from the allowed canonical label', () => {
    const before = 'Wrote Postgres queries to build weekly reports.';
    const after = 'Wrote SQL/Postgres queries to build weekly reports.';
    expect(assertTokenProvenance(before, after, ['SQL']).ok).toBe(true);
  });
});

describe('skill phrase bridge — tool inference (test 3)', () => {
  it('"queried the database" is adjacent, NEVER demonstrated SQL', () => {
    expect(bridgeEvidence(sqlReq, 'Queried the database for ad-hoc analysis.')).toBe('adjacent');
  });

  it('a relational vendor (Postgres) IS demonstrated SQL', () => {
    expect(bridgeEvidence(sqlReq, 'Wrote Postgres queries to build weekly reports.')).toBe(
      'demonstrated'
    );
  });

  it('explicit "SQL" is demonstrated', () => {
    expect(bridgeEvidence(sqlReq, 'Authored SQL stored procedures for billing.')).toBe(
      'demonstrated'
    );
  });

  it('no database evidence at all is none', () => {
    expect(bridgeEvidence(sqlReq, 'Led a team of five engineers.')).toBe('none');
  });

  it('unknown skills fall back to label-token exact match, never speculative adjacent', () => {
    const terraform: Requirement = { term: 'terraform', canonicalLabel: 'Terraform', weight: 1, jdEvidence: [] };
    expect(bridgeEvidence(terraform, 'Provisioned infrastructure with Terraform.')).toBe('demonstrated');
    expect(bridgeEvidence(terraform, 'Provisioned infrastructure in the cloud.')).toBe('none');
  });
});

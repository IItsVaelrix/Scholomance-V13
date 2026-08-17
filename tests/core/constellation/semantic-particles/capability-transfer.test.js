/**
 * T4 — Provenance and recursive-privilege isotopes.
 *
 * Production change that would make these fail: a preservative edge minting
 * adjunctEligible, a transfer keyed by POS density, or agenda order changing
 * the capability set.
 */
import { describe, expect, it } from 'vitest';

import {
  admitBond,
  clauseProvenance,
  imperativeLiftProvenance,
} from '../../../../codex/core/constellation/bond-admission.js';
import { BONDS, LIFTS } from '../../../../codex/core/constellation/compose.js';
import {
  CAPABILITY_KEYS,
  capabilitiesAgreeWithProvenance,
  censusPrivilegeCycles,
  classifyRule,
  transferCapabilities,
} from '../../../../codex/core/constellation/semantic-particles/capability-transfer.js';

describe('capability particles', () => {
  it('names capabilities as an explicit lattice, not a POS inventory', () => {
    expect(CAPABILITY_KEYS).toEqual([
      'rootEligible',
      'adjunctEligible',
      'recursiveEligible',
      'matrixHeadEligible',
      'clauseOrigin',
      'semanticSource',
      'promotionEvidence',
    ]);
  });

  it('classifies rules as constructive, preservative, recursive-preservative, or lift', () => {
    expect(classifyRule({ bond: ['NP', 'VP', 'S', 1] }).kind).toBe('constructive');
    expect(classifyRule({ bond: ['ADJ', 'N', 'N', 1] }).kind).toBe('preservative');
    expect(classifyRule({ bond: ['ADV', 'S', 'S', 1] }).kind).toBe('recursive-preservative');
    expect(classifyRule({ lift: 'S', src: 'VP' }).kind).toBe('lift');
  });

  it('a preservative edge may preserve or reduce privilege — never create it', () => {
    const barren = {
      rootEligible: false,
      adjunctEligible: false,
      recursiveEligible: false,
      matrixHeadEligible: false,
      clauseOrigin: null,
    };
    const out = transferCapabilities(barren, barren, { bond: ['ADJ', 'N', 'N', 1] });
    expect(out.rootEligible).toBe(false);
    expect(out.adjunctEligible).toBe(false);
    expect(out.recursiveEligible).toBe(false);
  });

  it('the VP→S lift stamps imperative origin and withholds adjunct privilege', () => {
    const child = { rootEligible: false, adjunctEligible: false, recursiveEligible: false };
    const out = transferCapabilities(child, null, { lift: 'S', src: 'VP' });
    expect(out.clauseOrigin).toBe('imperative');
    expect(out.rootEligible).toBe(true);
    expect(out.adjunctEligible).toBe(false);
    expect(out).toMatchObject(imperativeLiftProvenance());
  });

  it('NP+VP constructs a real clause; ADJ+S cannot consume an imperative child', () => {
    const constructed = transferCapabilities(
      { rootEligible: false, adjunctEligible: false },
      { rootEligible: false, adjunctEligible: false },
      { bond: ['NP', 'VP', 'S', 1] },
    );
    expect(constructed.adjunctEligible).toBe(true);
    expect(constructed.clauseOrigin).toBe('subject-predicate');

    const imperative = transferCapabilities(
      { rootEligible: false },
      { rootEligible: true, adjunctEligible: false, clauseOrigin: 'imperative' },
      { bond: ['ADJ', 'S', 'S', 1] },
    );
    expect(imperative.adjunctEligible).toBe(false);
    expect(imperative.clauseOrigin).toBe('imperative');
  });

  it('agrees with the standing clauseProvenance function on S-building bonds', () => {
    const left = { type: 'NP', from: 0, to: 0, derivations: [] };
    const right = { type: 'VP', from: 1, to: 1, derivations: [] };
    const bond = ['NP', 'VP', 'S', 1];
    expect(capabilitiesAgreeWithProvenance(left, right, bond)).toBe(true);
    expect(clauseProvenance(left, right, bond).adjunctEligible).toBe(true);
  });

  it('static cycle census rejects a transfer that increases privilege without construction', () => {
    const standing = censusPrivilegeCycles(BONDS, LIFTS);
    expect(standing.ok).toBe(true);
    expect(standing.violations).toEqual([]);

    const forged = [['ADJ', 'S', 'S', 1]];
    const bad = censusPrivilegeCycles(forged, [], {
      transfers: {
        'ADJ+S->S': () => ({
          rootEligible: true,
          adjunctEligible: true,
          recursiveEligible: true,
          clauseOrigin: 'laundered',
        }),
      },
    });
    expect(bad.ok).toBe(false);
    expect(bad.violations.some((v) => v.rule === 'ADJ+S->S')).toBe(true);
  });

  it('admission of an imperative adjunct is still a bond-admission decision, not a particle one', () => {
    const adj = { type: 'ADJ', from: 0, to: 0 };
    const imperative = {
      type: 'S',
      from: 1,
      to: 1,
      derivations: [{ lift: 'S', adjunctEligible: false, clauseOrigin: 'imperative' }],
    };
    expect(admitBond(adj, imperative, ['ADJ', 'S', 'S', 1]).ok).toBe(false);
  });
});

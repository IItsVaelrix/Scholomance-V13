/**
 * GATE PRESSURE — the multi-candidate half of Phase 0.
 *
 * The governors emit unary deflections: one candidate, one source, magnitude
 * 1.0. Over a corpus that is a one-hot across nine rule categories, and a fit
 * over it can only learn which rules over-fire. The separability criterion is
 * about ranking among RIVALS, so it needs receipts that have rivals — which
 * only the CLI gate produces.
 *
 * These tests guard the two properties that make those receipts usable:
 * the vector actually varies across candidates, and every source names a
 * producer that is not the ranker (F10).
 */

import { describe, it, expect } from 'vitest';

import { candidatePressure, gateCandidates, LAW_PRESSURE } from '../../codex/core/semantic-calculus/gate-pressure.ts';
import { normalizeSteerReceipt, phase0FieldChecksum, SCHEMA } from '../../codex/core/semantic-calculus/steer-ledger.ts';

const input = (over = {}) => ({
  key: 'build:app',
  score: 1,
  effect: 'mutate',
  lawDecision: 'allow',
  confirmationsRequired: 0,
  ...over,
});

describe('candidatePressure — four sources from four independent producers', () => {
  it('derives each source from its own producer', () => {
    const c = candidatePressure(input({ effect: 'mutate', lawDecision: 'escalate', confirmationsRequired: 1, score: 0.5 }));
    expect(c.pressure).toEqual({ destructive: 1, authorization: 1, law: 0.7, goal: -0.5 });
    expect(c.provenance).toEqual({
      destructive: 'cliLexicon.classify',
      authorization: 'utterance.confirmationsRequired',
      law: 'kind.adjudicateLaw',
      goal: 'proposer.lexicalProposer',
    });
  });

  it('a read candidate carries no destructive pressure', () => {
    expect(candidatePressure(input({ effect: 'read' })).pressure.destructive).toBe(0);
  });

  it('goal is attraction: never positive, and never the dominant source', () => {
    // Reporting goal as dominant would read as "the goal blocked this".
    const c = candidatePressure(input({ effect: 'read', lawDecision: 'allow', confirmationsRequired: 0, score: 1 }));
    expect(c.pressure.goal).toBeLessThanOrEqual(0);
    expect(c.dominant_source).not.toBe('goal');
  });
  // MUTATION: emit `goal: clampScore(score)` (drop the sign). Must go red —
  // measured, 4 tests fail.
  //
  // HONEST NOTE, recorded rather than papered over. The obvious mutation —
  // adding 'goal' to the `resistive` list — leaves the suite GREEN, because
  // goal is always <= 0 and every real pressure is always >= 0, so a strict
  // `>` comparison can never select it. That exclusion is therefore inert:
  // the property is enforced by the SIGN CONVENTION, not by the list. It is
  // kept because it documents intent, but no test can fail on it, and
  // claiming otherwise would be a check that cannot fail. The convention
  // itself is load-bearing and is guarded above and by the ledger below.

  it('the ledger refuses a positive goal — the convention is enforced downstream too', () => {
    expect(() => normalizeSteerReceipt({
      schema: SCHEMA,
      utterance: 'x',
      candidates: [{
        key: 'k', pressure: { goal: 0.5 }, result: 'PERMITTED',
        dominant_source: 'goal', gate_considered: null,
      }],
      selected_trajectory: 'k', verdict: 'PERMITTED', outcome: null,
      field_checksum: phase0FieldChecksum(),
    })).toThrow(/goal is attraction and must be <= 0/);
  });

  it('law pressure is ordinal and only block reaches the ridge ceiling', () => {
    expect(LAW_PRESSURE.allow).toBe(0);
    expect(LAW_PRESSURE.block).toBe(1);
    expect(LAW_PRESSURE.clarify).toBeLessThan(LAW_PRESSURE.escalate);
    expect(LAW_PRESSURE.escalate).toBeLessThan(LAW_PRESSURE.block);
  });

  it('refuses a proposer score outside 0..1 rather than clamping it', () => {
    // Silently clamping would hide a producer contract change — the exact
    // shape of defect this repository keeps finding.
    expect(() => candidatePressure(input({ score: 1.5 }))).toThrow(/producer contract changed/);
    expect(() => candidatePressure(input({ score: -0.1 }))).toThrow(/producer contract changed/);
  });
  // MUTATION: replace the throw with Math.min(1, Math.max(0, score)). Must go red.
});

describe('gate receipts are what the governors could not produce', () => {
  const rivals = [
    input({ key: 'build:app', score: 1, effect: 'mutate', lawDecision: 'allow' }),
    input({ key: 'deploy', score: 0.5, effect: 'mutate', lawDecision: 'escalate', confirmationsRequired: 2 }),
    input({ key: 'preview', score: 0.25, effect: 'read', lawDecision: 'allow' }),
  ];

  it('produces a receipt with rivals whose vectors actually differ', () => {
    const candidates = gateCandidates(rivals);
    expect(candidates).toHaveLength(3);
    for (const source of ['destructive', 'authorization', 'law', 'goal']) {
      const distinct = new Set(candidates.map((c) => c.pressure[source]));
      expect(distinct.size, `${source} must vary across rivals`).toBeGreaterThan(1);
    }
  });
  // MUTATION: return only the top candidate. Must go red — and this is
  // precisely the r3 shape the audit rejected.

  it('the receipt validates against the ledger contract', () => {
    expect(() => normalizeSteerReceipt({
      schema: SCHEMA,
      utterance: 'build the app',
      candidates: gateCandidates(rivals),
      selected_trajectory: 'build:app',
      verdict: 'PERMITTED',
      outcome: null,
      field_checksum: phase0FieldChecksum(),
    })).not.toThrow();
  });

  it('a gate that refused to pick is STALLED and selects nothing', () => {
    // Clarify and Theory are real STALLED outcomes that are NOT governor
    // blocks — the contrast the r3 corpus had no examples of.
    expect(() => normalizeSteerReceipt({
      schema: SCHEMA,
      utterance: 'too close to call',
      candidates: gateCandidates(rivals),
      selected_trajectory: null,
      verdict: 'STALLED',
      outcome: null,
      field_checksum: phase0FieldChecksum(),
    })).not.toThrow();
  });
});

/**
 * STEER LEDGER — Phase 0 of the Pressure Field Governor PDR.
 *
 * The ledger is the experiment the field must pass before it is built:
 * append-only deflection receipts + resolution rows that can mark a
 * deflection WRONG. These tests guard the discipline that makes the data
 * calibratable rather than decorative (PDR §3.1 F8a, §15):
 *
 *   - append-only: resolutions never mutate evaluation rows
 *   - outcome:null is invisible to the calibrator's view
 *   - malformed rows are loud (strict) or counted (non-strict)
 *   - resolutions reference only existing receipts
 *   - the cross-language contract: a Python-written row verifies here
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  SCHEMA, RESOLVE_SCHEMA, OUTCOMES, PRESSURE_SOURCES,
  CATEGORY_PRESSURE, DEFAULT_LEDGER_PATH, phase0FieldChecksum,
  normalizeSteerReceipt, normalizeResolution,
  appendSteerReceipt, appendResolution, readLedger, verifyLedger,
  nextSteerId, resolvedReceipts,
} from '../../codex/core/semantic-calculus/steer-ledger.ts';

// Vitest runs from the repo root; the fixture is committed beside these tests.
const PYTHON_FIXTURE = resolve(process.cwd(), 'tests/semantic-calculus/fixtures/steer-row-from-python.jsonl');

let ledger;
beforeEach(() => {
  ledger = join(mkdtempSync(join(tmpdir(), 'steer-')), 'steer-receipts.jsonl');
});

/** A minimal valid Phase 0 deflection receipt. */
const receipt = (over = {}) => ({
  schema: SCHEMA,
  utterance: 'where is the parser',
  candidates: [{
    key: 'search:where is the parser',
    pressure: { regression: 1.0 },
    result: 'DEFLECTED',
    dominant_source: 'regression',
    gate_considered: null,
    governor: 'search',
    category: 'REPEATED_SEARCH',
    tier: 'Y2',
  }],
  selected_trajectory: null,
  verdict: 'STALLED',
  outcome: null,
  field_checksum: phase0FieldChecksum(),
  ...over,
});

describe('write + read round trip', () => {
  it('assigns monotonic zero-padded ids', () => {
    const a = appendSteerReceipt(receipt(), ledger);
    const b = appendSteerReceipt(receipt({ utterance: 'second deflection' }), ledger);
    expect(a.id).toBe('steer-000001');
    expect(b.id).toBe('steer-000002');
    expect(nextSteerId(ledger)).toBe('steer-000003');
  });

  it('reads back what it wrote', () => {
    appendSteerReceipt(receipt(), ledger);
    const { receipts, resolutions, skipped } = readLedger(ledger);
    expect(receipts).toHaveLength(1);
    expect(resolutions).toHaveLength(0);
    expect(skipped).toBe(0);
    expect(receipts[0].verdict).toBe('STALLED');
    expect(receipts[0].candidates[0].pressure.regression).toBe(1.0);
  });

  it('an absent ledger is empty, not an error', () => {
    expect(readLedger(join(tmpdir(), 'does-not-exist.jsonl')).rows).toHaveLength(0);
    expect(verifyLedger(join(tmpdir(), 'does-not-exist.jsonl')).ok).toBe(true);
  });
});

describe('append-only discipline', () => {
  it('a resolution appends a row and never mutates the evaluation row', () => {
    appendSteerReceipt(receipt(), ledger);
    const beforeLines = readFileSync(ledger, 'utf8').split('\n').filter(Boolean);

    appendResolution({
      schema: RESOLVE_SCHEMA,
      steer_id: 'steer-000001',
      outcome: 'deflection_was_wrong',
      deflected_candidate: 'search:where is the parser',
      note: 'the prior result had been deleted; the search was needed',
    }, ledger);

    const afterLines = readFileSync(ledger, 'utf8').split('\n').filter(Boolean);
    expect(afterLines).toHaveLength(2);
    expect(afterLines[0]).toBe(beforeLines[0]); // byte-identical, untouched
    expect(JSON.parse(afterLines[1]).schema).toBe(RESOLVE_SCHEMA);
  });

  it('multiple resolutions keep history; the last one is current', () => {
    appendSteerReceipt(receipt(), ledger);
    appendResolution({ schema: RESOLVE_SCHEMA, steer_id: 'steer-000001', outcome: 'succeeded', deflected_candidate: null, note: '' }, ledger);
    appendResolution({ schema: RESOLVE_SCHEMA, steer_id: 'steer-000001', outcome: 'regressed', deflected_candidate: null, note: 'revised after the breakage surfaced' }, ledger);
    const { rows } = readLedger(ledger);
    const resolved = resolvedReceipts(rows);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].outcome).toBe('regressed');
  });
});

describe('F8a — outcome null is invisible', () => {
  it('an unresolved receipt never reaches the calibrator view', () => {
    appendSteerReceipt(receipt(), ledger);
    appendSteerReceipt(receipt({ utterance: 'resolved one' }), ledger);
    appendResolution({ schema: RESOLVE_SCHEMA, steer_id: 'steer-000002', outcome: 'succeeded', deflected_candidate: null, note: '' }, ledger);

    const { rows } = readLedger(ledger);
    const resolved = resolvedReceipts(rows);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].receipt.id).toBe('steer-000002');
    expect(resolved[0].outcome).toBe('succeeded');
  });

  it('an evaluation row carrying a non-null outcome is refused at write', () => {
    expect(() => appendSteerReceipt(receipt({ outcome: 'succeeded' }), ledger))
      .toThrow(/must be null on an evaluation row/);
  });
});

describe('malformed rows are loud', () => {
  it('strict read throws with the line number', () => {
    appendSteerReceipt(receipt(), ledger);
    appendFileSync(ledger, '{"schema":"PB-STEER-v1","id":"broken\n');
    expect(() => readLedger(ledger)).toThrow(/malformed row at line 2/);
  });

  it('non-strict read counts skips instead of dying', () => {
    appendSteerReceipt(receipt(), ledger);
    appendFileSync(ledger, 'not json at all\n');
    const { receipts, skipped } = readLedger(ledger, { strict: false });
    expect(receipts).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('an unknown schema is malformed', () => {
    appendFileSync(ledger, '{"schema":"PB-UNKNOWN-v9"}\n');
    expect(() => readLedger(ledger)).toThrow(/malformed row at line 1/);
  });
});

describe('resolution referential integrity', () => {
  it('a resolution for a receipt that never existed is refused', () => {
    expect(() => appendResolution({
      schema: RESOLVE_SCHEMA, steer_id: 'steer-000042', outcome: 'succeeded',
      deflected_candidate: null, note: '',
    }, ledger)).toThrow(/no receipt with id "steer-000042"/);
  });

  it('a malformed steer id is refused', () => {
    expect(() => appendResolution({
      schema: RESOLVE_SCHEMA, steer_id: 'steer-7', outcome: 'succeeded',
      deflected_candidate: null, note: '',
    }, ledger)).toThrow(/steer_id/);
  });

  it('the outcome vocabulary is closed', () => {
    appendSteerReceipt(receipt(), ledger);
    expect(() => appendResolution({
      schema: RESOLVE_SCHEMA, steer_id: 'steer-000001', outcome: 'felt_bad',
      deflected_candidate: null, note: '',
    }, ledger)).toThrow(/outcome/);
    expect(OUTCOMES).toContain('deflection_was_wrong');
  });

  it('deflection_was_wrong must name WHICH deflection was wrong', () => {
    appendSteerReceipt(receipt(), ledger);
    expect(() => appendResolution({
      schema: RESOLVE_SCHEMA, steer_id: 'steer-000001',
      outcome: 'deflection_was_wrong', deflected_candidate: null, note: '',
    }, ledger)).toThrow(/deflected_candidate.*required/);
  });
});

describe('pressure vocabulary (F1, F10)', () => {
  it('unknown pressure sources are refused', () => {
    const bad = receipt();
    bad.candidates = [{ ...bad.candidates[0], pressure: { vibes: 1.0 }, dominant_source: 'vibes' }];
    expect(() => appendSteerReceipt(bad, ledger)).toThrow(/unknown pressure source "vibes"/);
  });

  it('goal is attraction (<= 0); other sources are pressure (>= 0)', () => {
    const g = receipt();
    g.candidates = [{ ...g.candidates[0], pressure: { goal: 0.5 }, dominant_source: 'goal' }];
    expect(() => appendSteerReceipt(g, ledger)).toThrow(/goal is attraction/);

    const p = receipt();
    p.candidates = [{ ...p.candidates[0], pressure: { scope: -0.2 }, dominant_source: 'scope' }];
    expect(() => appendSteerReceipt(p, ledger)).toThrow(/out of range/);
  });

  it('dominant_source must name a measured source', () => {
    const d = receipt();
    d.candidates = [{ ...d.candidates[0], dominant_source: 'law' }]; // law not in pressure
    expect(() => appendSteerReceipt(d, ledger)).toThrow(/dominant_source/);
  });

  it('every Phase 0 category maps to a real pressure source', () => {
    for (const [category, source] of Object.entries(CATEGORY_PRESSURE)) {
      expect(PRESSURE_SOURCES).toContain(source);
      expect(category.length).toBeGreaterThan(0);
    }
  });
});

describe('receipt shape law', () => {
  it('a STALLED receipt cannot select a trajectory (§9.2)', () => {
    expect(() => appendSteerReceipt(receipt({ selected_trajectory: 'some-corridor' }), ledger))
      .toThrow(/STALLED receipt cannot select/);
  });

  it('field_checksum must be 12 hex chars', () => {
    expect(() => appendSteerReceipt(receipt({ field_checksum: 'nope' }), ledger))
      .toThrow(/field_checksum/);
  });
});

describe('checksums', () => {
  it('capturedAt is metadata only: rewriting it does not break verification', () => {
    appendSteerReceipt(receipt(), ledger);
    const original = readFileSync(ledger, 'utf8');
    const rewound = original.replace(/"capturedAt":"[^"]*"/, '"capturedAt":"1999-01-01T00:00:00.000Z"');
    expect(rewound).not.toBe(original); // the rewrite happened
    writeFileSync(ledger, rewound);
    expect(verifyLedger(ledger).ok).toBe(true); // checksum ignores capturedAt
  });

  it('different ids mean different checksums', () => {
    appendSteerReceipt(receipt(), ledger);
    appendSteerReceipt(receipt(), ledger);
    const [a, b] = readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    expect(a.checksum).not.toBe(b.checksum); // id participates
  });

  it('tampering is detected by verifyLedger', () => {
    appendSteerReceipt(receipt(), ledger);
    const tampered = readFileSync(ledger, 'utf8').replace('"regression":1.0', '"regression":0.5');
    writeFileSync(ledger, tampered);
    const { ok, bad } = verifyLedger(ledger);
    expect(ok).toBe(false);
    expect(bad[0].reason).toMatch(/checksum mismatch/);
  });

  it('a clean ledger verifies', () => {
    appendSteerReceipt(receipt(), ledger);
    appendResolution({ schema: RESOLVE_SCHEMA, steer_id: 'steer-000001', outcome: 'needed_rework', deflected_candidate: null, note: '' }, ledger);
    expect(verifyLedger(ledger).ok).toBe(true);
  });
});

describe('cross-language contract — the Python-written row verifies here', () => {
  it('the committed fixture passes verification and parses', () => {
    const { ok, bad } = verifyLedger(PYTHON_FIXTURE);
    expect(bad).toHaveLength(0);
    expect(ok).toBe(true);

    const { receipts } = readLedger(PYTHON_FIXTURE);
    expect(receipts).toHaveLength(1);
    const row = receipts[0];
    expect(row.id).toBe('steer-000001');
    expect(row.candidates[0].governor).toBe('search');
    expect(row.candidates[0].category).toBe('REPEATED_SEARCH');
    expect(row.candidates[0].pressure.regression).toBe(1.0);
    // The fixture drifts if either emitter's key order, float repr, or
    // escaping changes — that is the alarm this test exists to ring.
    expect(row.field_checksum).toBe(phase0FieldChecksum());
  });

  it('the default ledger path sits under the corpus, not beside the module', () => {
    expect(DEFAULT_LEDGER_PATH.endsWith(join('bench', 'semantic-calculus', 'corpus', 'steer-receipts.jsonl'))).toBe(true);
  });
});

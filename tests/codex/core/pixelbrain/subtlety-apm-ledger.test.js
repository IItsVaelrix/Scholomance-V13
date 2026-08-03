/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../../../codex/core/pixelbrain/canonical-json.js';
import { sha256Hex } from '../../../../codex/core/pixelbrain/sha256.js';
import {
  buildEventChronicle,
  parseResonanceSnapshot,
  stableEventKey,
} from '../../../../codex/core/pixelbrain/subtlety-apm-ledger.js';

function seal(body) {
  return { ...body, checksum: sha256Hex(canonicalStringify(body)) };
}

function fingerprint(at, unitId, context, buildId = 'b1') {
  const payload = seal({
    schema: 'SUBTLETY-FINGERPRINT-v1',
    identity: { unitId, runtimeProfile: context.runtime },
    execution: { runtimeProfile: context.runtime, buildId },
    fingerprint: { emits: [`thread.crash.${context.errorType}`] },
  });
  return seal({
    schema: 'SUBTLETY-RESONANCE-RECORD-v2',
    recordedAt: at,
    kind: 'fingerprint',
    payload,
    context: {
      schema: 'SUBTLETY-OBSERVATION-CONTEXT-v1',
      ...context,
    },
  });
}

function assessment(at, unitId, driftStatus) {
  return seal({
    schema: 'SUBTLETY-RESONANCE-RECORD-v1',
    recordedAt: at,
    kind: 'assessment',
    payload: {
      unitId,
      drift: { status: driftStatus },
      seam: { violations: [] },
      recovery: { proposals: [] },
    },
  });
}

function ledger(rows) {
  return `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
}

const context = {
  runtime: 'divtube-tui',
  errorType: 'NoActiveAppError',
  message: 'boom',
  topFrame: 'app.py:284',
  thread: 'Thread-32',
};

describe('Subtlety APM ledger projection', () => {
  it('defers a partial tail and isolates invalid complete rows', () => {
    const valid = fingerprint('2026-08-03T10:15:00.000Z', 'crash.tui', context);
    const badChecksum = {
      ...fingerprint('2026-08-03T10:20:00.000Z', 'crash.tui', context),
      checksum: '0'.repeat(64),
    };
    const future = fingerprint('2026-08-03T12:00:00.000Z', 'crash.tui', context);
    const ledgerText = `${JSON.stringify(valid)}\n{bad json}\n${JSON.stringify(badChecksum)}\n${JSON.stringify(future)}\n{"schema":`;

    const parsed = parseResonanceSnapshot({
      ledgerText,
      cutoffMs: Date.parse('2026-08-03T11:00:00.000Z'),
    });

    expect(parsed.records).toHaveLength(1);
    expect(parsed.warnings.map((warning) => warning.code)).toEqual([
      'FUTURE_TIMESTAMP',
      'INCOMPLETE_TRAILING_ROW',
      'INVALID_OUTER_CHECKSUM',
      'MALFORMED_ROW',
    ]);
  });

  it('associates the nearest preceding same-unit assessment without incrementing count', () => {
    const rows = [
      fingerprint('2026-08-03T09:10:00.000Z', 'crash.tui', context),
      assessment('2026-08-03T09:10:01.000Z', 'crash.tui', 'stable'),
      fingerprint('2026-08-03T10:20:00.000Z', 'crash.tui', { ...context, message: 'changed' }),
      assessment('2026-08-03T10:20:01.000Z', 'crash.tui', 'drifting'),
    ];

    const chronicle = buildEventChronicle(parseResonanceSnapshot({
      ledgerText: ledger(rows),
      cutoffMs: Date.parse('2026-08-03T11:00:00.000Z'),
    }));

    expect(chronicle.events).toHaveLength(1);
    expect(chronicle.events[0].occurrences).toHaveLength(2);
    expect(chronicle.events[0].occurrences[0].assessment.payload.drift.status).toBe('stable');
    expect(chronicle.events[0].occurrences[1].assessment.payload.drift.status).toBe('drifting');
  });

  it('uses deterministic reduced-precision fallback for v1 fingerprints', () => {
    const v2 = fingerprint('2026-08-03T10:15:00.000Z', 'crash.tui', context);
    const { context: removedContext, checksum: removedChecksum, ...legacyBody } = v2;
    const legacy = seal({ ...legacyBody, schema: 'SUBTLETY-RESONANCE-RECORD-v1' });

    const parsed = parseResonanceSnapshot({
      ledgerText: ledger([legacy]),
      cutoffMs: Date.parse('2026-08-03T11:00:00.000Z'),
    });

    expect(parsed.fingerprints[0].context).toMatchObject({
      runtime: 'divtube-tui',
      errorType: 'NoActiveAppError',
      message: '',
      topFrame: 'unknown',
      thread: '',
    });
    expect(parsed.warnings.map((warning) => warning.code)).toContain('LEGACY_CONTEXT');
  });

  it('derives identity from runtime, unit, error type, and top frame only', () => {
    const base = stableEventKey({ ...context, unitId: 'crash.tui' });
    const changedMessage = stableEventKey({ ...context, message: 'different', unitId: 'crash.tui' });
    const changedFrame = stableEventKey({ ...context, topFrame: 'app.py:300', unitId: 'crash.tui' });

    expect(changedMessage).toBe(base);
    expect(changedFrame).not.toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is invariant to complete input-row order', () => {
    const rows = [
      assessment('2026-08-03T10:20:01.000Z', 'crash.tui', 'drifting'),
      fingerprint('2026-08-03T09:10:00.000Z', 'crash.tui', context),
      fingerprint('2026-08-03T10:20:00.000Z', 'crash.tui', { ...context, message: 'changed' }),
      assessment('2026-08-03T09:10:01.000Z', 'crash.tui', 'stable'),
    ];
    const orders = [
      rows,
      [...rows].reverse(),
      [rows[1], rows[3], rows[0], rows[2]],
      [rows[2], rows[0], rows[3], rows[1]],
    ];
    const projections = orders.map((ordered) => {
      const parsed = parseResonanceSnapshot({
        ledgerText: ledger(ordered),
        cutoffMs: Date.parse('2026-08-03T11:00:00.000Z'),
      });
      const chronicle = buildEventChronicle(parsed);
      return {
        sourceRecordSetChecksum: parsed.sourceRecordSetChecksum,
        warnings: parsed.warnings,
        events: chronicle.events.map((event) => ({
          key: event.key,
          occurrences: event.occurrences.map((occurrence) => ({
            atMs: occurrence.atMs,
            drift: occurrence.assessment?.payload?.drift?.status,
          })),
        })),
      };
    });

    expect(projections.every((projection) => (
      JSON.stringify(projection) === JSON.stringify(projections[0])
    ))).toBe(true);
  });
});

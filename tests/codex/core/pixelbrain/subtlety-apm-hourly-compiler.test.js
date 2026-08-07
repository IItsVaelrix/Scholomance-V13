/* @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../../../codex/core/pixelbrain/canonical-json.js';
import { sha256Hex } from '../../../../codex/core/pixelbrain/sha256.js';
import {
  compileHourlyReport,
  discoverCompletedActiveWindows,
} from '../../../../codex/core/pixelbrain/subtlety-apm-hourly-compiler.js';
import { localHourWindowContaining } from '../../../../codex/core/pixelbrain/subtlety-apm-hour-window.js';
import { stableEventKey } from '../../../../codex/core/pixelbrain/subtlety-apm-ledger.js';

const previousTz = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/New_York'; });
afterAll(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

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
    context: { schema: 'SUBTLETY-OBSERVATION-CONTEXT-v1', ...context },
  });
}

function assessment(at, unitId) {
  return seal({
    schema: 'SUBTLETY-RESONANCE-RECORD-v1',
    recordedAt: at,
    kind: 'assessment',
    payload: {
      unitId,
      drift: { status: 'drifting' },
      seam: { violations: [{ code: 'SEAM-1' }] },
      recovery: { proposals: [{ action: 'propose-only', allowed: false }] },
    },
  });
}

function ledger(rows) {
  return `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
}

const contextA = {
  runtime: 'divtube-tui',
  errorType: 'NoActiveAppError',
  message: 'boom',
  topFrame: 'app.py:284',
  thread: 'Thread-32',
};
const contextB = {
  runtime: 'node-fly',
  errorType: 'TimeoutError',
  message: 'slow',
  topFrame: 'worker.js:9',
  thread: 'main',
};
const window = localHourWindowContaining(Date.parse('2026-08-03T10:30:00.000-04:00'));

describe('Stateless APM hourly compiler', () => {
  it('returns quiet without Markdown when the completed hour has no fingerprint', () => {
    expect(compileHourlyReport({
      ledgerText: '',
      sourcePath: '/ledger.jsonl',
      window,
    })).toEqual({ status: 'quiet', filename: window.filename, window });
  });

  it('omits a previous event when it is absent from the requested hour', () => {
    const previous = fingerprint(
      '2026-08-03T09:15:00.000-04:00',
      'crash.previous',
      contextA,
    );

    expect(compileHourlyReport({
      ledgerText: ledger([previous]),
      sourcePath: '/ledger.jsonl',
      window,
    }).status).toBe('quiet');
  });

  it('renders active events with cumulative history and latest assessment', () => {
    const unitA = 'crash.divtube.tui';
    const unitB = 'crash.node.previous';
    const unitC = 'crash.node.new';
    const rows = [
      fingerprint('2026-08-03T08:10:00.000-04:00', unitA, contextA, 'b0'),
      fingerprint('2026-08-03T09:10:00.000-04:00', unitB, contextB),
      fingerprint('2026-08-03T10:20:00.000-04:00', unitA, contextA),
      assessment('2026-08-03T10:21:00.000-04:00', unitA),
      fingerprint('2026-08-03T10:40:00.000-04:00', unitA, { ...contextA, message: 'again' }, 'b2'),
      fingerprint('2026-08-03T10:50:00.000-04:00', unitC, contextB),
      fingerprint('2026-08-03T12:20:00.000-04:00', unitA, { ...contextA, message: 'later' }, 'b3'),
    ];
    const result = compileHourlyReport({
      ledgerText: ledger(rows),
      sourcePath: '/ledger.jsonl',
      window,
    });
    const keyA = stableEventKey({ ...contextA, unitId: unitA });
    const keyB = stableEventKey({ ...contextB, unitId: unitB });
    const keyC = stableEventKey({ ...contextB, unitId: unitC });

    expect(result.status).toBe('report');
    expect(result.summary).toEqual({
      windowOccurrences: 3,
      activeEvents: 2,
      newEvents: 1,
      recurringEvents: 1,
    });
    expect(result.markdown).toContain('- Lifetime occurrences: 3');
    expect(result.markdown).toContain('- Latest message: again');
    expect(result.markdown).toContain('- Drift: {"status":"drifting"}');
    expect(result.markdown).toContain('2026-08-03T08:10:00.000-04:00');
    expect(result.markdown).toContain('2026-08-03T10:40:00.000-04:00');
    expect(result.markdown).not.toContain(`## Event ${keyB}`);
    expect(result.markdown.indexOf(`## Event ${keyA}`))
      .toBeLessThan(result.markdown.indexOf(`## Event ${keyC}`));
  });

  it('computes integrity over every byte before the final checksum line', () => {
    const result = compileHourlyReport({
      ledgerText: ledger([
        fingerprint('2026-08-03T10:20:00.000-04:00', 'crash.one', contextA),
      ]),
      sourcePath: '/ledger.jsonl',
      window,
    });
    const checksumLine = `Report integrity checksum: ${result.integrityChecksum}\n`;
    const body = result.markdown.slice(0, -checksumLine.length);

    expect(result.markdown.endsWith(checksumLine)).toBe(true);
    expect(result.integrityChecksum).toBe(sha256Hex(body));
  });

  it('is byte-identical when complete input records are shuffled', () => {
    const rows = [
      fingerprint('2026-08-03T08:10:00.000-04:00', 'crash.same', contextA),
      fingerprint('2026-08-03T10:20:00.000-04:00', 'crash.same', contextA),
      assessment('2026-08-03T10:21:00.000-04:00', 'crash.same'),
    ];
    const first = compileHourlyReport({ ledgerText: ledger(rows), sourcePath: '/ledger.jsonl', window });
    const second = compileHourlyReport({ ledgerText: ledger([...rows].reverse()), sourcePath: '/ledger.jsonl', window });

    expect(second.markdown).toBe(first.markdown);
    expect(second.integrityChecksum).toBe(first.integrityChecksum);
  });

  it('discovers each completed active window once and sorts oldest first', () => {
    const ledgerText = ledger([
      fingerprint('2026-08-03T10:20:00.000-04:00', 'crash.one', contextA),
      fingerprint('2026-08-03T09:20:00.000-04:00', 'crash.two', contextB),
      fingerprint('2026-08-03T10:40:00.000-04:00', 'crash.three', contextA),
      fingerprint('2026-08-03T11:01:00.000-04:00', 'crash.open', contextB),
    ]);

    expect(discoverCompletedActiveWindows({
      ledgerText,
      nowMs: Date.parse('2026-08-03T11:05:00.000-04:00'),
    }).map((entry) => entry.filename)).toEqual([
      'APM-2026-08-03-0900-UTC-0400.md',
      'APM-2026-08-03-1000-UTC-0400.md',
    ]);
  });
});

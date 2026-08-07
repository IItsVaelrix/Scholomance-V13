/* @vitest-environment node */
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSubtletyApmHourlyReporter } from '../../../codex/runtime/subtlety-apm-hourly-reporter.js';

describe('Subtlety APM hourly reporter coordinator', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('catches up oldest-first, omits quiet hours, and becomes byte-idempotent', async () => {
    const published = [];
    const store = {
      readLedgerSnapshot: vi.fn(async () => 'ledger'),
      listReportFilenames: vi.fn(async () => []),
      publish: vi.fn(async (report) => { published.push(report.filename); return { status: 'published' }; }),
    };
    const windows = [{ startMs: 1, endMs: 2, filename: 'APM-2026-08-03-0800-UTC-0400.md' }, { startMs: 3, endMs: 4, filename: 'APM-2026-08-03-0900-UTC-0400.md' }];
    const reporter = createSubtletyApmHourlyReporter({
      reportStore: store, clock: () => 10,
      discoverWindows: () => windows,
      compile: ({ window }) => window.startMs === 1
        ? { status: 'quiet', filename: window.filename, window }
        : { status: 'report', filename: window.filename, markdown: 'body\n' },
      nextBoundary: () => 60_000,
    });
    reporter.start();
    await reporter.whenIdle();
    expect(published).toEqual(['APM-2026-08-03-0900-UTC-0400.md']);
    await reporter.requestTick();
    expect(store.publish).toHaveBeenCalledTimes(2);
    await reporter.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries transient I/O at 250ms, 1s, and 4s without overlapping passes', async () => {
    const readLedgerSnapshot = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }))
      .mockRejectedValueOnce(Object.assign(new Error('again'), { code: 'EIO' }))
      .mockResolvedValue('ledger');
    const reporter = createSubtletyApmHourlyReporter({
      reportStore: { readLedgerSnapshot, listReportFilenames: async () => [], publish: async () => ({ status: 'published' }) },
      clock: () => 10, discoverWindows: () => [], compile: vi.fn(), nextBoundary: () => 60_000,
    });
    reporter.start();
    const overlap = reporter.requestTick();
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(1000);
    await overlap;
    expect(readLedgerSnapshot).toHaveBeenCalledTimes(4);
    await reporter.stop();
  });

  it('aborts retry backoff and the boundary timer on stop', async () => {
    const reporter = createSubtletyApmHourlyReporter({
      reportStore: { readLedgerSnapshot: async () => { throw Object.assign(new Error('down'), { code: 'EIO' }); }, listReportFilenames: async () => [], publish: vi.fn() },
      clock: () => 10, discoverWindows: () => [], compile: vi.fn(), nextBoundary: () => 60_000,
    });
    reporter.start();
    const stopped = reporter.stop();
    await vi.runAllTimersAsync();
    await stopped;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Subtlety APM hourly reporter restart idempotence (real store)', () => {
  const previousTz = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'America/New_York'; });
  afterAll(() => {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  });

  function seal(body, canonicalStringify, sha256Hex) {
    return { ...body, checksum: sha256Hex(canonicalStringify(body)) };
  }

  it('a second reporter over the same paths publishes exactly one byte-identical report', async () => {
    const { canonicalStringify } = await import('../../../codex/core/pixelbrain/canonical-json.js');
    const { sha256Hex } = await import('../../../codex/core/pixelbrain/sha256.js');
    const { createSubtletyApmReportStore } = await import('../../../codex/services/subtlety-apm-report-store.js');

    const dir = await mkdtemp(join(tmpdir(), 'apm-reporter-restart-'));
    try {
      const ledgerPath = join(dir, 'ledger.jsonl');
      const reportDir = join(dir, 'reports');
      const at = '2026-08-03T12:30:00.000Z'; // 08:30 America/New_York (EDT)
      const context = {
        schema: 'SUBTLETY-OBSERVATION-CONTEXT-v1',
        runtime: 'divtube-tui',
        errorType: 'NoActiveAppError',
        message: 'boom',
        topFrame: 'app.js:42',
        threadName: 'main',
      };
      const payload = seal({
        schema: 'SUBTLETY-FINGERPRINT-v1',
        identity: { unitId: 'unit-1', runtimeProfile: context.runtime },
        execution: { runtimeProfile: context.runtime, buildId: 'b1' },
        fingerprint: { emits: [`thread.crash.${context.errorType}`] },
      }, canonicalStringify, sha256Hex);
      const record = seal({
        schema: 'SUBTLETY-RESONANCE-RECORD-v2',
        recordedAt: at,
        kind: 'fingerprint',
        payload,
        context,
      }, canonicalStringify, sha256Hex);
      await writeFile(ledgerPath, `${JSON.stringify(record)}\n`, 'utf8');

      const nowMs = Date.parse('2026-08-03T14:00:00.000Z');
      const storeA = createSubtletyApmReportStore({ ledgerPath, reportDir });
      const reporterA = createSubtletyApmHourlyReporter({ reportStore: storeA, clock: () => nowMs });
      reporterA.start();
      await reporterA.whenIdle();
      await reporterA.stop();

      const afterA = (await readdir(reportDir)).filter((name) => name.endsWith('.md'));
      expect(afterA).toHaveLength(1);
      const contentA = await readFile(join(reportDir, afterA[0]), 'utf8');

      const storeB = createSubtletyApmReportStore({ ledgerPath, reportDir });
      const reporterB = createSubtletyApmHourlyReporter({ reportStore: storeB, clock: () => nowMs });
      reporterB.start();
      await reporterB.whenIdle();
      await reporterB.stop();

      const afterB = (await readdir(reportDir)).filter((name) => name.endsWith('.md'));
      expect(afterB).toEqual(afterA);
      expect(await readFile(join(reportDir, afterB[0]), 'utf8')).toBe(contentA);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

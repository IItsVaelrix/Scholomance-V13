/* @vitest-environment node */
/**
 * Regression cover for the 2026-08-14 production outage.
 *
 * Shape of the failure, from the Fly logs: the ledger lived on the volume and
 * survived reboots; reportDir defaulted to an ephemeral container path and did
 * not. So every boot saw zero reports, treated ~3 weeks of elapsed hours as
 * unreported, and replayed them — compileHourlyReport re-parsing the entire
 * ledger per window — until "FATAL ERROR: Ineffective mark-compacts near heap
 * limit" at 249/257MB, exit 134, reboot, repeat.
 *
 * These tests fail against the pre-fix reporter: it publishes one report per
 * missed hour and, with a wiped report directory, does the whole thing again on
 * the next boot.
 */
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSubtletyApmHourlyReporter } from '../../../codex/runtime/subtlety-apm-hourly-reporter.js';
import { createSubtletyApmReportStore } from '../../../codex/services/subtlety-apm-report-store.js';

const HOUR = 3_600_000;

/** A run of consecutive completed hourly windows, oldest first. */
function windowRun(count, startMs = 0) {
  return Array.from({ length: count }, (_, index) => {
    const start = startMs + index * HOUR;
    const stamp = new Date(start).toISOString().slice(0, 13).replace('T', '-');
    return {
      startMs: start,
      endMs: start + HOUR,
      filename: `APM-${stamp}00-UTC+0000.md`,
    };
  });
}

describe('APM backlog is analysed once, not replayed hour by hour', () => {
  let dir;
  let ledgerPath;

  beforeEach(async () => {
    vi.useFakeTimers();
    dir = await mkdtemp(join(tmpdir(), 'apm-backlog-'));
    ledgerPath = join(dir, 'subtlety-resonance.jsonl');
    await writeFile(ledgerPath, 'ledger\n', 'utf8');
  });
  afterEach(async () => {
    vi.useRealTimers();
    await rm(dir, { recursive: true, force: true });
  });

  it('emits ONE digest for a long backlog instead of one report per hour', async () => {
    const windows = windowRun(500);
    const compile = vi.fn(({ window }) => ({
      status: 'report', filename: window.filename, markdown: 'hourly\n',
    }));
    const compileBacklog = vi.fn(({ windows: span }) => ({
      status: 'report',
      filename: 'APM-BACKLOG-1970-01-01-0000-to-1970-01-21-0300-UTC+0000.md',
      markdown: `digest of ${span.length}\n`,
    }));
    const store = createSubtletyApmReportStore({ ledgerPath, reportDir: join(dir, 'reports') });
    const reporter = createSubtletyApmHourlyReporter({
      reportStore: store,
      clock: () => 500 * HOUR + 1,
      discoverWindows: () => windows,
      compile,
      compileBacklog,
      nextBoundary: () => 60_000,
    });

    reporter.start();
    await reporter.whenIdle();
    await reporter.stop();

    // The heap-exhausting behaviour was 500 compiles + 500 publishes.
    expect(compileBacklog).toHaveBeenCalledTimes(1);
    expect(compile).not.toHaveBeenCalled();
    expect(await readdir(join(dir, 'reports'))).toHaveLength(1);
  });

  it('does not replay the backlog after a restart that loses the report directory', async () => {
    const windows = windowRun(500);
    const build = (reportDir) => {
      const compileBacklog = vi.fn(({ windows: span }) => ({
        status: 'report',
        filename: 'APM-BACKLOG-1970-01-01-0000-to-1970-01-21-0300-UTC+0000.md',
        markdown: `digest of ${span.length}\n`,
      }));
      const reporter = createSubtletyApmHourlyReporter({
        reportStore: createSubtletyApmReportStore({ ledgerPath, reportDir }),
        clock: () => 500 * HOUR + 1,
        discoverWindows: () => windows,
        compile: vi.fn(),
        compileBacklog,
        nextBoundary: () => 60_000,
      });
      return { reporter, compileBacklog };
    };

    const first = build(join(dir, 'reports-boot-1'));
    first.reporter.start();
    await first.reporter.whenIdle();
    await first.reporter.stop();
    expect(first.compileBacklog).toHaveBeenCalledTimes(1);

    // Reboot: fresh, EMPTY report directory — exactly what the ephemeral
    // container path did — while the ledger (and the watermark beside it)
    // persist on the volume.
    const second = build(join(dir, 'reports-boot-2'));
    second.reporter.start();
    await second.reporter.whenIdle();
    await second.reporter.stop();

    expect(second.compileBacklog).not.toHaveBeenCalled();
    expect(await readdir(join(dir, 'reports-boot-2')).catch(() => [])).toHaveLength(0);
  });

  it('still writes per-hour reports for a normal short catch-up', async () => {
    const windows = windowRun(2);
    const compile = vi.fn(({ window }) => ({
      status: 'report', filename: window.filename, markdown: `hourly ${window.filename}\n`,
    }));
    const compileBacklog = vi.fn();
    const reporter = createSubtletyApmHourlyReporter({
      reportStore: createSubtletyApmReportStore({ ledgerPath, reportDir: join(dir, 'reports') }),
      clock: () => 2 * HOUR + 1,
      discoverWindows: () => windows,
      compile,
      compileBacklog,
      nextBoundary: () => 60_000,
    });

    reporter.start();
    await reporter.whenIdle();
    await reporter.stop();

    expect(compileBacklog).not.toHaveBeenCalled();
    expect(compile).toHaveBeenCalledTimes(2);
    expect(await readdir(join(dir, 'reports'))).toHaveLength(2);
  });

  it('advances the watermark so a steady-state pass re-reports nothing', async () => {
    const store = createSubtletyApmReportStore({ ledgerPath, reportDir: join(dir, 'reports') });
    const windows = windowRun(2);
    const reporter = createSubtletyApmHourlyReporter({
      reportStore: store,
      clock: () => 2 * HOUR + 1,
      discoverWindows: () => windows,
      compile: ({ window }) => ({ status: 'report', filename: window.filename, markdown: 'x\n' }),
      compileBacklog: vi.fn(),
      nextBoundary: () => 60_000,
    });
    reporter.start();
    await reporter.whenIdle();
    await reporter.stop();

    expect(await store.readWatermarkMs()).toBe(2 * HOUR);
  });
});

/* @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { createMemoryTelemetry } from '../../../codex/runtime/memory-telemetry.js';

const usage = (heapUsedMb, rssMb = heapUsedMb + 40) => ({
  rss: rssMb * 1024 * 1024,
  heapUsed: heapUsedMb * 1024 * 1024,
  heapTotal: (heapUsedMb + 8) * 1024 * 1024,
  external: 2 * 1024 * 1024,
  arrayBuffers: 0,
});

describe('memory telemetry', () => {
  it('reports the ratio against the REAL heap limit, not the VM size', () => {
    const info = vi.fn();
    const telemetry = createMemoryTelemetry({
      logger: { info },
      memoryUsage: () => usage(128),
      heapStatistics: () => ({ heap_size_limit: 257 * 1024 * 1024 }),
    });
    const record = telemetry.sample();
    expect(record.heapLimitMb).toBe(257);
    expect(record.heapUsedRatio).toBeCloseTo(0.498, 2);
  });

  it('reports a null ratio rather than inventing a denominator', () => {
    const telemetry = createMemoryTelemetry({
      logger: {},
      memoryUsage: () => usage(128),
      heapStatistics: () => ({}),
    });
    expect(telemetry.sample().heapUsedRatio).toBeNull();
    expect(telemetry.sample().heapLimitMb).toBeNull();
  });

  it('escalates to warn as the heap approaches the limit', () => {
    const info = vi.fn();
    const warn = vi.fn();
    let heap = 100;
    const telemetry = createMemoryTelemetry({
      logger: { info, warn },
      warnRatio: 0.85,
      memoryUsage: () => usage(heap),
      heapStatistics: () => ({ heap_size_limit: 257 * 1024 * 1024 }),
    });
    telemetry.sample();
    expect(warn).not.toHaveBeenCalled();

    heap = 249; // the value production actually died at
    telemetry.sample();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toMatch(/approaching limit/i);
  });

  it('retains the peak so a climb is visible even between samples', () => {
    let heap = 60;
    const telemetry = createMemoryTelemetry({
      logger: {},
      memoryUsage: () => usage(heap),
      heapStatistics: () => ({ heap_size_limit: 257 * 1024 * 1024 }),
    });
    telemetry.sample();
    heap = 200;
    telemetry.sample();
    heap = 90;
    const record = telemetry.sample();
    expect(record.heapUsedMb).toBe(90);
    expect(record.peakHeapUsedMb).toBe(200);
  });

  it('samples immediately on start so a short-lived process still reports', () => {
    const info = vi.fn();
    const setTimer = vi.fn(() => ({ unref() {} }));
    const telemetry = createMemoryTelemetry({
      logger: { info },
      memoryUsage: () => usage(70),
      heapStatistics: () => ({ heap_size_limit: 257 * 1024 * 1024 }),
      setTimer,
    });
    telemetry.start();
    expect(info).toHaveBeenCalledTimes(1);
    expect(setTimer).toHaveBeenCalledTimes(1);
    telemetry.stop();
  });
});

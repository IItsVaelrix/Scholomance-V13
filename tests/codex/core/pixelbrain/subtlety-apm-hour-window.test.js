/* @vitest-environment node */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  formatLocalTimestamp,
  isCompletedWindow,
  localHourWindowContaining,
  nextLocalHourBoundary,
} from '../../../../codex/core/pixelbrain/subtlety-apm-hour-window.js';

const previousTz = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'America/New_York';
});

afterAll(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

describe('machine-local APM hour windows', () => {
  it('does not invent the skipped spring-forward hour', () => {
    const beforeJump = localHourWindowContaining(Date.parse('2026-03-08T06:30:00.000Z'));
    const afterJump = localHourWindowContaining(Date.parse('2026-03-08T07:30:00.000Z'));

    expect(beforeJump.filename).toBe('APM-2026-03-08-0100-UTC-0500.md');
    expect(afterJump.filename).toBe('APM-2026-03-08-0300-UTC-0400.md');
    expect(beforeJump.endMs).toBe(afterJump.startMs);
  });

  it('gives repeated fall-back hours different offsets and filenames', () => {
    const first = localHourWindowContaining(Date.parse('2026-11-01T05:30:00.000Z'));
    const second = localHourWindowContaining(Date.parse('2026-11-01T06:30:00.000Z'));

    expect(first.filename).toBe('APM-2026-11-01-0100-UTC-0400.md');
    expect(second.filename).toBe('APM-2026-11-01-0100-UTC-0500.md');
    expect(first.endMs).toBe(second.startMs);
  });

  it('finds the next observed local-hour boundary from a fresh epoch reading', () => {
    expect(nextLocalHourBoundary(Date.parse('2026-03-08T06:30:00.000Z')))
      .toBe(Date.parse('2026-03-08T07:00:00.000Z'));
    expect(nextLocalHourBoundary(Date.parse('2026-11-01T05:00:00.000Z')))
      .toBe(Date.parse('2026-11-01T06:00:00.000Z'));
  });

  it('formats timestamps with explicit machine-local offsets', () => {
    const window = localHourWindowContaining(Date.parse('2026-11-01T05:30:00.000Z'));

    expect(formatLocalTimestamp(Date.parse('2026-11-01T05:30:00.000Z')))
      .toBe('2026-11-01T01:30:00.000-04:00');
    expect(isCompletedWindow(window, window.endMs - 1)).toBe(false);
    expect(isCompletedWindow(window, window.endMs)).toBe(true);
  });
});

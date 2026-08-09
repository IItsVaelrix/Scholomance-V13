import { describe, it, expect } from 'vitest';
import { normalizeCrashEvent } from '../../../../codex/core/pixelbrain/subtlety-crash-ingest.js';

describe('subtlety-crash-ingest', () => {
  it('normalizes NoActiveAppError DivTube thread crash', () => {
    const n = normalizeCrashEvent({
      runtime: 'divtube-tui',
      unitId: 'crash.divtube.tui.archive_search_apply',
      errorType: 'textual._context.NoActiveAppError',
      message: 'NoActiveAppError',
      stack: 'File "tui/ui/app.py", line 284, in run\n    self.app.call_from_thread(...)\ntextual._context.NoActiveAppError',
      thread: 'Thread-32 (run)',
      filePaths: ['divtube_downloader/tui/ui/app.py'],
      timestamp: '2026-06-27T03:03:39',
      buildId: 'crash-20260627-030339',
    });
    expect(n.identity.unitId).toBe('crash.divtube.tui.archive_search_apply');
    expect(n.identity.runtimeProfile).toBe('divtube-tui');
    expect(n.output.ok).toBe(false);
    expect(n.output.error.type).toBe('textual._context.NoActiveAppError');
    expect(n.seam.emits).toContain('thread.crash.NoActiveAppError');
    expect(n.dedupKey).toContain('NoActiveAppError');
  });

  it('extracts a V8-style browser frame', () => {
    const n = normalizeCrashEvent({
      runtime: 'browser',
      stack: 'TypeError: x is not a function\n    at render (https://app/main.js:12:5)',
    });
    expect(n.output.error.site).toBe('at render (https://app/main.js:12:5)');
  });

  it('extracts a SpiderMonkey-style frame, which carries no "at " prefix', () => {
    const n = normalizeCrashEvent({
      runtime: 'browser',
      stack: 'render@https://app/main.js:12:5\nmount@https://app/main.js:40:1',
    });
    expect(n.output.error.site).toBe('render@https://app/main.js:12:5');
  });

  it('keeps the bare file:line:col the sensor falls back to when there is no Error object', () => {
    // browserCrashSensor.js sends `${filename}:${lineno}:${colno}` for
    // cross-origin script errors, which expose no error object at all.
    const n = normalizeCrashEvent({
      runtime: 'browser',
      stack: 'https://app/main.js:12:5',
    });
    expect(n.output.error.site).toBe('https://app/main.js:12:5');
  });

  it('reports unknown only when the stack carries no locatable frame', () => {
    expect(normalizeCrashEvent({ stack: '' }).output.error.site).toBe('unknown');
    expect(normalizeCrashEvent({ stack: 'something went wrong' }).output.error.site).toBe('unknown');
  });
});

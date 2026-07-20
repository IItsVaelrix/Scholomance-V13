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
});

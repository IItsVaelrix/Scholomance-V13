import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createResonanceStore } from '../../../../codex/core/pixelbrain/subtlety-resonance-store.js';
import { createSubtletyRuntime } from '../../../../codex/core/pixelbrain/subtlety-runtime.js';

describe('subtlety-runtime', () => {
  let dir;
  let alerts;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'subtlety-rt-'));
    alerts = [];
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const sample = {
    runtime: 'divtube-tui',
    unitId: 'crash.divtube.tui.archive_search_apply',
    errorType: 'textual._context.NoActiveAppError',
    message: 'NoActiveAppError',
    stack: 'File "tui/ui/app.py", line 284, in run',
    thread: 'Thread-32',
    buildId: 'b1',
  };

  it('ingests crash, appends store, propose-only alert; dedups within window', async () => {
    const store = createResonanceStore({ path: join(dir, 'r.jsonl') });
    let t = 1_000;
    const rt = createSubtletyRuntime({
      store,
      now: () => t,
      dedupWindowMs: 60_000,
      alertFn: (a) => alerts.push(a),
      raidFn: async () => ({ verdict: 'DENIED', confidence: 0 }),
    });
    const a = await rt.ingestCrash(sample);
    expect(a.deduped).toBe(false);
    expect(a.packet.fingerprint.semanticChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(store.readAll().some((r) => r.kind === 'fingerprint')).toBe(true);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].proposal.action || alerts[0].proposal.allowed).toBeTruthy();
    // propose-only: allowed must be false when no matching baseline approval
    expect(alerts[0].proposal.allowed).toBe(false);
    expect(alerts[0].raid.verdict).toBe('DENIED');

    t = 2_000;
    const b = await rt.ingestCrash(sample);
    expect(b.deduped).toBe(true);
    expect(b.occurrenceCount).toBe(2);
    expect(alerts).toHaveLength(1);
  });

  it('persists normalized crash context in the outer fingerprint record', async () => {
    const store = createResonanceStore({
      path: join(dir, 'context.jsonl'),
      now: () => '2026-08-03T10:15:00.000Z',
    });
    const rt = createSubtletyRuntime({ store, now: () => 1_000 });

    const result = await rt.ingestCrash({
      ...sample,
      message: 'https://me:pw@example.test/a\r\nBearer abc123\0 token=secret-value',
    });
    const fingerprint = store.readAll().find((record) => record.kind === 'fingerprint');

    expect(fingerprint.schema).toBe('SUBTLETY-RESONANCE-RECORD-v2');
    expect(fingerprint.context).toMatchObject({
      schema: 'SUBTLETY-OBSERVATION-CONTEXT-v1',
      runtime: 'divtube-tui',
      errorType: 'textual._context.NoActiveAppError',
      message: 'https://[REDACTED]@example.test/a\nBearer [REDACTED] token=[REDACTED]',
      topFrame: 'File "tui/ui/app.py", line 284, in run',
      thread: 'Thread-32',
    });
    expect(result.packet.checksum).toBe(fingerprint.payload.checksum);
  });
});

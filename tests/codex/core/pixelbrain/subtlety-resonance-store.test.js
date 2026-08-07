import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createResonanceStore,
  SUBTLETY_RESONANCE_SCHEMA,
  SUBTLETY_RESONANCE_SCHEMA_V2,
} from '../../../../codex/core/pixelbrain/subtlety-resonance-store.js';
import {
  normalizeObservationContext,
  SUBTLETY_OBSERVATION_CONTEXT_SCHEMA,
} from '../../../../codex/core/pixelbrain/subtlety-observation-context.js';

describe('subtlety-resonance-store', () => {
  let dir;
  let path;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'subtlety-res-'));
    path = join(dir, 'ledger.jsonl');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('appends sealed records and readAll round-trips', () => {
    const store = createResonanceStore({ path, now: () => '2026-07-20T00:00:00.000Z' });
    const rec = store.append('fingerprint', { unitId: 'crash.test', ok: false });
    expect(rec.schema).toBe(SUBTLETY_RESONANCE_SCHEMA);
    expect(rec.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(store.readAll()).toHaveLength(1);
    expect(store.tail(1)[0].payload.unitId).toBe('crash.test');
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
  });

  it('normalizes, redacts, and bounds observation context before persistence', () => {
    const context = normalizeObservationContext({
      runtime: '',
      errorType: '',
      message: 'https://me:pw@example.test/a\r\nBearer abc123\0 token=secret-value',
      topFrame: '💥'.repeat(1100),
      thread: 'x'.repeat(300),
    });

    expect(context).toMatchObject({
      schema: SUBTLETY_OBSERVATION_CONTEXT_SCHEMA,
      runtime: 'unknown',
      errorType: 'unknown',
      message: 'https://[REDACTED]@example.test/a\nBearer [REDACTED] token=[REDACTED]',
    });
    expect([...context.topFrame]).toHaveLength(1024);
    expect([...context.thread]).toHaveLength(256);
  });

  it('seals context in v2 without changing the nested fingerprint packet', () => {
    const store = createResonanceStore({ path, now: () => '2026-08-03T10:00:00.000Z' });
    const packet = { schema: 'SUBTLETY-FINGERPRINT-v1', checksum: 'a'.repeat(64) };
    const first = store.append('fingerprint', packet, {
      context: { runtime: 'node', errorType: 'Error', message: 'first', topFrame: 'a.js:1', thread: '' },
    });
    const second = store.append('fingerprint', packet, {
      context: { runtime: 'node', errorType: 'Error', message: 'second', topFrame: 'a.js:1', thread: '' },
    });

    expect(first.schema).toBe(SUBTLETY_RESONANCE_SCHEMA_V2);
    expect(first.payload.checksum).toBe(second.payload.checksum);
    expect(first.checksum).not.toBe(second.checksum);
    expect(store.readAll()[0].context.message).toBe('first');
  });
});

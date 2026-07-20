import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createResonanceStore, SUBTLETY_RESONANCE_SCHEMA } from '../../../../codex/core/pixelbrain/subtlety-resonance-store.js';

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
});

/* @vitest-environment node */
import Fastify from 'fastify';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createResonanceStore } from '../../../codex/core/pixelbrain/subtlety-resonance-store.js';
import { createSubtletyRuntime } from '../../../codex/core/pixelbrain/subtlety-runtime.js';
import { buildSubtletyAlertRecord, drainSubtletySpool, subtletyRoutes } from '../../../codex/server/routes/subtlety.routes.js';

describe('subtlety routes', () => {
  let dir;
  let store;
  let alerts;
  let fastify;
  let t;

  const sample = {
    runtime: 'divtube-tui',
    unitId: 'crash.divtube.tui.archive_search_apply',
    errorType: 'textual._context.NoActiveAppError',
    message: 'NoActiveAppError',
    stack: 'File "tui/ui/app.py", line 284, in run',
    thread: 'Thread-32',
    buildId: 'b1',
  };

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'subtlety-routes-'));
    store = createResonanceStore({ path: join(dir, 'r.jsonl') });
    alerts = [];
    t = 1_000;

    fastify = Fastify({ logger: false });
    await fastify.register(subtletyRoutes, {
      store,
      runtimeOpts: {
        now: () => t,
        dedupWindowMs: 60_000,
        raidFn: async () => ({ verdict: 'DENIED', confidence: 0 }),
      },
      createAlert: async (payload) => alerts.push({ collab: true, ...payload }),
    });
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('POST /subtlety/crash ingests crash and returns ok', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/subtlety/crash',
      payload: sample,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.deduped).toBe(false);
    expect(body.occurrenceCount).toBe(1);
    expect(body.unitId).toBe(sample.unitId);
    expect(store.readAll().some((r) => r.kind === 'fingerprint')).toBe(true);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].collab).toBe(true);
  });

  it('dedupes identical crashes within window and fires createAlert once', async () => {
    await fastify.inject({ method: 'POST', url: '/subtlety/crash', payload: sample });
    const collabAlerts = alerts.filter((a) => a.collab);
    expect(collabAlerts).toHaveLength(1);

    t = 2_000;
    const res = await fastify.inject({ method: 'POST', url: '/subtlety/crash', payload: sample });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, deduped: true, occurrenceCount: 2 });
    expect(alerts.filter((a) => a.collab)).toHaveLength(1);
  });

  it('GET /subtlety/status returns runtime status', async () => {
    await fastify.inject({ method: 'POST', url: '/subtlety/crash', payload: sample });
    const res = await fastify.inject({ method: 'GET', url: '/subtlety/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.storePath).toBe(store.path);
    expect(Array.isArray(body.recent)).toBe(true);
    expect(body.dedupSize).toBeGreaterThan(0);
  });

  it('returns ok:false on ingest failure without 5xx', async () => {
    await fastify.close();
    fastify = Fastify({ logger: false });
    await fastify.register(subtletyRoutes, {
      runtime: {
        ingestCrash: async () => ({ ok: false, error: 'bad-event' }),
        getStatus: () => ({}),
      },
    });
    await fastify.ready();

    const res = await fastify.inject({
      method: 'POST',
      url: '/subtlety/crash',
      payload: sample,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: false, error: 'bad-event' });
  });

  it('continues ingest when createAlert throws', async () => {
    await fastify.close();
    fastify = Fastify({ logger: false });
    await fastify.register(subtletyRoutes, {
      store,
      runtimeOpts: {
        now: () => t,
        dedupWindowMs: 60_000,
        raidFn: async () => ({ verdict: 'DENIED', confidence: 0 }),
      },
      createAlert: async () => {
        throw new Error('collab down');
      },
    });
    await fastify.ready();

    const res = await fastify.inject({ method: 'POST', url: '/subtlety/crash', payload: sample });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('rejects unauthenticated ingest when token configured', async () => {
    await fastify.close();
    fastify = Fastify({ logger: false });
    await fastify.register(subtletyRoutes, {
      store,
      authConfig: { token: 'secret-token', isProduction: true },
      runtimeOpts: { now: () => t, dedupWindowMs: 60_000 },
      createAlert: async () => {},
    });
    await fastify.ready();

    const denied = await fastify.inject({
      method: 'POST',
      url: '/subtlety/crash',
      payload: sample,
    });
    expect(denied.statusCode).toBe(401);
    expect(denied.json().ok).toBe(false);

    const ok = await fastify.inject({
      method: 'POST',
      url: '/subtlety/crash',
      headers: { 'x-subtlety-token': 'secret-token' },
      payload: sample,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().ok).toBe(true);
  });
});

describe('drainSubtletySpool', () => {
  let dir;
  let store;
  let alerts;
  let t;

  const sample = {
    runtime: 'divtube-tui',
    unitId: 'crash.divtube.tui.unspecified',
    errorType: 'textual._context.NoActiveAppError',
    message: 'NoActiveAppError',
    stack: 'Traceback...\nNoActiveAppError\n',
    thread: 'Thread-32',
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'subtlety-spool-'));
    store = createResonanceStore({ path: join(dir, 'r.jsonl') });
    alerts = [];
    t = 1_000;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('ingests spooled JSON files and deletes them on success', async () => {
    writeFileSync(join(dir, '20260720-12345.json'), JSON.stringify(sample));

    const runtime = createSubtletyRuntime({
      store,
      now: () => t,
      dedupWindowMs: 60_000,
      raidFn: async () => ({ verdict: 'DENIED', confidence: 0 }),
      alertFn: async (payload) => alerts.push(payload),
    });

    const result = await drainSubtletySpool(dir, { ingestCrash: runtime.ingestCrash.bind(runtime) });
    expect(result).toEqual({ drained: 1, failed: 0 });
    expect(readdirSync(dir).filter((f) => f.endsWith('.json'))).toHaveLength(0);
    expect(store.readAll().some((r) => r.kind === 'fingerprint')).toBe(true);
  });
});

describe('buildSubtletyAlertRecord', () => {
  it('builds propose-only collab alert row', () => {
    const payload = {
      symptom: { code: 'SYM-1' },
      proposal: { action: 'restart', allowed: false },
      packet: { identity: { unitId: 'crash.test.unit' } },
      raid: { verdict: 'DENIED' },
    };
    const row = buildSubtletyAlertRecord(payload, { now: 1000, ttlMs: 5000, messageId: 42 });
    expect(row.message_id).toBe(42);
    expect(row.recipient_id).toBe('subtlety-monitor');
    expect(row.sender_id).toBe('subtlety-runtime');
    expect(row.target_id).toBe('crash.test.unit');
    expect(row.identity_packet.source).toBe('subtlety-fingerprint-apm');
    expect(row.identity_packet.propose_only).toBe(true);
    expect(row.identity_packet.expires_at).toBe(6000);
    expect(row.id).toMatch(/^alr_subtlety_/);
  });
});

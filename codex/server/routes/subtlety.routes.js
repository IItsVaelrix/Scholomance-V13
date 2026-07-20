import { randomUUID } from 'node:crypto';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { readHeaderAsString, secureTokenEquals } from '../audioAuth.js';
import { getSubtletyRuntime, createSubtletyRuntime } from '../../core/pixelbrain/subtlety-runtime.js';

export const SUBTLETY_TOKEN_HEADER = 'x-subtlety-token';

/**
 * When SUBTLETY_INGEST_TOKEN is set, require a matching header.
 * In production, a token must be configured (otherwise 401).
 * Local/dev with no token configured remains open for DivTube localhost.
 */
export function authorizeSubtletyRequest(request, {
  token = process.env.SUBTLETY_INGEST_TOKEN,
  isProduction = process.env.NODE_ENV === 'production',
} = {}) {
  const configured = typeof token === 'string' ? token.trim() : '';
  if (!isProduction && !configured) {
    return { authorized: true };
  }
  if (!configured) {
    return { authorized: false, reason: 'missing_config' };
  }
  const provided = readHeaderAsString(request?.headers?.[SUBTLETY_TOKEN_HEADER]);
  if (!provided) {
    return { authorized: false, reason: 'missing_token' };
  }
  if (!secureTokenEquals(provided, configured)) {
    return { authorized: false, reason: 'invalid_token' };
  }
  return { authorized: true };
}

export async function drainSubtletySpool(spoolDir, { ingestCrash, logger } = {}) {
  if (!spoolDir || typeof ingestCrash !== 'function') {
    return { drained: 0, failed: 0 };
  }

  let entries;
  try {
    entries = await readdir(spoolDir);
  } catch (err) {
    if (err?.code === 'ENOENT') return { drained: 0, failed: 0 };
    logger?.warn?.({ err, spoolDir }, '[subtlety] spool read failed');
    return { drained: 0, failed: 0 };
  }

  let drained = 0;
  let failed = 0;

  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const filePath = join(spoolDir, name);
    try {
      const raw = JSON.parse(await readFile(filePath, 'utf8'));
      const result = await ingestCrash(raw);
      if (result?.ok === false) {
        failed += 1;
        continue;
      }
      await unlink(filePath);
      drained += 1;
    } catch (err) {
      failed += 1;
      logger?.warn?.({ err, filePath }, '[subtlety] spool drain failed');
    }
  }

  return { drained, failed };
}

export async function subtletyRoutes(fastify, opts = {}) {
  const createAlert = opts.createAlert || fastify.subtletyCreateAlert || null;

  async function alertFn(payload) {
    if (!createAlert) return;
    try {
      await createAlert(payload);
    } catch (err) {
      fastify.log?.warn?.({ err }, '[subtlety] collab alert failed');
    }
  }

  let cachedRuntime = null;

  function resolveRuntime() {
    if (opts.runtime) return opts.runtime;
    if (cachedRuntime) return cachedRuntime;
    const runtimeOpts = {
      ...(opts.runtimeOpts || {}),
      alertFn,
      ...(opts.raidFn ? { raidFn: opts.raidFn } : {}),
    };
    if (opts.store) {
      cachedRuntime = createSubtletyRuntime({ ...runtimeOpts, store: opts.store });
      return cachedRuntime;
    }
    cachedRuntime = getSubtletyRuntime(runtimeOpts);
    return cachedRuntime;
  }

  async function requireSubtletyAuth(request, reply) {
    const auth = authorizeSubtletyRequest(request, opts.authConfig);
    if (auth.authorized) return;
    return reply.code(401).send({
      ok: false,
      error: 'unauthorized',
      reason: auth.reason,
    });
  }

  fastify.post('/subtlety/crash', { preHandler: requireSubtletyAuth }, async (request, reply) => {
    try {
      const runtime = resolveRuntime();
      const result = await runtime.ingestCrash(request.body || {});
      if (result?.ok === false) {
        return reply.code(200).send({ ok: false, error: result.error || 'ingest-failed' });
      }
      return reply.code(200).send({
        ok: true,
        deduped: result.deduped,
        occurrenceCount: result.occurrenceCount,
        unitId: result.packet?.identity?.unitId ?? null,
      });
    } catch (err) {
      request.log?.error?.({ err }, '[subtlety] ingest failed');
      return reply.code(200).send({ ok: false, error: 'ingest-failed' });
    }
  });

  fastify.get('/subtlety/status', { preHandler: requireSubtletyAuth }, async (_request, reply) => {
    return reply.send(resolveRuntime().getStatus());
  });
}

export function buildSubtletyAlertRecord(payload, { now = Date.now(), ttlMs = 15 * 60 * 1000, messageId = null } = {}) {
  const alertId = `alr_subtlety_${randomUUID()}`;
  const identity_packet = {
    alert_id: alertId,
    source: 'subtlety-fingerprint-apm',
    issued_at: now,
    expires_at: now + ttlMs,
    symptom: payload.symptom || null,
    proposal: payload.proposal || null,
    unitId: payload.packet?.identity?.unitId ?? null,
    raid: payload.raid ?? null,
    propose_only: true,
  };
  return {
    id: alertId,
    message_id: messageId,
    recipient_id: 'subtlety-monitor',
    sender_id: 'subtlety-runtime',
    target_id: payload.packet?.identity?.unitId ?? 'subtlety',
    identity_packet,
    issued_at: now,
    expires_at: now + ttlMs,
  };
}

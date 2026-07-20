import { getSubtletyRuntime } from '../core/pixelbrain/subtlety-runtime.js';

function resolveBuildId() {
  return process.env.FLY_ALLOC_ID
    || process.env.FLY_MACHINE_ID
    || process.env.FLY_APP_NAME
    || null;
}

export function mapErrorToCrashEvent(err, { runtime = 'node-fly', unitId } = {}) {
  const error = err instanceof Error ? err : new Error(String(err ?? 'unknown'));
  return {
    runtime,
    unitId: unitId || `crash.${runtime}.unspecified`,
    errorType: error.name || 'Error',
    message: error.message || String(err ?? ''),
    stack: error.stack || '',
    buildId: resolveBuildId(),
  };
}

function safeIngest(ingest, rawEvent, logger) {
  if (typeof ingest !== 'function') return;
  try {
    const result = ingest(rawEvent);
    if (result && typeof result.then === 'function') {
      result.catch((err) => {
        logger?.warn?.({ err }, '[subtlety] node crash ingest failed');
      });
      return result;
    }
    return result;
  } catch (err) {
    logger?.warn?.({ err }, '[subtlety] node crash ingest failed');
  }
}

export function reportNodeCrash(err, meta = {}) {
  const {
    runtime = 'node-fly',
    unitId = 'crash.node-fly.unhandled',
    ingest,
    logger,
  } = meta;

  const rawEvent = mapErrorToCrashEvent(err, { runtime, unitId });
  return safeIngest(ingest, rawEvent, logger);
}

export function handleFatalCrash(err, meta = {}, exitFn = process.exit) {
  try {
    const p = reportNodeCrash(err, meta);
    if (p && typeof p.then === 'function') {
      void p.finally(() => exitFn(1));
      setTimeout(() => exitFn(1), 2000).unref?.();
    } else {
      exitFn(1);
    }
  } catch {
    exitFn(1);
  }
}

export function installSubtletyNodeAdapters({ fastify, ingest, logger } = {}) {
  const log = logger || fastify?.log;

  const boundIngest = ingest || ((event) => getSubtletyRuntime({
    alertFn: fastify?.subtletyCreateAlert,
  }).ingestCrash(event));

  process.on('uncaughtException', (err) => {
    handleFatalCrash(err, {
      runtime: 'node-fly',
      unitId: 'crash.node-fly.uncaught',
      ingest: boundIngest,
      logger: log,
    });
  });

  // Ingest only — do not exit. Unhandled rejections were previously non-fatal;
  // force-exit would restart Fly on floating promises. Opt into fatal via env.
  process.on('unhandledRejection', (reason) => {
    const meta = {
      runtime: 'node-fly',
      unitId: 'crash.node-fly.unhandled-rejection',
      ingest: boundIngest,
      logger: log,
    };
    if (process.env.SUBTLETY_FATAL_REJECTIONS === '1') {
      handleFatalCrash(reason, meta);
      return;
    }
    reportNodeCrash(reason, meta);
  });

  if (fastify) {
    const existing = fastify.errorHandler;
    fastify.setErrorHandler((error, request, reply) => {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) {
        reportNodeCrash(error, {
          runtime: 'node-fly',
          unitId: 'crash.node-fly.http',
          ingest: boundIngest,
          logger: log,
        });
      }
      return existing.call(fastify, error, request, reply);
    });
  }
}

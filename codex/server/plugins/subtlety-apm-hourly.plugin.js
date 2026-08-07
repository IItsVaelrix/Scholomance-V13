/**
 * Subtlety APM hourly reporter — Fastify lifecycle binding.
 *
 * Binds the restart-safe hourly reporter to server readiness/shutdown
 * WITHOUT coupling it to the crash-ingest path:
 *  - onReady: start() is synchronous and never awaited — catch-up runs
 *    in the background and can never delay readiness;
 *  - onClose: stop() is awaited so graceful shutdown leaves no live
 *    timer or in-flight pass;
 *  - every reporter failure is logged, never thrown.
 */

import { createSubtletyApmHourlyReporter } from '../../runtime/subtlety-apm-hourly-reporter.js';
import { createSubtletyApmReportStore } from '../../services/subtlety-apm-report-store.js';

export async function subtletyApmHourlyPlugin(fastify, opts = {}) {
  if (opts.enabled === false) return;
  const reporter = opts.reporter || createSubtletyApmHourlyReporter({
    reportStore: createSubtletyApmReportStore({ ledgerPath: opts.ledgerPath, reportDir: opts.reportDir }),
    logger: fastify.log,
  });
  fastify.addHook('onReady', async () => {
    try { reporter.start(); }
    catch (error) { fastify.log?.error?.({ err: error }, '[subtlety-apm] reporter start failed'); }
  });
  fastify.addHook('onClose', async () => {
    try { await reporter.stop(); }
    catch (error) { fastify.log?.error?.({ err: error }, '[subtlety-apm] reporter stop failed'); }
  });
}

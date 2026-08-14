/**
 * Subtlety APM hourly reporter — runtime coordinator.
 *
 * Stateless Chronicle Compiler architecture (METASTABLE_SELECTED by the
 * 2026-08-03 concept-chemistry trial): every pass re-derives completed
 * active windows and recurrence context from a byte-stable ledger
 * snapshot.
 *
 * AMENDED 2026-08-14 after a production outage. The stateless design rested on
 * "report existence plus ledger history is the only authority", which is true
 * only where reports are as durable as the ledger. In production they were not:
 * the ledger sat on the Fly volume while reportDir defaulted to an ephemeral
 * container path, so every boot observed zero reports, treated three weeks of
 * elapsed hours as unreported, and replayed them — each replay re-parsing the
 * whole ledger — until the heap hit 249/257MB and the machine SIGABRT'd into a
 * reboot loop. Statelessness was not wrong; the assumed durability was.
 *
 * Two amendments, both narrow:
 *  - a COVERAGE WATERMARK stored beside the ledger, so coverage inherits the
 *    ledger's durability instead of reportDir's;
 *  - a BACKLOG DIGEST: when a pass finds backlogThreshold or more unreported
 *    windows, it emits ONE analysis of the span rather than one report per
 *    hour. Cost becomes independent of how long the reporter was away.
 * Steady-state behaviour — one window per hour — is unchanged.
 *
 * Guarantees:
 *  - one active pass at a time, at most one queued follow-up pass;
 *  - transient I/O errors retry at 250ms, 1s, 4s with bounded backoff;
 *  - integrity conflicts surface as errors and never overwrite reports;
 *  - stop() aborts pending backoff, clears the boundary timer, and
 *    resolves only when no timer or pass remains live;
 *  - reporter failures are logged, never thrown into the ingest path.
 */

import {
  compileBacklogDigest,
  compileHourlyReport,
  discoverCompletedActiveWindows,
} from '../core/pixelbrain/subtlety-apm-hourly-compiler.js';
import { nextLocalHourBoundary } from '../core/pixelbrain/subtlety-apm-hour-window.js';

const TRANSIENT = new Set(['EACCES', 'EBUSY', 'EIO', 'EMFILE', 'ENFILE', 'ENOENT']);

function abortableDelay(ms, signal, setTimer, clearTimer) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimer(resolve, ms);
    signal.addEventListener('abort', () => { clearTimer(timer); reject(signal.reason); }, { once: true });
  });
}

export function createSubtletyApmHourlyReporter({
  reportStore,
  clock = () => Date.now(),
  discoverWindows = discoverCompletedActiveWindows,
  compile = compileHourlyReport,
  compileBacklog = compileBacklogDigest,
  // Above this many unreported windows in one pass, the pass is a BACKLOG:
  // analysed once rather than replayed hour by hour. A live server produces one
  // window per hour, so normal operation never reaches this.
  backlogThreshold = 3,
  nextBoundary = nextLocalHourBoundary,
  retryDelays = [250, 1000, 4000],
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  logger = {},
} = {}) {
  if (!reportStore) throw new TypeError('createSubtletyApmHourlyReporter requires reportStore');
  let stopped = true;
  let running = false;
  let queued = false;
  let boundaryTimer = null;
  let active = Promise.resolve();
  let controller = new AbortController();

  async function publishOrThrow(result) {
    const published = await reportStore.publish({ filename: result.filename, markdown: result.markdown });
    if (published.status === 'conflict') {
      const error = new Error(`APM report integrity conflict: ${result.filename}`);
      error.code = 'APM_REPORT_CONFLICT';
      throw error;
    }
    return published;
  }

  async function pass() {
    const ledgerText = await reportStore.readLedgerSnapshot();
    const existing = new Set(await reportStore.listReportFilenames());
    // Watermark is optional: stores without it behave exactly as before.
    const watermarkMs = (await reportStore.readWatermarkMs?.()) ?? null;
    const discovered = discoverWindows({ ledgerText, nowMs: clock() });
    const pending = discovered.filter((window) => (
      (watermarkMs === null || window.endMs > watermarkMs) && !existing.has(window.filename)
    ));
    if (pending.length === 0) return;

    const advance = async () => {
      const furthest = pending.reduce((max, w) => (w.endMs > max ? w.endMs : max), -Infinity);
      if (Number.isFinite(furthest)) await reportStore.writeWatermarkMs?.(furthest);
    };

    // BACKLOG: one analysis of the whole span. Never a per-hour replay — that is
    // what exhausted the production heap.
    if (pending.length >= backlogThreshold) {
      const result = compileBacklog({ ledgerText, sourcePath: reportStore.ledgerPath, windows: pending });
      if (result.status !== 'quiet') {
        const published = await publishOrThrow(result);
        logger.info?.({
          filename: result.filename,
          status: published.status,
          hoursCovered: pending.length,
          emittedAt: new Date(clock()).toISOString(),
        }, '[subtlety-apm] backlog digest ready');
      } else {
        logger.info?.({ hoursCovered: pending.length }, '[subtlety-apm] backlog quiet; no digest emitted');
      }
      await advance();
      return;
    }

    for (const window of pending) {
      if (controller.signal.aborted) continue;
      const result = compile({ ledgerText, sourcePath: reportStore.ledgerPath, window });
      if (result.status === 'quiet') continue;
      const published = await publishOrThrow(result);
      existing.add(result.filename);
      logger.info?.({ filename: result.filename, status: published.status, emittedAt: new Date(clock()).toISOString() }, '[subtlety-apm] hourly report ready');
    }
    if (!controller.signal.aborted) await advance();
  }

  async function passWithRetry() {
    for (let attempt = 0; ; attempt += 1) {
      try { return await pass(); }
      catch (error) {
        if (controller.signal.aborted) return;
        if (!TRANSIENT.has(error?.code) || attempt >= retryDelays.length) throw error;
        await abortableDelay(retryDelays[attempt], controller.signal, setTimer, clearTimer);
      }
    }
  }

  async function drain() {
    running = true;
    try {
      do {
        queued = false;
        await passWithRetry().catch((error) => logger.error?.({ err: error }, '[subtlety-apm] reporter pass failed'));
      } while (queued && !stopped);
    } finally { running = false; }
  }

  function requestTick() {
    if (stopped) return active;
    queued = true;
    if (!running) active = drain();
    return active;
  }

  function scheduleNext() {
    if (stopped) return;
    const nowMs = clock();
    const delay = Math.max(1, nextBoundary(nowMs) - nowMs);
    boundaryTimer = setTimer(() => {
      boundaryTimer = null;
      void requestTick().finally(scheduleNext);
    }, delay);
    boundaryTimer?.unref?.();
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    controller = new AbortController();
    void requestTick();
    scheduleNext();
  }

  async function stop() {
    stopped = true;
    queued = false;
    controller.abort(new Error('Subtlety APM reporter stopped'));
    if (boundaryTimer !== null) clearTimer(boundaryTimer);
    boundaryTimer = null;
    await active.catch(() => {});
  }

  function whenIdle() { return active; }
  return { start, stop, requestTick, whenIdle };
}

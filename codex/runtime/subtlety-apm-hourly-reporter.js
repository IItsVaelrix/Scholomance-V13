/**
 * Subtlety APM hourly reporter — runtime coordinator.
 *
 * Stateless Chronicle Compiler architecture (METASTABLE_SELECTED by the
 * 2026-08-03 concept-chemistry trial): every pass re-derives completed
 * active windows and recurrence context from a byte-stable ledger
 * snapshot. There is no cursor, checkpoint, or derived-state database;
 * report existence plus ledger history is the only authority.
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

  async function pass() {
    const ledgerText = await reportStore.readLedgerSnapshot();
    const existing = new Set(await reportStore.listReportFilenames());
    const windows = discoverWindows({ ledgerText, nowMs: clock() });
    for (const window of windows) {
      if (controller.signal.aborted || existing.has(window.filename)) continue;
      const result = compile({ ledgerText, sourcePath: reportStore.ledgerPath, window });
      if (result.status === 'quiet') continue;
      const published = await reportStore.publish({ filename: result.filename, markdown: result.markdown });
      if (published.status === 'conflict') {
        const error = new Error(`APM report integrity conflict: ${result.filename}`);
        error.code = 'APM_REPORT_CONFLICT';
        throw error;
      }
      existing.add(result.filename);
      logger.info?.({ filename: result.filename, status: published.status, emittedAt: new Date(clock()).toISOString() }, '[subtlety-apm] hourly report ready');
    }
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

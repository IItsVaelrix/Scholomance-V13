/**
 * MEMORY TELEMETRY — make heap exhaustion observable.
 *
 * On 2026-08-14 production died repeatedly with
 *   FATAL ERROR: Ineffective mark-compacts near heap limit
 *   Aborted / exit code 134
 * and the APM resonance ledger recorded NOTHING about any of it. That is not a
 * bug in the ledger: an OOM is a V8 abort, so OOMErrorHandler runs and the
 * process is gone without executing further JavaScript. An in-process JS crash
 * recorder cannot, even in principle, witness its own heap death. The crash
 * reporter was structurally blind to the one failure mode killing the service.
 *
 * So the signal has to be emitted BEFORE the ceiling, not after. This samples
 * on an interval and logs a flat record per tick. The shape of the series is
 * the diagnosis:
 *   - monotonic climb across ticks, flat traffic  -> a leak
 *   - flat baseline with a single spike           -> one request's allocation
 *   - sawtooth that recovers after GC             -> healthy churn
 *
 * The heap ceiling is also implicit here: no --max-old-space-size is set
 * anywhere, so V8 derives it from machine memory (~257MB observed on a 512mb
 * VM). limitBytes is reported so the ratio is never inferred from the VM size.
 */

const DEFAULT_INTERVAL_MS = 30_000;

/** Bytes -> MB, one decimal. Logs are read by humans under time pressure. */
function mb(bytes) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

/**
 * @param {object} deps
 * @param {{info?: Function, warn?: Function}} [deps.logger]
 * @param {number} [deps.intervalMs]
 * @param {() => NodeJS.MemoryUsage} [deps.memoryUsage]
 * @param {() => {heap_size_limit?: number}} [deps.heapStatistics]
 * @param {number} [deps.warnRatio] fraction of the limit that escalates to warn
 * @param {Function} [deps.setTimer]
 * @param {Function} [deps.clearTimer]
 */
export function createMemoryTelemetry({
  logger = {},
  intervalMs = DEFAULT_INTERVAL_MS,
  memoryUsage = () => process.memoryUsage(),
  heapStatistics = null,
  /**
   * v8.getHeapSpaceStatistics. Names WHICH space is growing, which is the
   * difference between "the heap is climbing" and a lead: old_space means
   * retained objects (a leak), large_object_space means big buffers, and
   * new_space churn is normal allocation the collector will reclaim.
   */
  heapSpaceStatistics = null,
  warnRatio = 0.85,
  setTimer = setInterval,
  clearTimer = clearInterval,
} = {}) {
  let timer = null;
  let peakHeapUsed = 0;
  let ticks = 0;

  function sample() {
    const usage = memoryUsage();
    const limitBytes = heapStatistics?.()?.heap_size_limit ?? null;
    ticks += 1;
    if (usage.heapUsed > peakHeapUsed) peakHeapUsed = usage.heapUsed;
    const record = {
      tick: ticks,
      rssMb: mb(usage.rss),
      heapUsedMb: mb(usage.heapUsed),
      heapTotalMb: mb(usage.heapTotal),
      externalMb: mb(usage.external),
      peakHeapUsedMb: mb(peakHeapUsed),
      heapLimitMb: limitBytes === null ? null : mb(limitBytes),
      // The number that matters. Null rather than a guess when the limit is
      // unknown — an invented denominator is worse than an absent one.
      heapUsedRatio: limitBytes ? Math.round((usage.heapUsed / limitBytes) * 1000) / 1000 : null,
    };
    // Per-space breakdown, emitted flat so a log grep can trend one space.
    const spaces = heapSpaceStatistics?.();
    if (Array.isArray(spaces)) {
      for (const s of spaces) {
        if (!s?.space_name) continue;
        if (s.space_used_size < 1024 * 1024) continue; // sub-MB spaces are noise
        record[`sp_${s.space_name}`] = mb(s.space_used_size);
      }
    }
    const nearLimit = record.heapUsedRatio !== null && record.heapUsedRatio >= warnRatio;
    const message = nearLimit
      ? '[memory] heap approaching limit — an abort here would leave no JS-level trace'
      : '[memory] sample';
    // CALL AS A METHOD, never `const emit = logger.info`. pino's LOG reads
    // this[msgPrefixSym], so a detached reference throws
    // "Cannot read properties of undefined (reading 'Symbol(pino.msgPrefix)')"
    // and — because this runs at startup — takes the whole server down. It did,
    // in production, on 2026-08-14. Plain vi.fn() doubles do not reproduce it
    // because they have no `this` dependency; see the bound-logger test.
    if (nearLimit && typeof logger.warn === 'function') logger.warn(record, message);
    else if (typeof logger.info === 'function') logger.info(record, message);
    return record;
  }

  return {
    sample,
    start() {
      if (timer) return;
      sample(); // one immediately, so a process that dies early still reports once
      timer = setTimer(sample, intervalMs);
      if (typeof timer?.unref === 'function') timer.unref();
    },
    stop() {
      if (!timer) return;
      clearTimer(timer);
      timer = null;
    },
    get peakHeapUsedBytes() { return peakHeapUsed; },
  };
}

/**
 * CONSTELLATION RUNTIME — the orchestration layer the PDR always assigned.
 *
 * Feedback report 2026-08-19 (P1): until this module existed, the page service
 * owned timeouts, degradation policy, and concurrency BY ACCIDENT — every
 * channel ran inside an ad-hoc try/catch in a 395-line composer, and two
 * identical concurrent queries each paid the full analysis twice.
 *
 * Layer flow (PDR): Server -> Runtime -> Services -> Core. This module is the
 * Runtime half. It owns MECHANISM, never ANALYSIS:
 *
 *   - channel isolation  — a channel that throws or times out degrades ITSELF
 *                          and never poisons the page (degradation is data,
 *                          not an exception)
 *   - timeout policy     — the first tunable; a timed-out channel is reported
 *                          exactly like a thrown one, so presentation never
 *                          branches on the failure MODE, only on the fact
 *   - request coalescing — concurrent identical pages share one in-flight
 *                          analysis; the second caller awaits the first's
 *                          result instead of recomputing it
 *   - runtime telemetry  — deterministic counters for observability
 *
 * Determinism contract (Law 6): timers may decide WHETHER a channel lands, but
 * never WHAT it contains. A timeout produces a degradation record, never
 * partial or altered analysis content.
 */

export const CONSTELLATION_RUNTIME_VERSION = 'constellation-runtime-1';

/**
 * Default per-channel timeout. Deliberately generous: the runtime's job today
 * is to OWN the policy, not to start killing slow channels. Tighten per
 * channel with telemetry, never by guess.
 */
export const DEFAULT_CHANNEL_TIMEOUT_MS = 30000;

/**
 * Run one channel producer in isolation.
 *
 * @template T
 * @param {() => T | Promise<T>} fn the channel producer (pure w.r.t. its inputs)
 * @param {{ timeoutMs?: number }} [opts] timeoutMs <= 0 disables the timer
 * @returns {Promise<{ ok: true, value: T } | { ok: false, error: string, timedOut: boolean }>}
 *   Never throws. Degradation is returned, not raised.
 */
export async function runChannel(fn, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_CHANNEL_TIMEOUT_MS;
  try {
    const value = timeoutMs > 0 ? await withTimeout(fn(), timeoutMs) : await fn();
    return { ok: true, value };
  } catch (err) {
    if (err && err.__constellationTimeout) {
      return { ok: false, error: `channel exceeded ${err.timeoutMs}ms`, timedOut: true };
    }
    return { ok: false, error: err?.message ?? String(err), timedOut: false };
  }
}

/** Race a promise against a timer; the timer's rejection carries a marker. */
function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('timeout');
      err.__constellationTimeout = true;
      err.timeoutMs = timeoutMs;
      reject(err);
    }, timeoutMs);
    // Never hold the event loop open for a channel that already settled.
    if (typeof timer.unref === 'function') timer.unref();
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

/**
 * Create a page runtime for one server's lifetime.
 *
 * @param {{ defaultTimeoutMs?: number }} [options]
 */
export function createConstellationRuntime(options = {}) {
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_CHANNEL_TIMEOUT_MS;
  /** @type {Map<string, Promise<any>>} in-flight coalesced analyses */
  const inflight = new Map();
  const counters = { channelsRun: 0, channelsDegraded: 0, coalescedHits: 0 };

  return {
    version: CONSTELLATION_RUNTIME_VERSION,

    /**
     * Run a channel through the runtime's isolation + timeout policy.
     * @template T
     * @param {() => T | Promise<T>} fn
     * @param {{ timeoutMs?: number }} [opts]
     */
    async run(fn, opts = {}) {
      counters.channelsRun += 1;
      const result = await runChannel(fn, { timeoutMs: opts.timeoutMs ?? defaultTimeoutMs });
      if (!result.ok) counters.channelsDegraded += 1;
      return result;
    },

    /**
     * Coalesce concurrent identical analyses. The FIRST caller computes; any
     * caller arriving while the analysis is in flight awaits the same promise.
     * The key is removed on settle — coalescing never caches results, it only
     * deduplicates concurrent work. (Result caching, if ever wanted, is a
     * separate concern with its own invalidation story.)
     *
     * @template T
     * @param {string} key analysis identity (query + per-request deps flags)
     * @param {() => Promise<T>} fn
     * @returns {Promise<T>}
     */
    async coalesced(key, fn) {
      if (inflight.has(key)) {
        counters.coalescedHits += 1;
        return inflight.get(key);
      }
      const promise = fn().finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise;
    },

    /** Deterministic observability — counters only, no wall-clock. */
    stats() {
      return {
        version: CONSTELLATION_RUNTIME_VERSION,
        channelsRun: counters.channelsRun,
        channelsDegraded: counters.channelsDegraded,
        coalescedHits: counters.coalescedHits,
        inflightCoalesced: inflight.size,
      };
    },
  };
}

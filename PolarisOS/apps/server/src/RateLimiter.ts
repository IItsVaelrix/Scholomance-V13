/**
 * RateLimiter — per-key sliding-window command throttle (PDR §21).
 *
 * PDR §21 (P0 security): "rate-limit command submission." A single client must
 * not be able to flood the serialized room actor and starve other players or
 * exhaust the event ledger. This is a fixed-window-per-key sliding limiter:
 * each key (a connectionId) may make at most `maxRequests` attempts within the
 * trailing `windowMs` milliseconds.
 *
 * DESIGN:
 *   - Pure and synchronous. No timers, no async, no infrastructure imports.
 *   - The clock is injectable so tests advance time deterministically.
 *   - Expired timestamps are pruned on every call, so memory stays bounded by
 *     (active keys × maxRequests) without a background sweep.
 */

export interface RateLimiterOptions {
  /** Injectable clock (ms epoch). Defaults to Date.now. */
  now?: () => number;
}

export class RateLimiter {
  private maxRequests: number;
  private windowMs: number;
  private now: () => number;
  private hits: Map<string, number[]> = new Map();

  constructor(maxRequests: number, windowMs: number, options: RateLimiterOptions = {}) {
    if (!Number.isInteger(maxRequests) || maxRequests < 1) {
      throw new Error("RateLimiter: maxRequests must be a positive integer");
    }
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new Error("RateLimiter: windowMs must be a positive number");
    }
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Record an attempt for `key` and report whether it is allowed.
   * Returns true if the attempt is within budget, false if rate-limited.
   * A rejected attempt is NOT counted against the budget (it did not consume a
   * slot), so a client that backs off recovers as old attempts age out.
   */
  allow(key: string): boolean {
    const t = this.now();
    const cutoff = t - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > cutoff);

    if (recent.length >= this.maxRequests) {
      this.hits.set(key, recent);
      return false;
    }

    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }

  /** Number of in-window attempts currently tracked for a key (test helper). */
  count(key: string): number {
    const t = this.now();
    const cutoff = t - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > cutoff);
    this.hits.set(key, recent);
    return recent.length;
  }

  /** Drop all tracked state for a key (e.g. on disconnect). */
  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Drop all tracked state. */
  clear(): void {
    this.hits.clear();
  }
}

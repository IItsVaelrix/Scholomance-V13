/**
 * RateLimiter unit tests (PDR §21 "rate-limit command submission").
 *
 * Uses an injectable clock so the sliding window is exercised deterministically
 * without real timers.
 */
import { describe, it, expect } from "vitest";
import { RateLimiter } from "../src/RateLimiter.js";

function makeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("RateLimiter", () => {
  it("allows up to maxRequests within the window", () => {
    const clock = makeClock();
    const limiter = new RateLimiter(3, 1000, { now: clock.now });

    expect(limiter.allow("conn")).toBe(true);
    expect(limiter.allow("conn")).toBe(true);
    expect(limiter.allow("conn")).toBe(true);
    expect(limiter.allow("conn")).toBe(false); // 4th in the same window
  });

  it("rejects do not consume a slot", () => {
    const clock = makeClock();
    const limiter = new RateLimiter(2, 1000, { now: clock.now });

    expect(limiter.allow("c")).toBe(true);
    expect(limiter.allow("c")).toBe(true);
    expect(limiter.allow("c")).toBe(false);
    expect(limiter.allow("c")).toBe(false);
    // Only two attempts are tracked, not four.
    expect(limiter.count("c")).toBe(2);
  });

  it("recovers as old attempts age out of the sliding window", () => {
    const clock = makeClock();
    const limiter = new RateLimiter(2, 1000, { now: clock.now });

    expect(limiter.allow("c")).toBe(true); // t=1000000
    clock.advance(600);
    expect(limiter.allow("c")).toBe(true); // t=1000600
    expect(limiter.allow("c")).toBe(false); // full

    clock.advance(500); // t=1001100 → first attempt (t=1000000) is >1000ms old
    expect(limiter.allow("c")).toBe(true); // slot freed
  });

  it("tracks keys independently", () => {
    const clock = makeClock();
    const limiter = new RateLimiter(1, 1000, { now: clock.now });

    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    expect(limiter.allow("b")).toBe(true); // separate budget
    expect(limiter.allow("b")).toBe(false);
  });

  it("reset(key) clears a single key; clear() wipes all", () => {
    const clock = makeClock();
    const limiter = new RateLimiter(1, 1000, { now: clock.now });

    limiter.allow("a");
    limiter.allow("b");
    limiter.reset("a");
    expect(limiter.count("a")).toBe(0);
    expect(limiter.count("b")).toBe(1);

    limiter.clear();
    expect(limiter.count("b")).toBe(0);
  });

  it("validates its configuration", () => {
    expect(() => new RateLimiter(0, 1000)).toThrow();
    expect(() => new RateLimiter(1.5, 1000)).toThrow();
    expect(() => new RateLimiter(1, 0)).toThrow();
    expect(() => new RateLimiter(1, -5)).toThrow();
  });
});

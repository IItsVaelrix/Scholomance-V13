import { describe, it, expect } from 'vitest';
import {
  runChannel,
  createConstellationRuntime,
  CONSTELLATION_RUNTIME_VERSION,
  DEFAULT_CHANNEL_TIMEOUT_MS,
} from '../../codex/runtime/constellationRuntime.js';

describe('runChannel — channel isolation', () => {
  it('returns the value of a sync producer without throwing', async () => {
    const result = await runChannel(() => 42, { timeoutMs: 0 });
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('returns the value of an async producer', async () => {
    const result = await runChannel(async () => 'settled', { timeoutMs: 0 });
    expect(result).toEqual({ ok: true, value: 'settled' });
  });

  it('converts a thrown channel into degradation data, never an exception', async () => {
    const result = await runChannel(() => { throw new Error('lexicon exploded'); }, { timeoutMs: 0 });
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.error).toBe('lexicon exploded');
  });

  it('converts a non-Error throw into a string', async () => {
    const result = await runChannel(() => { throw 'bare'; }, { timeoutMs: 0 });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('bare');
  });

  it('times out a slow channel and marks it timedOut', async () => {
    const result = await runChannel(
      () => new Promise((resolve) => setTimeout(resolve, 200)),
      { timeoutMs: 20 },
    );
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.error).toContain('20ms');
  });

  it('does not time out a channel that settles in time', async () => {
    const result = await runChannel(
      () => new Promise((resolve) => setTimeout(() => resolve('fast'), 5)),
      { timeoutMs: 500 },
    );
    expect(result).toEqual({ ok: true, value: 'fast' });
  });
});

describe('createConstellationRuntime — orchestration', () => {
  it('exposes its version and the default timeout policy', () => {
    const runtime = createConstellationRuntime();
    expect(runtime.version).toBe(CONSTELLATION_RUNTIME_VERSION);
    expect(DEFAULT_CHANNEL_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('counts channel runs and degradations deterministically', async () => {
    const runtime = createConstellationRuntime({ defaultTimeoutMs: 0 });
    await runtime.run(() => 1);
    await runtime.run(() => { throw new Error('nope'); });
    const stats = runtime.stats();
    expect(stats.channelsRun).toBe(2);
    expect(stats.channelsDegraded).toBe(1);
    expect(stats.coalescedHits).toBe(0);
    expect(stats.inflightCoalesced).toBe(0);
  });

  it('coalesces concurrent identical analyses into ONE computation', async () => {
    const runtime = createConstellationRuntime();
    let computations = 0;
    const work = () => new Promise((resolve) => {
      computations += 1;
      setTimeout(() => resolve({ answer: computations }), 30);
    });

    const [a, b, c] = await Promise.all([
      runtime.coalesced('same-key', work),
      runtime.coalesced('same-key', work),
      runtime.coalesced('same-key', work),
    ]);

    expect(computations).toBe(1);
    expect(a).toEqual({ answer: 1 });
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(runtime.stats().coalescedHits).toBe(2);
  });

  it('does not coalesce different analysis identities', async () => {
    const runtime = createConstellationRuntime();
    let computations = 0;
    const work = () => { computations += 1; return Promise.resolve(computations); };

    await Promise.all([
      runtime.coalesced('query-a', work),
      runtime.coalesced('query-b', work),
    ]);

    expect(computations).toBe(2);
  });

  it('clears the coalescing key after settle — later calls recompute', async () => {
    const runtime = createConstellationRuntime();
    let computations = 0;
    const work = () => { computations += 1; return Promise.resolve(computations); };

    await runtime.coalesced('k', work);
    await runtime.coalesced('k', work);

    expect(computations).toBe(2);
    expect(runtime.stats().inflightCoalesced).toBe(0);
  });

  it('clears the coalescing key even when the analysis fails', async () => {
    const runtime = createConstellationRuntime();
    const failing = () => Promise.reject(new Error('boom'));

    await expect(runtime.coalesced('k', failing)).rejects.toThrow('boom');
    expect(runtime.stats().inflightCoalesced).toBe(0);

    // A retry after failure must recompute, not replay the dead promise.
    const recovered = await runtime.coalesced('k', () => Promise.resolve('ok'));
    expect(recovered).toBe('ok');
  });
});

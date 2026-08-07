/* @vitest-environment node */
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { subtletyApmHourlyPlugin } from '../../../codex/server/plugins/subtlety-apm-hourly.plugin.js';

describe('Subtlety APM hourly Fastify plugin', () => {
  it('starts after readiness and stops cleanly', async () => {
    const reporter = { start: vi.fn(), stop: vi.fn(async () => {}) };
    const app = Fastify({ logger: false });
    await app.register(subtletyApmHourlyPlugin, { reporter });
    expect(reporter.start).not.toHaveBeenCalled();
    await app.ready();
    expect(reporter.start).toHaveBeenCalledOnce();
    await app.close();
    expect(reporter.stop).toHaveBeenCalledOnce();
  });

  it('keeps readiness and close alive when reporter hooks fail', async () => {
    const app = Fastify({ logger: false });
    await app.register(subtletyApmHourlyPlugin, {
      reporter: { start: () => { throw new Error('start failed'); }, stop: async () => { throw new Error('stop failed'); } },
    });
    // Fastify 5 ready()/close() resolve with the instance; the contract here
    // is that reporter hook failures never reject readiness or shutdown.
    // (Asserting toBeUndefined() crashes vitest's diff formatter on the
    // instance — use toBeDefined() + plain await.)
    await expect(app.ready()).resolves.toBeDefined();
    await app.close();
  });

  it('registers nothing when disabled', async () => {
    const reporter = { start: vi.fn(), stop: vi.fn(async () => {}) };
    const app = Fastify({ logger: false });
    await app.register(subtletyApmHourlyPlugin, { enabled: false, reporter });
    await app.ready();
    await app.close();
    expect(reporter.start).not.toHaveBeenCalled();
    expect(reporter.stop).not.toHaveBeenCalled();
  });
});

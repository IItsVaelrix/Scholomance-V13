/* @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import {
  reportNodeCrash,
  handleFatalCrash,
  installSubtletyNodeAdapters,
} from '../../../codex/server/subtlety-node-adapter.js';

describe('reportNodeCrash', () => {
  it('maps Error to crash event and calls ingest once', () => {
    const ingest = vi.fn(() => ({ deduped: false }));
    const err = new Error('boom');
    err.stack = 'Error: boom\n    at Object.<anonymous> (codex/server/index.js:10:5)';
    reportNodeCrash(err, { runtime: 'node-fly', unitId: 'crash.node-fly.unhandled', ingest });
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest.mock.calls[0][0].errorType).toBe('Error');
    expect(ingest.mock.calls[0][0].message).toBe('boom');
    expect(ingest.mock.calls[0][0].unitId).toBe('crash.node-fly.unhandled');
    expect(ingest.mock.calls[0][0].runtime).toBe('node-fly');
  });

  it('does not throw when ingest rejects', async () => {
    const ingest = vi.fn(async () => {
      throw new Error('ingest down');
    });
    const err = new Error('boom');
    expect(() => {
      reportNodeCrash(err, { ingest, logger: { warn: vi.fn() } });
    }).not.toThrow();
    await Promise.resolve();
  });
});

describe('handleFatalCrash', () => {
  it('calls exitFn(1) after sync ingest', () => {
    const ingest = vi.fn(() => ({ deduped: false }));
    const exitFn = vi.fn();
    handleFatalCrash(new Error('boom'), { ingest }, exitFn);
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(exitFn).toHaveBeenCalledWith(1);
  });

  it('calls exitFn(1) after async ingest settles', async () => {
    const ingest = vi.fn(async () => ({ deduped: false }));
    const exitFn = vi.fn();
    handleFatalCrash(new Error('boom'), { ingest }, exitFn);
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(exitFn).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(exitFn).toHaveBeenCalledWith(1);
  });

  it('calls exitFn(1) when ingest throws synchronously', () => {
    const ingest = vi.fn(() => {
      throw new Error('ingest down');
    });
    const exitFn = vi.fn();
    handleFatalCrash(new Error('boom'), { ingest, logger: { warn: vi.fn() } }, exitFn);
    expect(exitFn).toHaveBeenCalledWith(1);
  });
});

describe('installSubtletyNodeAdapters', () => {
  it('registers fatal process hooks for uncaughtException and unhandledRejection', () => {
    const onSpy = vi.spyOn(process, 'on');
    installSubtletyNodeAdapters({ ingest: vi.fn() });
    expect(onSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    onSpy.mockRestore();
  });

  it('ingests unhandledRejection without exiting by default', () => {
    const ingest = vi.fn(() => ({ deduped: false }));
    const handlers = new Map();
    const onSpy = vi.spyOn(process, 'on').mockImplementation((event, fn) => {
      handlers.set(event, fn);
      return process;
    });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);

    installSubtletyNodeAdapters({ ingest });
    handlers.get('unhandledRejection')(new Error('float'));
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();

    onSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('wraps Fastify error handler and ingests 5xx without changing reply shape', async () => {
    const ingest = vi.fn(async () => ({ deduped: false }));
    const fastify = Fastify({ logger: false });

    fastify.setErrorHandler((error, request, reply) => {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) {
        reply.status(statusCode).send({
          error: 'Internal Server Error',
          message: error.message,
          bytecode: error.code || 'UNKNOWN_ERROR',
        });
      } else {
        reply.status(statusCode).send(error);
      }
    });

    fastify.get('/boom', async () => {
      const err = new Error('server broke');
      err.statusCode = 500;
      throw err;
    });

    installSubtletyNodeAdapters({ fastify, ingest });
    await fastify.ready();

    const res2 = await fastify.inject({ method: 'GET', url: '/boom' });
    expect(res2.statusCode).toBe(500);
    expect(res2.json()).toEqual({
      error: 'Internal Server Error',
      message: 'server broke',
      bytecode: 'UNKNOWN_ERROR',
    });
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest.mock.calls[0][0].errorType).toBe('Error');

    await fastify.close();
  });
});

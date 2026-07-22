import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const subtletyHoisted = vi.hoisted(() => ({
  recordObserved: vi.fn(() => ({ fingerprint: { semanticChecksum: 'abc' } })),
  getSubtletyRuntime: vi.fn(() => ({
    recordObserved: (...args) => subtletyHoisted.recordObserved(...args),
  })),
}));

vi.mock('../../../../codex/core/pixelbrain/subtlety-runtime.js', () => ({
  getSubtletyRuntime: (...args) => subtletyHoisted.getSubtletyRuntime(...args),
}));

import { executeRoute } from '../../../../codex/core/pixelbrain/microprocessor-route.js';

function buildSampleRoute(onExecute) {
  let executeCalls = 0;
  return {
    route: {
      name: 'sample-route',
      steps: [
        {
          name: 'emit-marker',
          seam: { id: 'sample.emit', processor: 'sample', consumes: [], emits: ['fills.coordinates'] },
          execute(results) {
            executeCalls += 1;
            onExecute?.(results);
            results.fills = { coordinates: [{ x: 0, y: 0, partId: 'blade' }] };
          },
        },
      ],
    },
    getExecuteCalls: () => executeCalls,
  };
}

describe('executeRoute observed sampling (SUBTLETY_SAMPLE_ROUTES)', () => {
  const originalFlag = process.env.SUBTLETY_SAMPLE_ROUTES;

  beforeEach(() => {
    subtletyHoisted.recordObserved.mockClear();
    subtletyHoisted.getSubtletyRuntime.mockClear();
    delete process.env.SUBTLETY_SAMPLE_ROUTES;
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.SUBTLETY_SAMPLE_ROUTES;
    else process.env.SUBTLETY_SAMPLE_ROUTES = originalFlag;
  });

  it('does not record when the sampling flag is off', async () => {
    const { route, getExecuteCalls } = buildSampleRoute();
    const results = executeRoute(route, { spec: { parts: [{ id: 'blade' }] } });

    expect(results.diagnostics.ok).toBe(true);
    expect(getExecuteCalls()).toBe(1);
    await Promise.resolve();
    expect(subtletyHoisted.getSubtletyRuntime).not.toHaveBeenCalled();
    expect(subtletyHoisted.recordObserved).not.toHaveBeenCalled();
  });

  it('records once after successful execution when the flag is on', async () => {
    process.env.SUBTLETY_SAMPLE_ROUTES = '1';
    const { route, getExecuteCalls } = buildSampleRoute();
    const context = { spec: { parts: [{ id: 'blade' }] } };
    const results = executeRoute(route, context);

    expect(results.diagnostics.ok).toBe(true);
    expect(getExecuteCalls()).toBe(1);
    await vi.waitFor(() => {
      expect(subtletyHoisted.getSubtletyRuntime).toHaveBeenCalledTimes(1);
      expect(subtletyHoisted.recordObserved).toHaveBeenCalledTimes(1);
    });
    expect(subtletyHoisted.recordObserved).toHaveBeenCalledWith(
      { unitId: 'route.sample-route' },
      results,
      expect.objectContaining({ mode: 'observed' }),
    );
  });

  it('does not record when route execution fails', async () => {
    process.env.SUBTLETY_SAMPLE_ROUTES = '1';
    const route = {
      name: 'failing-route',
      steps: [
        {
          name: 'boom',
          seam: { id: 'boom.emit', processor: 'boom', consumes: [], emits: ['fills.coordinates'] },
          execute() {
            throw new Error('step failed');
          },
        },
      ],
    };

    const results = executeRoute(route, {});
    expect(results.diagnostics.ok).toBe(false);
    await Promise.resolve();
    expect(subtletyHoisted.recordObserved).not.toHaveBeenCalled();
  });

  it('does not throw when recordObserved fails', async () => {
    process.env.SUBTLETY_SAMPLE_ROUTES = '1';
    subtletyHoisted.recordObserved.mockImplementation(() => {
      throw new Error('store unavailable');
    });
    const { route, getExecuteCalls } = buildSampleRoute();

    const results = executeRoute(route, {});
    expect(results.diagnostics.ok).toBe(true);
    expect(getExecuteCalls()).toBe(1);
    await vi.waitFor(() => {
      expect(subtletyHoisted.recordObserved).toHaveBeenCalledTimes(1);
    });
    expect(results.diagnostics.ok).toBe(true);
  });
});

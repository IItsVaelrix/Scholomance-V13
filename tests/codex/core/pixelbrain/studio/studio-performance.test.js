import { performance } from 'node:perf_hooks';
import { describe, expect, test } from 'vitest';

import { GrassAMP } from '../../../../../codex/core/pixelbrain/grass-amp.js';
import { previewStudioAmp } from '../../../../../codex/core/pixelbrain/studio/studio-amp-execution.js';

describe('Studio preview budgets', () => {
  test('renders a warmed 64×64 SWARD preview within the synchronous budget', () => {
    GrassAMP({ width: 16, height: 16, seed: 1 });
    const start = performance.now();
    const result = GrassAMP({ width: 64, height: 64, seed: 23063 });
    const elapsed = performance.now() - start;
    expect(result.field).toHaveLength(64 * 64);
    expect(elapsed).toBeLessThan(150);
  });

  test('renders a requested 256×256 preview within 500 ms after lawful engine clamping', () => {
    GrassAMP({ width: 16, height: 16, seed: 1 });
    const start = performance.now();
    const result = GrassAMP({ width: 256, height: 256, seed: 23063 });
    const elapsed = performance.now() - start;
    // SWARD's source engine caps each side at 128; the wrapper preserves that
    // safety law instead of allocating an unbounded field.
    expect(result.field).toHaveLength(128 * 128);
    expect(elapsed).toBeLessThan(500);
  });

  test('honours cancellation before adapter dispatch', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(previewStudioAmp({
      ampId: 'grass',
      snapshot: { checksum: 'asset:cancel', width: 64, height: 64, seed: 1 },
      options: { signal: controller.signal },
    })).rejects.toThrow('PB-STUDIO-JOB-CANCELLED');
  });

  test('reports named progress phases for cancellable Studio jobs', async () => {
    const phases = [];
    await previewStudioAmp({
      ampId: 'grass',
      snapshot: { checksum: 'asset:progress', width: 16, height: 16, seed: 1 },
      options: { onProgress: ({ percent, phase }) => phases.push([percent, phase]) },
    });
    expect(phases).toEqual([
      [10, 'resolve'],
      [35, 'prepare'],
      [90, 'checksum'],
      [100, 'complete'],
    ]);
  });
});

import { describe, it, expect } from 'vitest';
import {
  gateFrontier,
  FRONTIER_PROCESS_GATE_CONTRACT,
} from '../../../../codex/core/pixelbrain/frontier-process-gate.js';

describe('frontier-process-gate (novel density extension)', () => {
  it('PASSes STABLE process verdict and preserves frontier', () => {
    const frontier = [{ id: 'a' }, { id: 'b' }];
    const out = gateFrontier({ processVerdict: 'STABLE', frontier });
    expect(out.contract).toBe(FRONTIER_PROCESS_GATE_CONTRACT);
    expect(out.validationVerdict).toBe('PASS');
    expect(out.gatedFrontier).toEqual(frontier);
  });

  it('FAILs DEVIATION — process drift blocks the frontier', () => {
    const out = gateFrontier({
      processVerdict: 'DEVIATION',
      frontier: [{ id: 'a' }],
    });
    expect(out.validationVerdict).toBe('FAIL');
    expect(out.gatedFrontier).toEqual([]);
    expect(out.reason).toBe('PROCESS_DEVIATION');
  });

  it('refuses non-array frontier', () => {
    expect(() => gateFrontier({ processVerdict: 'STABLE', frontier: null }))
      .toThrow(/frontier must be an array/);
  });
});

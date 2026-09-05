import { describe, expect, it } from 'vitest';
import { createStudioAmpPlan } from '../../../../../codex/core/pixelbrain/studio/studio-amp-planner.js';

const records = [
  { ampId: 'late', order: 20, kind: 'runnable', writes: ['shading'] },
  { ampId: 'early', order: 10, kind: 'runnable', writes: ['geometry'] },
  { ampId: 'unused', order: 30, kind: 'support', writes: [] },
];

describe('createStudioAmpPlan', () => {
  it('orders selected AMPs deterministically and explains skips', () => {
    const input = { snapshotChecksum: 'asset1:abc', records, selectedIds: ['late', 'early'] };
    const first = createStudioAmpPlan(input);
    const second = createStudioAmpPlan({ ...input, records: [...records].reverse(), selectedIds: ['early', 'late'] });

    expect(first.steps.map((step) => step.ampId)).toEqual(['early', 'late']);
    expect(first.skipped).toEqual([{ ampId: 'unused', reason: 'not selected' }]);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.planChecksum).toMatch(/^studio-plan1:[a-f0-9]{64}$/);
  });

  it('refuses ambiguous writes instead of silently using last writer wins', () => {
    expect(() => createStudioAmpPlan({
      snapshotChecksum: 'asset1:abc',
      records: [
        { ampId: 'a', order: 1, kind: 'mutation', writes: ['pixels'] },
        { ampId: 'b', order: 2, kind: 'mutation', writes: ['pixels'] },
      ],
      selectedIds: ['a', 'b'],
    })).toThrow('PB-STUDIO-CONFLICT: a and b write pixels');
  });

  it('rejects a selected id absent from the manifest', () => {
    expect(() => createStudioAmpPlan({
      snapshotChecksum: 'asset1:abc', records, selectedIds: ['ghost'],
    })).toThrow('PB-STUDIO-UNKNOWN-AMP: ghost');
  });

  it('replays the same plan checksum one hundred times', () => {
    const input = { snapshotChecksum: 'asset1:repeat', records, selectedIds: ['early', 'late'] };
    const expected = createStudioAmpPlan(input);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      expect(createStudioAmpPlan(input)).toEqual(expected);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  acceptStudioMutation,
  beginStudioMutation,
  getStudioAmpManifest,
  planStudioAmps,
  rejectStudioMutation,
} from '../../src/lib/pixelbrain.adapter.js';

describe('PixelBrain Studio adapter boundary', () => {
  it('exposes the exhaustive frozen Studio manifest', () => {
    const records = getStudioAmpManifest();
    expect(records.length).toBeGreaterThanOrEqual(54);
    expect(new Set(records.map((record) => record.modulePath)).size).toBe(records.length);
    expect(Object.isFrozen(records)).toBe(true);
  });

  it('plans through the adapter without importing core from UI callers', () => {
    const record = getStudioAmpManifest().find((entry) => entry.kind === 'runnable');
    const plan = planStudioAmps({ snapshotChecksum: 'asset1:adapter', selectedIds: [record.ampId] });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].ampId).toBe(record.ampId);
  });

  it('keeps rejected mutations on the exact original snapshot', () => {
    const base = Object.freeze({ checksum: 'asset1:base', pixels: Object.freeze([1]) });
    const transaction = beginStudioMutation({
      base,
      result: { checksum: 'asset1:candidate', pixels: [2] },
      ampId: 'noise-fill',
    });
    expect(rejectStudioMutation({ current: base, transaction })).toBe(base);
    expect(acceptStudioMutation({ current: base, transaction })).toMatchObject({
      checksum: 'asset1:candidate', parentChecksum: 'asset1:base', mutationAmpId: 'noise-fill',
    });
  });
});

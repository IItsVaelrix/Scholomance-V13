import { describe, expect, it } from 'vitest';
import {
  acceptMutation,
  createMutationCandidate,
  rejectMutation,
} from '../../../../../codex/core/pixelbrain/studio/studio-mutation-transaction.js';

describe('Studio mutation transactions', () => {
  const base = Object.freeze({ checksum: 'asset1:base', pixels: Object.freeze([1, 2, 3]) });

  it('creates an immutable candidate without altering the baseline', () => {
    const transaction = createMutationCandidate(base, { checksum: 'asset1:next', pixels: [1, 4, 3] }, 'noise-fill');
    expect(transaction.baseChecksum).toBe('asset1:base');
    expect(transaction.candidate.pixels).toEqual([1, 4, 3]);
    expect(base.pixels).toEqual([1, 2, 3]);
    expect(Object.isFrozen(transaction)).toBe(true);
    expect(Object.isFrozen(transaction.candidate.pixels)).toBe(true);
  });

  it('accepts against the exact baseline and records lineage', () => {
    const transaction = createMutationCandidate(base, { checksum: 'asset1:next', pixels: [1, 4, 3] }, 'noise-fill');
    expect(acceptMutation(base, transaction)).toMatchObject({
      checksum: 'asset1:next', parentChecksum: 'asset1:base', mutationAmpId: 'noise-fill',
    });
  });

  it('refuses stale acceptance and makes rejection an identity no-op', () => {
    const transaction = createMutationCandidate(base, { checksum: 'asset1:next', pixels: [1, 4, 3] }, 'noise-fill');
    expect(() => acceptMutation({ ...base, checksum: 'asset1:other' }, transaction)).toThrow('PB-STUDIO-STALE-BASELINE');
    expect(rejectMutation(base, transaction)).toBe(base);
  });
});

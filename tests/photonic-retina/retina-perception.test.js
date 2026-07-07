import { describe, expect, it } from 'vitest';
import {
  assemblePerceptionFrame,
  fullAttendFrame,
} from '../../src/lib/photonic-retina/retina-perception.js';

function frame(changed, committed, shadow, rows, cols) {
  return assemblePerceptionFrame({
    changedMask: Uint8Array.from(changed),
    committedMask: Uint8Array.from(committed),
    shadowMask: Uint8Array.from(shadow),
    rows,
    cols,
    generation: 3,
  });
}

describe('assemblePerceptionFrame', () => {
  it('attends changed, uncommitted cells', () => {
    const f = frame([1, 0], [0, 0], [0, 0], 1, 2);
    expect(Array.from(f.attendMask)).toEqual([1, 0]);
  });

  it('ignores changed but committed cells (the core win)', () => {
    const f = frame([1, 1], [1, 1], [0, 0], 1, 2);
    expect(Array.from(f.attendMask)).toEqual([0, 0]);
    expect(Array.from(f.attendIndices)).toEqual([]);
  });

  it('re-wakes a committed, unchanged cell whose shadow moved (non-local)', () => {
    const f = frame([0, 0], [1, 1], [0, 1], 1, 2);
    expect(Array.from(f.attendMask)).toEqual([0, 1]);
    expect(Array.from(f.attendIndices)).toEqual([1]);
  });

  it('is deterministic including frameHash', () => {
    const a = frame([1, 0], [0, 1], [0, 1], 1, 2);
    const b = frame([1, 0], [0, 1], [0, 1], 1, 2);
    expect(a.frameHash).toBe(b.frameHash);
  });

  it('frameHash is a content fingerprint: ignores generation, reflects mask differences', () => {
    const base = {
      changedMask: Uint8Array.from([1, 0, 0]),
      committedMask: Uint8Array.from([0, 1, 0]),
      shadowMask: Uint8Array.from([0, 1, 0]),
      rows: 1, cols: 3,
    };
    const g3 = assemblePerceptionFrame({ ...base, generation: 3 });
    const g9 = assemblePerceptionFrame({ ...base, generation: 9 });
    expect(g9.frameHash).toBe(g3.frameHash); // generation excluded

    // Flip committed on cell 2 (changed=0, shadow=0) so attendMask is UNCHANGED.
    // The hash must still differ — proving committedMask is fingerprinted
    // independently, not just via its effect on attendMask.
    const diffCommitted = assemblePerceptionFrame({
      ...base, committedMask: Uint8Array.from([0, 1, 1]), generation: 3,
    });
    expect(Array.from(diffCommitted.attendMask)).toEqual(Array.from(g3.attendMask));
    expect(diffCommitted.frameHash).not.toBe(g3.frameHash);
  });

  it('throws on mask length mismatch', () => {
    expect(() => assemblePerceptionFrame({
      changedMask: Uint8Array.from([1]),
      committedMask: Uint8Array.from([0, 0]),
      shadowMask: Uint8Array.from([0, 0]),
      rows: 1, cols: 2, generation: 0,
    })).toThrow(/length/i);
  });
});

describe('fullAttendFrame', () => {
  it('attends every cell', () => {
    const f = fullAttendFrame(2, 2, 0);
    expect(f.cellCount).toBe(4);
    expect(Array.from(f.attendMask)).toEqual([1, 1, 1, 1]);
    expect(Array.from(f.attendIndices)).toEqual([0, 1, 2, 3]);
  });
});

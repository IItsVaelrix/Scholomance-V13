// tests/pixelbrain/lattice-perception-bridge.test.js
import { describe, expect, it } from 'vitest';
import { buildLatticePerceptionFrame } from '../../codex/core/pixelbrain/lattice-perception-bridge.js';

const cols = 2;
const rows = 2;

function latticeFrom(entries) {
  const cells = new Map();
  for (const e of entries) cells.set(`${e.col},${e.row}`, e);
  return { cells };
}

describe('buildLatticePerceptionFrame', () => {
  it('first generation (no previous) attends every occupied-or-changed cell', () => {
    const lattice = latticeFrom([
      { col: 0, row: 0, color: '#112233', emphasis: 1, symmetrySource: 'original' },
    ]);
    const shadowField = Float64Array.from([0, 0, 0, 0]);
    const { frame, snapshot } = buildLatticePerceptionFrame({
      lattice, shadowField, cols, rows, previous: null, generation: 0,
    });
    expect(frame.cellCount).toBe(4);
    // first tick: diffCellSignatures(null, curr) => all changed; none committed yet matters
    // but committed cell 0 (snapStable+symmetric+energy) is committed => not attended
    // cells 1..3 empty => changed=1 (first tick), committed=0 => attended
    expect(Array.from(frame.attendIndices)).toEqual([1, 2, 3]);
    expect(snapshot.cells.length).toBe(4);
  });

  it('the core win: identical lattice + identical shadow next generation attends nothing', () => {
    const lattice = latticeFrom([
      { col: 0, row: 0, color: '#112233', emphasis: 1, symmetrySource: 'original' },
      { col: 1, row: 0, color: '#445566', emphasis: 1, symmetrySource: 'original' },
      { col: 0, row: 1, color: '#778899', emphasis: 1, symmetrySource: 'original' },
      { col: 1, row: 1, color: '#aabbcc', emphasis: 1, symmetrySource: 'original' },
    ]);
    const shadowField = Float64Array.from([0, 0, 0, 0]);
    const first = buildLatticePerceptionFrame({ lattice, shadowField, cols, rows, previous: null, generation: 0 });
    const second = buildLatticePerceptionFrame({
      lattice, shadowField, cols, rows, previous: first.snapshot, generation: 1,
    });
    expect(Array.from(second.frame.attendIndices)).toEqual([]);
  });

  it('non-local shadow re-wakes a committed, unchanged cell', () => {
    const lattice = latticeFrom([
      { col: 0, row: 0, color: '#112233', emphasis: 1, symmetrySource: 'original' },
      { col: 1, row: 0, color: '#445566', emphasis: 1, symmetrySource: 'original' },
    ]);
    const prevShadow = Float64Array.from([0, 0, 0, 0]);
    const first = buildLatticePerceptionFrame({ lattice, shadowField: prevShadow, cols, rows, previous: null, generation: 0 });
    // cell (1,0)=index 1 shadow shifts; lattice unchanged
    const nextShadow = Float64Array.from([0, 0.25, 0, 0]);
    const second = buildLatticePerceptionFrame({
      lattice, shadowField: nextShadow, cols, rows, previous: first.snapshot, generation: 1,
    });
    expect(Array.from(second.frame.attendIndices)).toEqual([1]);
  });
});

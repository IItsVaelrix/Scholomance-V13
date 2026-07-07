import { describe, expect, it } from 'vitest';
import {
  buildCellSignatures,
  diffCellSignatures,
  diffShadowField,
  assemblePerceptionFrame,
} from '../../src/lib/photonic-retina/index.js';
import { buildCommittedMask } from '../../codex/core/pixelbrain/qbit-placement-memory.js';

const rows = 1;
const cols = 3;
const committedEvidence = [
  { snapStable: true, symmetryAgreement: 1, energy: 1 },
  { snapStable: true, symmetryAgreement: 1, energy: 1 },
  { snapStable: true, symmetryAgreement: 1, energy: 1 },
];

describe('end-to-end perception tick', () => {
  it('the core win: a settled, unchanged, unlit-change canvas attends nothing', () => {
    const cells = [
      { color: '#112233', emphasis: 1, occupied: true },
      { color: '#445566', emphasis: 1, occupied: true },
      { color: '#778899', emphasis: 1, occupied: true },
    ];
    const prev = buildCellSignatures(cells);
    const curr = buildCellSignatures(cells);
    const shadowPrev = [0.2, 0.2, 0.2];
    const shadowCurr = [0.2, 0.2, 0.2];

    const frame = assemblePerceptionFrame({
      changedMask: diffCellSignatures(prev, curr),
      committedMask: buildCommittedMask(committedEvidence, { generation: 5 }),
      shadowMask: diffShadowField(shadowPrev, shadowCurr),
      rows, cols, generation: 5,
    });

    expect(Array.from(frame.attendIndices)).toEqual([]);
  });

  it('non-local shadow re-wakes a committed neighbour when an occluder lands', () => {
    // Cell 0 gets newly occupied (the occluder); cells 1,2 unchanged but their
    // shadow shifts because of the new occluder.
    const before = [null,
      { color: '#445566', emphasis: 1, occupied: true },
      { color: '#778899', emphasis: 1, occupied: true }];
    const after = [{ color: '#000000', emphasis: 1, occupied: true },
      { color: '#445566', emphasis: 1, occupied: true },
      { color: '#778899', emphasis: 1, occupied: true }];
    const prev = buildCellSignatures(before);
    const curr = buildCellSignatures(after);
    const shadowPrev = [0.2, 0.2, 0.2];
    const shadowCurr = [0.2, 0.6, 0.5]; // occluder darkened neighbours

    const frame = assemblePerceptionFrame({
      changedMask: diffCellSignatures(prev, curr),
      committedMask: buildCommittedMask(committedEvidence, { generation: 6 }),
      shadowMask: diffShadowField(shadowPrev, shadowCurr),
      rows, cols, generation: 6,
    });

    // Cell 0: changed + committed => ignored by placement, but its own shadow
    // didn't move. Cells 1,2: committed + unchanged, but shadow moved => attend.
    expect(Array.from(frame.attendIndices)).toEqual([1, 2]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  PLACEMENT_COMMIT_THRESHOLD,
  evaluatePlacementCommit,
  buildCommittedMask,
} from '../../codex/core/pixelbrain/qbit-placement-memory.js';

describe('evaluatePlacementCommit', () => {
  it('commits a stable, symmetric, energetic cell', () => {
    const r = evaluatePlacementCommit(
      { snapStable: true, symmetryAgreement: 1, energy: 1 },
      { generation: 7 },
    );
    expect(r.committed).toBe(true);
    expect(r.confidence).toBeGreaterThanOrEqual(PLACEMENT_COMMIT_THRESHOLD);
    expect(r.generation).toBe(7);
  });

  it('is deterministic for identical evidence', () => {
    const e = { snapStable: true, symmetryAgreement: 0.5, energy: 0.5 };
    expect(evaluatePlacementCommit(e, { generation: 1 }))
      .toEqual(evaluatePlacementCommit(e, { generation: 1 }));
  });

  it('does not commit when placement is unstable (fail-safe => attend)', () => {
    const r = evaluatePlacementCommit({ snapStable: false, symmetryAgreement: 1, energy: 1 });
    expect(r.committed).toBe(false);
    expect(r.confidence).toBe(0);
  });

  it('does not commit on malformed evidence', () => {
    expect(evaluatePlacementCommit(null).committed).toBe(false);
    expect(evaluatePlacementCommit({}).committed).toBe(false);
  });
});

describe('buildCommittedMask', () => {
  it('marks committed cells in row-major order', () => {
    const mask = buildCommittedMask([
      { snapStable: true, symmetryAgreement: 1, energy: 1 },
      { snapStable: false, symmetryAgreement: 1, energy: 1 },
      null,
    ]);
    expect(Array.from(mask)).toEqual([1, 0, 0]);
  });
});

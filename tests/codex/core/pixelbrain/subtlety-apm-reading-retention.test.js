/* @vitest-environment node */
/**
 * Regression cover for the unbounded-readings leak behind the 2026-08-14 outage.
 *
 * Measured on the production volume before the fix:
 *   326 ledger records / 6,958,350 bytes  (~21KB per record, max 101,168)
 *   25,272 array entries across recovery.symptoms / recovery.proposals /
 *   seam.violations, of which 543 were unique -> 97.9% duplication.
 * The per-record signature was len=9 unique=1, len=10 unique=1, len=11
 * unique=1: one more copy of the same finding per assessment, because
 * `readings` was never evicted and assess() rebuilds its graph over all of it.
 *
 * These assertions are about MEMORY SHAPE, not report formatting, so they hold
 * regardless of how the reporter renders.
 */
import { describe, expect, it } from 'vitest';
import { createSubtletyApm } from '../../../../codex/core/pixelbrain/subtlety-fingerprint-apm.js';

const identity = (unitId) => ({ unitId, route: `/${unitId}`, method: 'GET' });

describe('Subtlety APM reading retention', () => {
  it('bounds retained readings per unit instead of growing forever', () => {
    const apm = createSubtletyApm();
    for (let i = 0; i < 500; i += 1) {
      apm.recordObserved(identity('unit-a'), { value: i % 3 });
    }
    const retained = apm.getReadings('unit-a');
    expect(retained.length).toBeLessThanOrEqual(50);
    // Newest must survive: drift is judged on recent behaviour.
    expect(retained.at(-1)).toBeTruthy();
  });

  it('keeps the NEWEST readings, not the oldest', () => {
    const apm = createSubtletyApm();
    for (let i = 0; i < 120; i += 1) {
      apm.recordObserved(identity('unit-b'), { marker: i });
    }
    const retained = apm.getReadings('unit-b');
    // The first reading must have been evicted; a stale-window bug would keep it.
    const markers = retained.map((packet) => packet?.execution?.marker);
    expect(retained.length).toBe(50);
    expect(markers).not.toContain(0);
  });

  it('keeps assessment cost flat as observations accumulate', () => {
    const findingsAfter = (n) => {
      const fresh = createSubtletyApm();
      for (let i = 0; i < n; i += 1) {
        fresh.recordObserved(identity('unit-c'), { value: i % 2 }, {
          seam: { consumes: ['ghost.field'], emits: [] },
        });
      }
      return fresh.getReadings('unit-c').length;
    };
    // The graph is rebuilt over every RETAINED reading, so retention is what
    // bounds assessment cost. 10x the traffic must not mean 10x the work.
    expect(findingsAfter(500)).toBe(findingsAfter(50));
  });
});

/*
 * DELIBERATELY NOT TESTED HERE: "assessments contain no duplicate findings".
 * Two such assertions were written and then deleted, because measurement showed
 * they passed identically with and without the change under test — the
 * synthetic readings produce 0 seam violations and 1 symptom, so "1 unique of
 * 1" is a check that cannot fail. Duplicate findings are prevented upstream in
 * buildDataflowGraph (de06db1b) and belong to subtlety-seam-flow's tests, where
 * a graph with repeated vocabulary can actually be constructed.
 */

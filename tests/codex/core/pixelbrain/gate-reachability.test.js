import { describe, it, expect } from 'vitest';
import {
  GATE_REACHABILITY_CONTRACT,
  gateReachability,
  verdictAdmissible,
} from '../../../../codex/core/pixelbrain/gate-reachability.js';

/** Minimal shortlist row: only the fields the nucleus floors actually read. */
const candidate = (finalScore, novelty, verdict = 'HYPOTHESIS') => ({
  finalScore,
  verdict,
  molecule: { atomIds: ['a', 'b', 'c'], novelty },
});

const FLOORS = { nucleusScoreFloor: 0.765, nucleusNoveltyFloor: 0.32 };

describe('gateReachability', () => {
  it('reports a gate as unreachable when no candidate can clear its floor', () => {
    // The super-heavy attack's real numbers: ceiling 0.7441 under a 0.765 floor.
    const candidates = [candidate(0.7441, 0.2213), candidate(0.7018, 0.1329)];

    const report = gateReachability({ candidates, floors: FLOORS });
    const score = report.gates.find((g) => g.name === 'nucleusScoreFloor');

    expect(score.reachable).toBe(false);
    expect(score.observedMax).toBeCloseTo(0.7441, 6);
    expect(score.clearedBy).toBe(0);
    expect(report.unreachable).toContain('nucleusScoreFloor');
  });

  it('reports a gate as reachable and counts the candidates clearing it', () => {
    const candidates = [candidate(0.7669, 0.4088), candidate(0.7612, 0.4364)];

    const report = gateReachability({ candidates, floors: FLOORS });
    const score = report.gates.find((g) => g.name === 'nucleusScoreFloor');
    const novelty = report.gates.find((g) => g.name === 'nucleusNoveltyFloor');

    expect(score.reachable).toBe(true);
    expect(score.clearedBy).toBe(1);
    expect(novelty.reachable).toBe(true);
    expect(novelty.clearedBy).toBe(2);
    expect(report.unreachable).toEqual([]);
  });

  it('refuses an empty shortlist rather than reporting every gate reachable', () => {
    expect(() => gateReachability({ candidates: [], floors: FLOORS }))
      .toThrow(/no candidates/i);
  });
});

describe('verdictAdmissible', () => {
  it('rules a zero-nucleus verdict INADMISSIBLE when a floor sits above the arm ceiling', () => {
    // CLIQUE arm of the density control: ceiling 0.758186, floor 0.765.
    const candidates = [candidate(0.758186, 0.4275), candidate(0.7519, 0.4099)];

    const ruling = verdictAdmissible({ candidates, floors: FLOORS, nucleusCount: 0 });

    expect(ruling.admissible).toBe(false);
    expect(ruling.reason).toMatch(/nucleusScoreFloor/);
    expect(ruling.reason).toMatch(/0\.758186/);
  });

  it('admits a zero-nucleus verdict when every floor was reachable', () => {
    // The discriminating case: nothing crowned, but nothing was gated out by config.
    // A guard that fails this test is just "complain whenever nuclei === 0".
    const candidates = [candidate(0.7700, 0.3300), candidate(0.7800, 0.4000)];

    const ruling = verdictAdmissible({ candidates, floors: FLOORS, nucleusCount: 0 });

    expect(ruling.admissible).toBe(true);
    expect(ruling.reason).toBeNull();
  });

  it('admits any verdict that actually crowned a nucleus', () => {
    const candidates = [candidate(0.7669, 0.4088, 'NUCLEUS'), candidate(0.70, 0.10)];

    const ruling = verdictAdmissible({ candidates, floors: FLOORS, nucleusCount: 1 });

    expect(ruling.admissible).toBe(true);
  });
});

describe('contract', () => {
  it('declares its identity', () => {
    expect(GATE_REACHABILITY_CONTRACT).toBe('PB-GATE-REACHABILITY-v1');
  });
});

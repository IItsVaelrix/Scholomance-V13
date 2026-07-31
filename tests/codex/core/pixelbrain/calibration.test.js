/**
 * Calibration Registry Tests
 * ========================================================================
 * Verifies that:
 *   1. Calibration data is well-formed and frozen
 *   2. All invariants hold under the LIVE synthesize() function
 *   3. Scores are deterministic (100-iteration replay)
 *   4. The known-positive (CAL-001) remains correctly classified
 */

import { describe, it, expect } from 'vitest';
import { synthesize, stabilityClass, weights } from '../../../../codex/core/pixelbrain/concept-chemistry.js';
import { cases, verifyInvariants } from '../../../../codex/core/pixelbrain/calibration/index.js';
import * as cal001 from '../../../../codex/core/pixelbrain/calibration/calibration-001-purity-assay.js';

describe('Calibration Registry', () => {
  describe('structure', () => {
    it('has at least one calibration case', () => {
      expect(cases.length).toBeGreaterThanOrEqual(1);
    });

    it('CAL-001 is frozen', () => {
      expect(Object.isFrozen(cal001.REACTIONS)).toBe(true);
      expect(Object.isFrozen(cal001.OUTCOME)).toBe(true);
      expect(Object.isFrozen(cal001.VERDICT)).toBe(true);
      expect(Object.isFrozen(cal001.INVARIANTS)).toBe(true);
    });

    it('CAL-001 has correct metadata', () => {
      expect(cal001.CALIBRATION_ID).toBe('CAL-001');
      expect(cal001.SCHEMA).toBe('PB-CHEM-CALIBRATION-v1');
      expect(cal001.CALIBRATION_DATE).toBe('2026-07-30');
    });

    it('CAL-001 weights match current canonical weights', () => {
      expect(cal001.WEIGHTS_AT_PREDICTION.W_BOND).toBe(weights.W_BOND);
      expect(cal001.WEIGHTS_AT_PREDICTION.W_GROUND).toBe(weights.W_GROUND);
      expect(cal001.WEIGHTS_AT_PREDICTION.W_COHERE).toBe(weights.W_COHERE);
      expect(cal001.WEIGHTS_AT_PREDICTION.STABLE_MIN).toBe(weights.STABLE_MIN);
      expect(cal001.WEIGHTS_AT_PREDICTION.METASTABLE_MIN).toBe(weights.METASTABLE_MIN);
    });

    it('CAL-001 has 9 reactions', () => {
      expect(cal001.REACTIONS.length).toBe(9);
    });

    it('every reaction has required fields', () => {
      for (const r of cal001.REACTIONS) {
        expect(r).toHaveProperty('id');
        expect(r).toHaveProperty('label');
        expect(r).toHaveProperty('a');
        expect(r).toHaveProperty('b');
        expect(r).toHaveProperty('product');
        expect(r).toHaveProperty('groundingA');
        expect(r).toHaveProperty('groundingB');
        expect(r).toHaveProperty('feasibility');
        expect(r).toHaveProperty('stability');
        expect(typeof r.feasibility).toBe('number');
        expect(['STABLE', 'METASTABLE', 'UNSTABLE']).toContain(r.stability);
      }
    });

    it('outcome records implementation success', () => {
      expect(cal001.OUTCOME.implemented).toBe(true);
      expect(cal001.OUTCOME.tests.passed).toBe(33);
      expect(cal001.OUTCOME.tests.failed).toBe(0);
      expect(cal001.OUTCOME.regressions.pixelbrainFailures).toBe(0);
    });

    it('verdict confirms prediction was correct', () => {
      expect(cal001.VERDICT.predictionCorrect).toBe(true);
      expect(cal001.VERDICT.predictedStability).toBe('STABLE');
      expect(cal001.VERDICT.actualOutcome).toBe('IMPLEMENTED_AND_PASSING');
    });
  });

  describe('invariant verification (live scoring)', () => {
    it('all invariants pass under current weights', () => {
      const report = verifyInvariants(synthesize);
      expect(report.failed).toBe(0);
      expect(report.passed).toBeGreaterThanOrEqual(5);
    });

    it('top reaction (R1) is STABLE with feasibility >= 0.55', () => {
      const r1 = cal001.REACTIONS.find((r) => r.id === 'R1');
      const live = synthesize({
        a: r1.a, b: r1.b, product: r1.product,
        groundingA: r1.groundingA, groundingB: r1.groundingB,
      });
      expect(live.stability).toBe('STABLE');
      expect(live.feasibility).toBeGreaterThanOrEqual(0.55);
    });

    it('law violation (CTRL-LAW) is killed at 0.000', () => {
      const lv = cal001.REACTIONS.find((r) => r.id === 'CTRL-LAW');
      const live = synthesize({
        a: lv.a, b: lv.b, product: lv.product,
        groundingA: lv.groundingA, groundingB: lv.groundingB,
      });
      expect(live.feasibility).toBe(0);
      expect(live.lawNote).toContain('LAW_VIOLATION');
    });

    it('false friend scores below all STABLE reactions', () => {
      const ff = cal001.REACTIONS.find((r) => r.id === 'CTRL-FF');
      const ffLive = synthesize({
        a: ff.a, b: ff.b, product: ff.product,
        groundingA: ff.groundingA, groundingB: ff.groundingB,
      });
      const stableIds = ['R0', 'R1', 'R5'];
      for (const id of stableIds) {
        const r = cal001.REACTIONS.find((x) => x.id === id);
        const live = synthesize({
          a: r.a, b: r.b, product: r.product,
          groundingA: r.groundingA, groundingB: r.groundingB,
        });
        expect(live.feasibility).toBeGreaterThan(ffLive.feasibility);
      }
    });

    it('metaphor is UNSTABLE', () => {
      const mt = cal001.REACTIONS.find((r) => r.id === 'CTRL-MT');
      const mtLive = synthesize({
        a: mt.a, b: mt.b, product: mt.product,
        groundingA: mt.groundingA, groundingB: mt.groundingB,
      });
      expect(mtLive.stability).toBe('UNSTABLE');
    });

    it('ranking is preserved exactly', () => {
      const scored = cal001.REACTIONS.map((r) => {
        const live = synthesize({
          a: r.a, b: r.b, product: r.product,
          groundingA: r.groundingA, groundingB: r.groundingB,
        });
        return { id: r.id, feasibility: live.feasibility };
      });
      const sorted = [...scored].sort((a, b) => b.feasibility - a.feasibility);
      const actualRanking = sorted.map((s) => s.id);
      expect(actualRanking).toEqual(cal001.INVARIANTS.expectedRanking);
    });
  });

  describe('determinism (100-iteration replay)', () => {
    it('all reactions produce identical scores across 100 iterations', () => {
      const baseline = cal001.REACTIONS.map((r) =>
        synthesize({
          a: r.a, b: r.b, product: r.product,
          groundingA: r.groundingA, groundingB: r.groundingB,
        }),
      );

      for (let i = 0; i < 100; i++) {
        const replay = cal001.REACTIONS.map((r) =>
          synthesize({
            a: r.a, b: r.b, product: r.product,
            groundingA: r.groundingA, groundingB: r.groundingB,
          }),
        );
        for (let j = 0; j < replay.length; j++) {
          expect(replay[j].checksum).toBe(baseline[j].checksum);
          expect(replay[j].feasibility).toBe(baseline[j].feasibility);
          expect(replay[j].stability).toBe(baseline[j].stability);
        }
      }
    });

    it('checksums are content-addressed and stable', () => {
      const r1 = cal001.REACTIONS.find((r) => r.id === 'R1');
      const s1 = synthesize({
        a: r1.a, b: r1.b, product: r1.product,
        groundingA: r1.groundingA, groundingB: r1.groundingB,
      });
      const s2 = synthesize({
        a: r1.a, b: r1.b, product: r1.product,
        groundingA: r1.groundingA, groundingB: r1.groundingB,
      });
      expect(s1.checksum).toBe(s2.checksum);
      expect(s1.checksum).toMatch(/^synth1:[0-9a-f]{16}$/);
    });
  });

  describe('stability class consistency', () => {
    it('recorded stability matches live stabilityClass()', () => {
      for (const r of cal001.REACTIONS) {
        const live = synthesize({
          a: r.a, b: r.b, product: r.product,
          groundingA: r.groundingA, groundingB: r.groundingB,
        });
        expect(live.stability).toBe(stabilityClass(live.feasibility));
        expect(live.stability).toBe(r.stability);
      }
    });
  });
});

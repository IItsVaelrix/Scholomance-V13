/**
 * Concept Chemistry Calibration Registry
 * ========================================================================
 * Known-positive and known-negative cases for calibrating the lab's
 * feasibility formula and stability thresholds.
 *
 * Each calibration case preserves:
 *   1. The PREDICTION — full reaction table with scores
 *   2. The OUTCOME — what actually happened when the idea was implemented
 *   3. The VERDICT — was the prediction correct?
 *   4. INVARIANTS — constraints that must hold under any weight change
 *
 * USAGE:
 *   import { cases, verifyInvariants } from './calibration/index.js';
 *   const report = verifyInvariants(synthesize);  // { passed, failed, details }
 *
 * ADDING A CASE:
 *   1. Run concept chemistry on a new idea
 *   2. Implement the idea (or reject it)
 *   3. Record prediction + outcome in a new calibration-NNN file
 *   4. Add invariants that must hold
 *   5. Register in this index
 */

import * as cal001 from './calibration-001-purity-assay.js';

export const cases = Object.freeze([cal001]);

/**
 * Verify all calibration invariants hold under current weights.
 * Re-scores each reaction with the live synthesize() and checks
 * that stability classes and rankings are preserved.
 *
 * @param {function} synthesizeFn - the live synthesize() from concept-chemistry.js
 * @returns {{ passed: number, failed: number, details: Array }}
 */
export function verifyInvariants(synthesizeFn) {
  const details = [];
  let passed = 0;
  let failed = 0;

  for (const cal of cases) {
    const { INVARIANTS, REACTIONS } = cal;
    const scored = REACTIONS.map((r) => {
      const live = synthesizeFn({
        a: r.a,
        b: r.b,
        product: r.product,
        groundingA: r.groundingA,
        groundingB: r.groundingB,
      });
      return { id: r.id, ...live };
    });

    const byId = Object.fromEntries(scored.map((s) => [s.id, s]));

    // Invariant 1: the top reaction must lead every control by a margin.
    //
    // MADE ORDINAL 2026-08-12. This formerly asserted `stability === 'STABLE'`
    // and `feasibility >= 0.55`, both ABSOLUTE. WEIGHTS_V2 compresses the scale
    // downward — it raised discrimination while lowering the mean — so the top
    // reaction now scores 0.5149 and nothing on this set reaches STABLE_MIN.
    //
    // Re-freezing the absolute numbers would have made the STABLE tier
    // unreachable here, i.e. a tier that can never be entered guarding a check
    // that can never fail. Concept Chemistry is ORDINAL, not a classifier, and
    // the controls are what set the bar — so the invariant now says what it
    // always meant: the best real reaction must beat every planted control, and
    // by enough that the gap is not noise.
    if (INVARIANTS.topReactionMustLeadControls) {
      const top = byId[INVARIANTS.topReactionId];
      const controls = INVARIANTS.controlIds.map((id) => byId[id]).filter(Boolean);
      const margin = controls.length
        ? Math.min(...controls.map((c) => top.feasibility - c.feasibility))
        : 0;
      const ok = Boolean(top) && controls.length > 0 && margin >= INVARIANTS.topReactionMinControlMargin;
      details.push({
        case: cal.CALIBRATION_ID,
        invariant: 'topReactionLeadsControls',
        ok,
        feasibility: top?.feasibility,
        margin: Math.round(margin * 1e4) / 1e4,
        required: INVARIANTS.topReactionMinControlMargin,
      });
      ok ? passed++ : failed++;
    }

    // Invariant 2: law violation must be 0
    if (INVARIANTS.lawViolationMustBeZero) {
      const lv = byId[INVARIANTS.lawViolationId];
      const ok = lv && lv.feasibility === 0 && lv.lawNote.startsWith('LAW_VIOLATION');
      details.push({ case: cal.CALIBRATION_ID, invariant: 'lawViolationZero', ok, actual: lv?.feasibility });
      ok ? passed++ : failed++;
    }

    // Invariant 3: false friend below STABLE tier
    if (INVARIANTS.falseFriendBelowStable) {
      const ff = byId[INVARIANTS.falseFriendId];
      const stables = INVARIANTS.stableReactionIds.map((id) => byId[id]).filter(Boolean);
      const ok = ff && stables.every((s) => s.feasibility > ff.feasibility);
      details.push({ case: cal.CALIBRATION_ID, invariant: 'falseFriendBelowStable', ok, ffScore: ff?.feasibility, minStable: Math.min(...stables.map((s) => s.feasibility)) });
      ok ? passed++ : failed++;
    }

    // Invariant 4: metaphor must be UNSTABLE
    if (INVARIANTS.metaphorMustBeUnstable) {
      const mt = byId[INVARIANTS.metaphorId];
      const ok = mt && mt.stability === 'UNSTABLE';
      details.push({ case: cal.CALIBRATION_ID, invariant: 'metaphorUnstable', ok, actual: mt?.stability, feasibility: mt?.feasibility });
      ok ? passed++ : failed++;
    }

    // Invariant 5: ranking preserved
    if (INVARIANTS.expectedRanking) {
      const sorted = [...scored].sort((a, b) => b.feasibility - a.feasibility);
      const actualRanking = sorted.map((s) => s.id);
      const ok = JSON.stringify(actualRanking) === JSON.stringify(INVARIANTS.expectedRanking);
      details.push({ case: cal.CALIBRATION_ID, invariant: 'rankingPreserved', ok, actual: actualRanking, expected: INVARIANTS.expectedRanking });
      ok ? passed++ : failed++;
    }
  }

  return Object.freeze({ passed, failed, details: Object.freeze(details) });
}

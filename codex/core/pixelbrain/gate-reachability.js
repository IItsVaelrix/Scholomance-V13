/**
 * GATE REACHABILITY — PB-GATE-REACHABILITY-v1
 *
 * A nucleus floor set above everything an atom bank can achieve makes
 * `NUCLEUS = 0` a property of the configuration, not of the hypothesis under
 * test. Every arm then reports the same verdict for the same irrelevant reason,
 * and "X was not crowned" becomes a tautology.
 *
 * This is the range-check sibling of the nucleus-value saturation check: run the
 * instrument against its own floors first, and refuse to publish a no-crown
 * verdict that the floors guaranteed.
 *
 * Observed instances (both 2026-08-11):
 *   - super-heavy attack: ceiling 0.7441 under nucleusScoreFloor 0.765 — every
 *     size reported 0 NUCLEUS, including the light controls.
 *   - architectural density control: CLIQUE ceiling 0.758186 under the same
 *     floor, so the negative arm could not have crowned at any size.
 */

export const GATE_REACHABILITY_CONTRACT = 'PB-GATE-REACHABILITY-v1';

/** Which shortlist field each nucleus floor is compared against. */
const GATE_SPECS = Object.freeze({
  nucleusScoreFloor: (c) => c.finalScore,
  nucleusNoveltyFloor: (c) => c.molecule?.novelty,
});

/**
 * Per-gate range report for one arm's shortlist.
 *
 * @param {{candidates: Array<object>, floors: Record<string, number>}} input
 * @returns {{gates: Array<object>, unreachable: string[]}}
 */
export function gateReachability({ candidates, floors }) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new TypeError(
      'gateReachability: no candidates — an empty shortlist cannot establish that any gate is reachable',
    );
  }

  const gates = [];
  for (const [name, valueOf] of Object.entries(GATE_SPECS)) {
    const floor = floors?.[name];
    if (!Number.isFinite(floor)) continue;

    const values = candidates.map(valueOf).filter(Number.isFinite);
    const observedMax = values.length ? Math.max(...values) : Number.NEGATIVE_INFINITY;
    const clearedBy = values.filter((v) => v >= floor).length;

    gates.push({
      name,
      floor,
      observedMax,
      clearedBy,
      reachable: clearedBy > 0,
      headroom: Number((observedMax - floor).toFixed(6)),
    });
  }

  return { gates, unreachable: gates.filter((g) => !g.reachable).map((g) => g.name) };
}

/**
 * May a no-crown verdict be published? Only when the arm could have crowned.
 *
 * Crowning at least once proves the gates were reachable, so any such verdict is
 * admissible on this criterion.
 *
 * @param {{candidates: Array<object>, floors: Record<string, number>, nucleusCount: number}} input
 * @returns {{admissible: boolean, reason: string|null, report: object|null}}
 */
export function verdictAdmissible({ candidates, floors, nucleusCount }) {
  if (nucleusCount > 0) return { admissible: true, reason: null, report: null };

  const report = gateReachability({ candidates, floors });
  if (report.unreachable.length === 0) {
    return { admissible: true, reason: null, report };
  }

  const detail = report.gates
    .filter((g) => !g.reachable)
    .map((g) => `${g.name}=${g.floor} > arm ceiling ${g.observedMax.toFixed(6)}`)
    .join('; ');

  return {
    admissible: false,
    reason:
      `VACUOUS: 0 NUCLEUS was guaranteed by configuration, not measured — ${detail}. `
      + 'No crown/no-crown contrast may be drawn from this arm.',
    report,
  };
}

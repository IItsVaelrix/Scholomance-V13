/**
 * SUBTLETY FINGERPRINT APM — the unifying facade (PDR §8).
 *
 * One behavioral identity, three lenses. This is the in-memory, deterministic
 * "RESONANCE STORE" analog: it records fingerprints (observed + canonical-probe),
 * promotes approved baselines, and assesses a unit through all three lenses:
 *
 *   detect   → Lens I   Chroma-Drift  (correctness)
 *   localize → Lens II  Seam-Flow     (coherence)
 *   act      → Lens III Closed-Loop   (recovery)
 *
 * Sensors, then immune response — in that order (PDR §4.5). Healing is never
 * attempted before a deviation is both detected and localized, and never against
 * anything but an approved baseline (PDR §7.4).
 *
 * Determinism: the store is a pure data structure; every method is side-effect
 * free with respect to the units it observes (observed mode never re-runs;
 * canonical-probe only runs a caller-supplied replay-safe runFn).
 */

import {
  fingerprintOutput,
  probeUnit,
} from './subtlety-fingerprint.js';
import { detectDrift } from './subtlety-drift.js';
import { buildDataflowGraph, detectSeamViolations, detectDeadTissue } from './subtlety-seam-flow.js';
import { toRaidSymptom, proposeRemediation, recordHealing } from './subtlety-closed-loop.js';

/**
 * Retained readings per unit.
 *
 * `readings` was unbounded on a process-lifetime singleton (getSubtletyRuntime
 * memoises one instance), so it grew for as long as the server ran and nothing
 * ever evicted from it. Every observed request added a packet that was never
 * released: a straightforward leak, and the reason a long-lived production
 * process climbs in memory with no corresponding traffic growth.
 *
 * This is a MEMORY bound, not a de-duplication mechanism. Duplicate structural
 * findings are already prevented upstream by buildDataflowGraph collapsing
 * units per unit rather than per observation (de06db1b, 2026-08-09).
 *
 * 50 is safe for detection because detectDrift is a MAJORITY VOTE over the
 * window (group by config signature, most common semanticChecksum wins) rather
 * than a scan of all history. A rolling window is arguably more correct: stale
 * readings from a superseded build would otherwise skew the majority.
 */
const MAX_READINGS_PER_UNIT = 50;

export function createSubtletyApm() {
  // readings: Map<unitId, fingerprintPacket[]> — bounded, newest-last.
  const readings = new Map();
  // baselines: Map<unitId, { fingerprint, expectedBaselineId, baselineApproval, baselineBuildId }>
  const baselines = new Map();
  let healingLedger = [];

  function pushReading(unitId, packet) {
    if (!readings.has(unitId)) readings.set(unitId, []);
    const list = readings.get(unitId);
    list.push(packet);
    // Ring buffer: drop oldest. splice once rather than shift-per-insert so a
    // burst that overshoots the cap still costs one operation.
    if (list.length > MAX_READINGS_PER_UNIT) {
      list.splice(0, list.length - MAX_READINGS_PER_UNIT);
    }
    return packet;
  }

  return {
    /** Observed mode: hash the output of a request that already executed. Never re-runs. */
    recordObserved(identity, output, opts = {}) {
      const packet = fingerprintOutput(identity, output, { ...opts, mode: 'observed' });
      return pushReading(identity.unitId, packet);
    },

    /** Canonical-probe mode: run a replay-safe runFn(seed) in a side-effect-free lane. */
    probe(identity, runFn, opts = {}) {
      const packet = probeUnit(identity, runFn, opts);
      return pushReading(identity.unitId, packet);
    },

    /** Promote a fingerprint as the approved baseline for a unit (§3.1 / §7.4). */
    promoteBaseline(unitId, fingerprintPacket, approval) {
      baselines.set(unitId, {
        fingerprint: fingerprintPacket,
        expectedBaselineId: approval?.expectedBaselineId ?? `${unitId}@${fingerprintPacket.execution?.buildId ?? 'unknown'}`,
        baselineApproval: approval || null,
        baselineBuildId: fingerprintPacket.execution?.buildId ?? null,
      });
      return baselines.get(unitId);
    },

    getReadings(unitId) {
      return readings.get(unitId) || [];
    },

    getBaseline(unitId) {
      return baselines.get(unitId) || null;
    },

    /**
     * Assess a unit through all three lenses.
     * `seamOpts` calibrates dead-tissue confidence (§6.3); `current` supplies
     * build/patch context for a remediation proposal (§7.4).
     */
    assess(unitId, opts = {}) {
      const unitReadings = readings.get(unitId) || [];

      // Lens I — detect.
      const drift = detectDrift(unitReadings);

      // Lens II — localize (dataflow graph across this unit's readings + any
      // co-assessed units passed via opts.peers).
      const peers = opts.peers || [];
      const graph = buildDataflowGraph([...unitReadings, ...peers]);
      const seamViolations = detectSeamViolations(graph);
      const deadTissue = detectDeadTissue(graph, opts.seamOpts || {});
      // NOT de-duplicated here. buildDataflowGraph already collapses units by
      // id and unions seam vocabulary (de06db1b, 2026-08-09) precisely so a
      // structural finding is reported once rather than once per observation.
      // The 97.9%-duplicate records on the production volume were written by
      // builds predating that commit; a second dedupe layer here would only
      // obscure which mechanism is authoritative.
      const seam = { violations: seamViolations.violations, ok: seamViolations.ok, deadTissue: deadTissue.candidates };

      // Lens III — act (only if a deviation was detected AND localized).
      const recovery = { symptoms: [], proposals: [] };
      const deviations = [
        ...drift.divergenceAlerts.map((a) => ({ ...a, unitId })),
        ...seamViolations.violations,
      ];
      const baseline = baselines.get(unitId) || null;
      for (const deviation of deviations) {
        const symptom = toRaidSymptom(deviation);
        recovery.symptoms.push(symptom);
        const proposal = proposeRemediation(deviation, baseline, opts.current || {});
        recovery.proposals.push(proposal);
      }

      return { unitId, drift, seam, recovery };
    },

    /** Record a completed auto-remediation in the healing ledger (§7.3). */
    recordHealing(entry) {
      healingLedger = recordHealing(healingLedger, entry);
      return healingLedger;
    },

    getHealingLedger() {
      return healingLedger;
    },
  };
}

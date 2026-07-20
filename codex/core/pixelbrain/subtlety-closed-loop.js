/**
 * LENS III — CLOSED-LOOP (Recovery) for the Subtlety Fingerprint APM (PDR §7).
 *
 * Watches fingerprint deviations and feeds them into the immune system. Every
 * APM ends at an alert; this codebase already has RAID (symptom → 50+ seeded
 * bug patterns) and a heal loop (diagnose → patch → test → learn). Closed-Loop
 * turns the APM's anomalies into structured RAID symptoms and proposes — never
 * blindly applies — remediation.
 *
 * Heal against an APPROVED BASELINE, not the previous checksum (PDR §7.4).
 * Otherwise: Version B intentionally changes behavior → baseline promotion is
 * delayed → Closed-Loop calls B "drift" → the heal loop "repairs" back to A.
 * The monitoring system becomes an automated regression engine. 🫠
 *
 * Guardrail: auto-healing is PROHIBITED whenever the system cannot prove the
 * expected fingerprint belongs to the current approved behavioral contract. If
 * baselineApproval is absent / stale / mismatched against implementationVersion,
 * the deviation is surfaced to a human (propose-only) and never auto-repaired.
 */

import { sha256Hex } from './sha256.js';

/**
 * Convert a deviation (drift alert or seam violation) into a structured symptom
 * in the RAID vocabulary. The APM becomes a sensor for the immune system.
 */
export function toRaidSymptom(deviation) {
  const code = deviation.code || 'SUBTLETY_UNKNOWN';
  const unitId = deviation.unitId || deviation.units?.[0] || null;
  return {
    symptoms: [
      `${code}: ${deviation.message || 'subtlety fingerprint deviation'}`,
      deviation.field ? `field: ${deviation.field}` : `unit: ${unitId}`,
    ].filter(Boolean),
    file_paths: deviation.filePaths || [],
    agent_role: 'gemini', // Debug Inquisitor handles structured bytecode symptoms
    source: 'subtlety-fingerprint-apm',
    symptomCode: code,
  };
}

/**
 * Is the baseline approved for the current behavioral version? The baseline is
 * trustworthy only when its approval references the same implementationVersion
 * and contractVersion the unit is currently running.
 */
export function baselineIsApproved(baseline, currentIdentity) {
  if (!baseline || !baseline.baselineApproval) return false;
  const approval = baseline.baselineApproval;
  if (approval.revoked) return false;
  if (
    approval.implementationVersion !== undefined &&
    approval.implementationVersion !== currentIdentity?.implementationVersion
  ) {
    return false;
  }
  if (
    approval.contractVersion !== undefined &&
    approval.contractVersion !== currentIdentity?.contractVersion
  ) {
    return false;
  }
  return true;
}

/**
 * Propose a remediation for a deviation, defending an APPROVED baseline.
 *
 * `baseline` = { expectedBaselineId, baselineApproval, baselineBuildId }.
 * `current`  = { identity, buildId, proposedPatch?, rollbackPatch? }.
 *
 * Returns a proposal. `allowed` is false (propose-only, surface to a human)
 * whenever the baseline cannot be proven to belong to the current approved
 * behavioral contract — this is the §7.4 guardrail that keeps Closed-Loop from
 * reverting lawful evolution.
 */
export function proposeRemediation(deviation, baseline, current = {}) {
  const identity = current.identity || {};
  const approved = baselineIsApproved(baseline, identity);

  const proposal = {
    symptomCode: deviation.code || 'SUBTLETY_UNKNOWN',
    expectedBaselineId: baseline?.expectedBaselineId ?? null,
    baselineApproval: baseline?.baselineApproval ?? null,
    currentBuildId: current.buildId ?? identity.buildId ?? null,
    targetBuildId: current.targetBuildId ?? null,
    proposedPatchHash: current.proposedPatch ? sha256Hex(current.proposedPatch) : null,
    rollbackPatchHash: current.rollbackPatch ? sha256Hex(current.rollbackPatch) : null,
    allowed: approved,
    reason: approved ? 'approved-baseline' : 'no-approved-baseline',
  };

  if (!approved) {
    proposal.reason = !baseline
      ? 'no-baseline-supplied'
      : !baseline.baselineApproval
        ? 'baseline-not-promoted'
        : 'baseline-version-mismatch';
    proposal.action = 'propose-only'; // surface to a human; never auto-repair
  } else {
    proposal.action = 'eligible-for-auto-heal';
  }

  return proposal;
}

/**
 * Append a healing-ledger entry. Every auto-remediation is logged with its
 * before/after fingerprint and test result, so autonomy is auditable and
 * reversible. Returns the new ledger (immutable append).
 */
export function recordHealing(ledger, entry) {
  const list = Array.isArray(ledger) ? ledger : [];
  return [
    ...list,
    {
      timestamp: entry.timestamp ?? null,
      unitId: entry.unitId ?? null,
      symptomCode: entry.symptomCode ?? null,
      beforeFingerprint: entry.beforeFingerprint ?? null,
      afterFingerprint: entry.afterFingerprint ?? null,
      proposedPatchHash: entry.proposedPatchHash ?? null,
      rollbackPatchHash: entry.rollbackPatchHash ?? null,
      testResult: entry.testResult ?? null,
      reversible: entry.rollbackPatchHash != null,
    },
  ];
}

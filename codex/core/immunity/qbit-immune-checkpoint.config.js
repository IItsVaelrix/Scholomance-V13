/**
 * QBIT IMMUNE CHECKPOINT v1 — Configuration
 *
 * Pure constants for the checkpoint evidence governor. Frozen to prevent
 * accidental mutation; the checkpoint module imports this object as the
 * default configuration and may be overridden per-call by passing a
 * caller-supplied config.
 *
 * Source: docs/scholomance-encyclopedia/PDR-archive/QBIT-Immune-Checkpoint-PDR.md
 * Law compliance: VAELRIX_LAW §6 (Determinism), §8 (Bytecode is priority)
 */

export const IMMUNE_CHECKPOINT_CONTRACT = 'SCHOL-QBIT-CHECKPOINT-v1';
export const IMMUNE_CHECKPOINT_SCHEMA_VERSION = '1.0.0';

export const IMMUNE_CHECKPOINT_ACTIONS = Object.freeze([
  'VIOLATION',
  'WARN',
  'HEALTH_SIGNAL',
  'SUPPRESSED',
  'NEEDS_MERLIN',
]);

export const IMMUNE_CHECKPOINT_VERDICTS = Object.freeze([
  'CONFIRMED',
  'REFUTED',
  'MIXED',
  'INSUFFICIENT',
  'COLD_START',
  'NEEDS_MERLIN',
  'APOPTOSIS_CANDIDATE',
  'VACCINE_MATCH',
  'G1_FAILED',
]);

/**
 * Default checkpoint configuration per PDR §"Configuration".
 *
 * - minimumEvidenceCount: floor for confirm+refute to even begin evaluating
 * - minRuleConfidence:    rule's own confidence must clear this to enter G2
 * - minEvidenceCount:     observation must carry at least this much evidence
 * - refuteSuppressionThreshold: refute/confirm ratio that flips to HEALTH_SIGNAL
 * - confirmViolationThreshold: confirm/refute ratio that flips to VIOLATION
 * - halfLifeRuns:         decay half-life measured in checkpoint runs
 * - allowHardSuppression: gate on SUPPRESSED action; default OFF
 * - merlinEscalation:     unknown shape and contradiction thresholds
 */
export const ImmuneCheckpointConfig = Object.freeze({
  contract: IMMUNE_CHECKPOINT_CONTRACT,
  schemaVersion: IMMUNE_CHECKPOINT_SCHEMA_VERSION,

  minimumEvidenceCount: 3,

  minRuleConfidence: 0.55,
  minEvidenceCount: 2,

  refuteSuppressionThreshold: 2.0,
  confirmViolationThreshold: 1.5,

  halfLifeRuns: 30,

  allowHardSuppression: false,

  merlinEscalation: Object.freeze({
    enabled: true,
    unknownShapeThreshold: 0.72,
    contradictionThreshold: 0.8,
  }),

  ruleReputation: Object.freeze({
    minObservations: 6,
    refuteRatioForApoptosis: 0.7,
  }),
});

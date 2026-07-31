/**
 * SIMULATION MODULE 4 — Grounding-Gated Build Decision
 * ========================================================================
 * PB-SIM-BUILDGATE-v1
 *
 * Before building anything, check: is the concept attested in the
 * encyclopedia? If grounding is too low, the reaction needs a PDR
 * written first. If grounding is high enough, it's attested enough
 * to prototype. Wires the grounding index as a mandatory gate before
 * any build action.
 *
 * WIRING (80%): attest(index, concept) → groundingScore() → decision
 *
 * INVENTION (20%): buildGate() — the decision logic that maps grounding
 *   scores + stability classes to proceed / write-PDR / blocked.
 *
 * DETERMINISM: same reaction + same index → same gate decision → same
 *   checksum. No randomness. No timestamps. Frozen forever.
 *
 * LABEL PRODUCED: GATE — "build gate: proceed / write PDR first / blocked."
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from './canonical-json.js';
import { synthesize, stabilityClass, STABLE_MIN, METASTABLE_MIN } from './concept-chemistry.js';
import { attest, groundingScore, prepareForSynthesize } from './grounding-index.js';

export const SCHEMA = 'PB-SIM-BUILDGATE-v1';

// ─── Gate Thresholds ─────────────────────────────────────────────────

/**
 * Grounding thresholds for build decisions.
 * These are deliberately conservative: the gate should err on the side
 * of requiring documentation before building.
 */
export const GATE_THRESHOLDS = Object.freeze({
  /** Below this grounding, require a PDR before building. */
  GROUNDING_MIN_FOR_DRYRUN: 0.30,
  /** Below this grounding, block entirely until attested. */
  GROUNDING_MIN_FOR_BUILD: 0.55,
  /** Grounding above this is considered well-attested. */
  GROUNDING_WELL_ATTESTED: 0.70,
});

// ─── Checksum ────────────────────────────────────────────────────────

function simChecksum(payload) {
  const canonical = canonicalStringify(payload);
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return 'simgate1:' + hash.slice(0, 16);
}

// ─── Main Gate ───────────────────────────────────────────────────────

/**
 * Evaluate whether a proposed reaction should proceed to build.
 *
 * Decision matrix:
 *   - LAW_VIOLATION → BLOCKED (always)
 *   - UNSTABLE + grounding < 0.30 → WRITE_PDR (not attested, not viable)
 *   - UNSTABLE + grounding >= 0.30 → DRY_RUN_ONLY (attested but not viable)
 *   - METASTABLE + grounding < 0.30 → WRITE_PDR (viable but not attested)
 *   - METASTABLE + grounding >= 0.30 → DRY_RUN (viable and attested)
 *   - STABLE + grounding < 0.55 → DRY_RUN (viable but weakly attested)
 *   - STABLE + grounding >= 0.55 → BUILD (viable and well-attested)
 *
 * @param {object} opts
 * @param {string} opts.a - Reactant concept A (required)
 * @param {string} opts.b - Reactant concept B (required)
 * @param {string} opts.product - Product concept (required)
 * @param {object} [opts.index] - GroundingIndex (required for corpus grounding)
 * @param {number} [opts.groundingA] - Explicit grounding override for A
 * @param {number} [opts.groundingB] - Explicit grounding override for B
 * @returns {object} Frozen gate decision
 */
export function buildGate(opts) {
  const { a, b, product } = opts || {};
  if (!a || !b || !product) {
    throw new Error('PB-SIM-BUILDGATE-v1: a, b, and product are required');
  }

  // Step 1: Score the reaction
  const reaction = synthesize({
    a, b, product,
    groundingA: opts.groundingA,
    groundingB: opts.groundingB,
    index: opts.index,
  });

  // Step 2: Compute grounding attestation
  let groundingA, groundingB, groundingMean;
  if (opts.index) {
    const gs = groundingScore(opts.index, a, b);
    groundingA = gs.attestA;
    groundingB = gs.attestB;
    groundingMean = gs.grounding;
  } else if (opts.groundingA !== undefined && opts.groundingB !== undefined) {
    groundingA = opts.groundingA;
    groundingB = opts.groundingB;
    groundingMean = (groundingA + groundingB) / 2;
  } else {
    groundingA = 0;
    groundingB = 0;
    groundingMean = 0;
  }

  // Step 3: Apply decision matrix
  const stability = reaction.stability;
  const lawViolation = reaction.lawNote.startsWith('LAW_VIOLATION');

  let decision, reason, requiredDocs;

  if (lawViolation) {
    decision = 'BLOCKED';
    reason = `Law violation: ${reaction.lawNote}. Cannot build.`;
    requiredDocs = [];
  } else if (stability === 'UNSTABLE' && groundingMean < GATE_THRESHOLDS.GROUNDING_MIN_FOR_DRYRUN) {
    decision = 'WRITE_PDR';
    reason = `UNSTABLE (feasibility ${reaction.feasibility}) and grounding ${groundingMean.toFixed(4)} < ${GATE_THRESHOLDS.GROUNDING_MIN_FOR_DRYRUN}. Write a PDR to attest the concept before prototyping.`;
    requiredDocs = ['PDR: ' + product.slice(0, 60)];
  } else if (stability === 'UNSTABLE') {
    decision = 'DRY_RUN_ONLY';
    reason = `UNSTABLE (feasibility ${reaction.feasibility}) but grounding ${groundingMean.toFixed(4)} >= ${GATE_THRESHOLDS.GROUNDING_MIN_FOR_DRYRUN}. Dry-run only — do not commit to production.`;
    requiredDocs = [];
  } else if (stability === 'METASTABLE' && groundingMean < GATE_THRESHOLDS.GROUNDING_MIN_FOR_DRYRUN) {
    decision = 'WRITE_PDR';
    reason = `METASTABLE (feasibility ${reaction.feasibility}) but grounding ${groundingMean.toFixed(4)} < ${GATE_THRESHOLDS.GROUNDING_MIN_FOR_DRYRUN}. Attest the concept with a PDR first.`;
    requiredDocs = ['PDR: ' + product.slice(0, 60)];
  } else if (stability === 'METASTABLE') {
    decision = 'DRY_RUN';
    reason = `METASTABLE (feasibility ${reaction.feasibility}) with grounding ${groundingMean.toFixed(4)}. Proceed to dry-run / prototype.`;
    requiredDocs = [];
  } else if (groundingMean < GATE_THRESHOLDS.GROUNDING_MIN_FOR_BUILD) {
    decision = 'DRY_RUN';
    reason = `STABLE (feasibility ${reaction.feasibility}) but grounding ${groundingMean.toFixed(4)} < ${GATE_THRESHOLDS.GROUNDING_MIN_FOR_BUILD}. Dry-run recommended before full build.`;
    requiredDocs = [];
  } else {
    decision = 'BUILD';
    reason = `STABLE (feasibility ${reaction.feasibility}) with grounding ${groundingMean.toFixed(4)} >= ${GATE_THRESHOLDS.GROUNDING_MIN_FOR_BUILD}. Cleared for build.`;
    requiredDocs = [];
  }

  const proceed = decision === 'BUILD' || decision === 'DRY_RUN' || decision === 'DRY_RUN_ONLY';

  const result = {
    schema: SCHEMA,
    reaction: {
      a, b, product,
      feasibility: reaction.feasibility,
      stability,
      lawNote: reaction.lawNote,
      bond: reaction.bond,
      bondSign: reaction.bondSign,
      bondMagnitude: reaction.bondMagnitude,
    },
    grounding: {
      a: groundingA,
      b: groundingB,
      mean: Math.round(groundingMean * 1e4) / 1e4,
      source: opts.index ? 'corpus' : opts.groundingA !== undefined ? 'explicit' : 'none',
    },
    gate: {
      decision,
      proceed,
      reason,
      requiredDocs,
    },
    label: {
      tier: 'GATE',
      outcome: decision,
      evidence: `gate: ${decision}, feasibility ${reaction.feasibility}, grounding ${groundingMean.toFixed(4)}`,
    },
  };

  result.checksum = simChecksum({
    a, b, product,
    feasibility: reaction.feasibility,
    stability,
    groundingMean: Math.round(groundingMean * 1e4) / 1e4,
    decision,
  });

  return Object.freeze(result);
}

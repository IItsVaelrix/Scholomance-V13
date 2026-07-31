/**
 * SIMULATION MODULE 5 — Calibration Feedback Loop / Label Store
 * ========================================================================
 * PB-SIM-LABELSTORE-v1
 *
 * Append-only, frozen, checksummed label store. Every physical build
 * result (tests pass/fail) and every simulated result (immune/law/RAID
 * verdict) feeds into this store. The regression harness reads from it.
 * Concept Chemistry predictions are checked against accumulated labels.
 *
 * WIRING (75%): calibration-001 structure → harness extension
 *
 * INVENTION (25%): The label store itself — append-only persistence
 *   with content-addressed checksums and tier separation.
 *
 * DESIGN:
 *   - APPEND-ONLY: labels are never modified or deleted. The store is
 *     a frozen array that grows monotonically.
 *   - TWO TIERS: SIMULATED (gate passed, worth building) and PHYSICAL
 *     (built and measured). Physical labels anchor truth. Simulated
 *     labels feed triage.
 *   - CONTENT-ADDRESSED: every label carries a checksum. The store
 *     itself carries a rolling checksum over all labels.
 *   - DETERMINISTIC: same labels in same order → same store checksum.
 *
 * LABEL SHAPE:
 *   {
 *     id: 'LBL-001',
 *     tier: 'SIMULATED' | 'PHYSICAL',
 *     reaction: { a, b, product },
 *     outcome: 'CONFIRMED' | 'REFUTED' | 'METASTABLE' | 'NOVEL' | ...,
 *     evidence: string,
 *     source: string (which module produced this),
 *     checksum: 'lbl1:sha256[:16]',
 *   }
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from './canonical-json.js';

export const SCHEMA = 'PB-SIM-LABELSTORE-v1';

// ─── Label Checksum ──────────────────────────────────────────────────

function labelChecksum(label) {
  const canonical = canonicalStringify({
    tier: label.tier,
    reaction: label.reaction,
    outcome: label.outcome,
    evidence: label.evidence,
    source: label.source,
  });
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return 'lbl1:' + hash.slice(0, 16);
}

function storeChecksum(labels) {
  const canonical = canonicalStringify(labels.map((l) => l.checksum));
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return 'store1:' + hash.slice(0, 16);
}

// ─── Label Store ─────────────────────────────────────────────────────

/**
 * Create a new empty label store.
 * @returns {LabelStore}
 */
export function createLabelStore() {
  const labels = [];
  let seq = 0;

  const store = {
    schema: SCHEMA,

    /**
     * Append a label to the store. Labels are immutable once appended.
     *
     * @param {object} entry
     * @param {string} entry.tier - 'SIMULATED' | 'PHYSICAL'
     * @param {object} entry.reaction - { a, b, product }
     * @param {string} entry.outcome - e.g. 'CONFIRMED', 'REFUTED', 'METASTABLE'
     * @param {string} entry.evidence - human-readable evidence string
     * @param {string} entry.source - which module produced this label
     * @returns {object} the frozen label that was appended
     */
    append(entry) {
      if (!entry || typeof entry !== 'object') {
        throw new Error('PB-SIM-LABELSTORE-v1: entry must be an object');
      }
      const { tier, reaction, outcome, evidence, source } = entry;
      if (tier !== 'SIMULATED' && tier !== 'PHYSICAL') {
        throw new Error(`PB-SIM-LABELSTORE-v1: tier must be SIMULATED or PHYSICAL, got "${tier}"`);
      }
      if (!reaction || typeof reaction !== 'object') {
        throw new Error('PB-SIM-LABELSTORE-v1: reaction must be an object { a, b, product }');
      }
      if (typeof outcome !== 'string' || outcome.length === 0) {
        throw new Error('PB-SIM-LABELSTORE-v1: outcome is required (non-empty string)');
      }

      seq++;
      const label = Object.freeze({
        id: `LBL-${String(seq).padStart(3, '0')}`,
        tier,
        reaction: Object.freeze({ ...reaction }),
        outcome,
        evidence: String(evidence || ''),
        source: String(source || 'unknown'),
        seq,
      });

      // Compute checksum over the label content (not id/seq, which are positional)
      const checksum = labelChecksum(label);
      const frozen = Object.freeze({ ...label, checksum });

      labels.push(frozen);
      return frozen;
    },

    /**
     * Get all labels (frozen copy).
     * @returns {ReadonlyArray<object>}
     */
    all() {
      return Object.freeze([...labels]);
    },

    /**
     * Get labels filtered by tier.
     * @param {'SIMULATED'|'PHYSICAL'} tier
     * @returns {ReadonlyArray<object>}
     */
    byTier(tier) {
      return Object.freeze(labels.filter((l) => l.tier === tier));
    },

    /**
     * Get labels filtered by outcome.
     * @param {string} outcome
     * @returns {ReadonlyArray<object>}
     */
    byOutcome(outcome) {
      return Object.freeze(labels.filter((l) => l.outcome === outcome));
    },

    /**
     * Get the count of labels by tier.
     * @returns {{ simulated: number, physical: number, total: number }}
     */
    counts() {
      const simulated = labels.filter((l) => l.tier === 'SIMULATED').length;
      const physical = labels.filter((l) => l.tier === 'PHYSICAL').length;
      return { simulated, physical, total: labels.length };
    },

    /**
     * Get the rolling store checksum over all label checksums.
     * @returns {string}
     */
    checksum() {
      return storeChecksum(labels);
    },

    /**
     * Number of labels in the store.
     * @returns {number}
     */
    get size() {
      return labels.length;
    },
  };

  return Object.freeze(store);
}

// ─── Harness Integration ─────────────────────────────────────────────

/**
 * Generate a harness-compatible label array from the store.
 * The regression harness (scripts/concept-chem-determinism.mjs) expects
 * labels with { reaction, outcome, tier, evidence }.
 *
 * @param {LabelStore} store
 * @returns {Array<object>} harness-compatible labels
 */
export function toHarnessLabels(store) {
  return store.all().map((l) => ({
    id: l.id,
    a: l.reaction.a,
    b: l.reaction.b,
    product: l.reaction.product,
    outcome: l.outcome,
    tier: l.tier,
    evidence: l.evidence,
    source: l.source,
    checksum: l.checksum,
  }));
}

/**
 * Compute prediction accuracy against accumulated labels.
 * For each label, re-score the reaction and check if the predicted
 * stability class matches the recorded outcome.
 *
 * @param {LabelStore} store
 * @param {Function} synthesizeFn - the synthesize() function from concept-chemistry.js
 * @param {object} [index] - optional GroundingIndex for corpus grounding
 * @returns {{ total: number, correct: number, accuracy: number, mismatches: Array }}
 */
export function scoreAccuracy(store, synthesizeFn, index) {
  const labels = store.all();
  let correct = 0;
  const mismatches = [];

  for (const label of labels) {
    const result = synthesizeFn({
      a: label.reaction.a,
      b: label.reaction.b,
      product: label.reaction.product,
      index,
    });

    // Map outcome to expected stability
    const expectedStable = label.outcome === 'CONFIRMED';
    const predictedStable = result.stability === 'STABLE';

    if (expectedStable === predictedStable) {
      correct++;
    } else {
      mismatches.push({
        id: label.id,
        outcome: label.outcome,
        predicted: result.stability,
        feasibility: result.feasibility,
      });
    }
  }

  return {
    total: labels.length,
    correct,
    accuracy: labels.length === 0 ? 0 : Math.round((correct / labels.length) * 1e4) / 1e4,
    mismatches: Object.freeze(mismatches),
  };
}

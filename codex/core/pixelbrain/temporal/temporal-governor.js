/**
 * Temporal Governor — BytecodeHealth certification layer for temporal interpolation.
 *
 * ARCHITECTURAL BOUNDARY (user-specified refinement):
 *   BytecodeHealth CERTIFIES and GOVERNS the temporal interpolation layer.
 *   It does NOT become the interpolation engine.
 *   The interpolation engine is a pure, versioned, replaceable function.
 *   BytecodeHealth is the NOTARY, not the AUTHOR.
 *
 * Responsibilities:
 *   1. CERTIFY — Validate that interpolation inputs are well-formed and versioned
 *   2. VERSION — Bind algorithm version + engine version into projection checksum
 *   3. AUDIT — Verify that interpolation output matches expected checksum
 *   4. REPLAY — Enable regeneration of any frame from keyframes without re-simulation
 *   5. DIAGNOSE — Localize causal drift to a single versioned component
 *
 * What this module NEVER does:
 *   - Interpolate states
 *   - Modify keyframe data
 *   - Generate frames
 *   - Execute construction solving
 *
 * The governor emits health events. It does not perform computation.
 * "Animation can be compiled, audited, replayed, diagnosed, and versioned
 *  in the same manner as source code." — verb tense for the geometry language.
 */

import crypto from 'node:crypto';
import {
  INTERPOLATION_ALGORITHMS,
  TEMPORAL_CONTRACT,
  computeTemporalChecksum,
  flattenState,
} from './temporal-schema.js';
import {
  INTERPOLATION_ENGINE_VERSION,
  interpolateState,
  evaluateTemporal,
  evaluateEnergyBindings,
} from './interpolation-engine.js';
import {
  canonicalConstructionStringify,
} from '../construction/construction-schema.js';
import { sha256Hex } from '../sha256.js';

// ─── Governor Version ────────────────────────────────────────────────────────

export const TEMPORAL_GOVERNOR_VERSION = '1.0.0';

// ─── Health Codes ────────────────────────────────────────────────────────────

export const TEMPORAL_HEALTH_CODES = Object.freeze({
  KEYFRAME_CURATED: 'PB-OK-v1-TEMPORAL-KEYFRAME-CURATED',
  INTERPOLATION_CERTIFIED: 'PB-OK-v1-TEMPORAL-INTERPOLATION-CERTIFIED',
  REPLAY_VERIFIED: 'PB-OK-v1-TEMPORAL-REPLAY-VERIFIED',
  DRIFT_DETECTED: 'PB-WARN-v1-TEMPORAL-DRIFT-DETECTED',
  ALGORITHM_UNKNOWN: 'PB-ERR-v1-TEMPORAL-ALGORITHM-UNKNOWN',
  DIMENSION_MISMATCH: 'PB-ERR-v1-TEMPORAL-DIMENSION-MISMATCH',
  APPROVAL_REQUIRED: 'PB-ERR-v1-TEMPORAL-APPROVAL-REQUIRED',
});

// ─── Projection Checksum ─────────────────────────────────────────────────────

/**
 * Compute the projection checksum for an interpolation.
 *
 * This is the "identity of realized temporal structure."
 * Binds ALL meaningful inputs:
 *   - gene checksum (identity of curated intent)
 *   - algorithm version
 *   - engine version
 *   - governor version
 *   - time parameter
 *   - bracket keyframe indices
 *   - interpolated state
 *
 * If ANY of these change, the projection checksum changes.
 * This is how causal drift is detected: gene checksum stable +
 * projection checksum diverged → the engine or algorithm changed.
 */
export function computeProjectionChecksum(params) {
  const canonical = canonicalConstructionStringify({
    geneChecksum: params.geneChecksum,
    algorithm: params.algorithm,
    engineVersion: params.engineVersion ?? INTERPOLATION_ENGINE_VERSION,
    governorVersion: params.governorVersion ?? TEMPORAL_GOVERNOR_VERSION,
    time: params.time,
    bracketFrom: params.bracketFrom,
    bracketTo: params.bracketTo,
    localT: params.localT,
    state: params.state,
    energy: params.energy ?? {},
  });
  return `sha256-canonical-v1:${sha256Hex(canonical)}`;
}

// ─── Certification ───────────────────────────────────────────────────────────

/**
 * Certify a temporal gene for interpolation.
 *
 * Validates:
 *   - Gene is well-formed (contract, keyframes, algorithm)
 *   - Algorithm is in the registry
 *   - Keyframe states have matching dimensions
 *   - Gene checksum is stable
 *
 * Returns a certification record. Does NOT interpolate.
 *
 * @param {object} gene - A PB-TEMPORAL-GENE-v1 packet
 * @returns {object} Certification record (frozen)
 */
export function certifyGene(gene) {
  const issues = [];

  // Contract check
  if (gene.contract !== TEMPORAL_CONTRACT) {
    issues.push(`Expected contract '${TEMPORAL_CONTRACT}', got '${gene.contract}'`);
  }

  // Algorithm registry check
  if (!INTERPOLATION_ALGORITHMS[gene.algorithm]) {
    issues.push(`Algorithm '${gene.algorithm}' not in registry`);
  }

  // Keyframe dimension consistency
  if (gene.keyframes && gene.keyframes.length >= 2) {
    const refDim = flattenState(gene.keyframes[0].state).length;
    for (let i = 1; i < gene.keyframes.length; i++) {
      const dim = flattenState(gene.keyframes[i].state).length;
      if (dim !== refDim) {
        issues.push(
          `Keyframe ${i} has ${dim} dimensions, expected ${refDim} (from keyframe 0)`,
        );
      }
    }
  }

  // Checksum stability
  const recomputed = computeTemporalChecksum(gene);
  const checksumStable = recomputed === gene.checksum;
  if (!checksumStable) {
    issues.push(
      `Gene checksum mismatch: stored=${gene.checksum}, recomputed=${recomputed}`,
    );
  }

  const certified = issues.length === 0;

  return Object.freeze({
    certified,
    geneChecksum: gene.checksum,
    algorithm: gene.algorithm,
    engineVersion: INTERPOLATION_ENGINE_VERSION,
    governorVersion: TEMPORAL_GOVERNOR_VERSION,
    keyframeCount: gene.keyframes?.length ?? 0,
    stateDimensions: gene.keyframes?.length > 0
      ? flattenState(gene.keyframes[0].state).length
      : 0,
    issues: Object.freeze(issues),
    code: certified
      ? TEMPORAL_HEALTH_CODES.KEYFRAME_CURATED
      : TEMPORAL_HEALTH_CODES.APPROVAL_REQUIRED,
  });
}

// ─── Interpolation Certification ─────────────────────────────────────────────

/**
 * Certify a single interpolation result.
 *
 * The governor does NOT perform the interpolation. It receives the result
 * from the interpolation engine and certifies it:
 *   - Computes the projection checksum
 *   - Verifies the output is deterministic (re-interpolates and compares)
 *   - Returns a certification record with both checksums
 *
 * @param {object} gene - The temporal gene
 * @param {number} time - The time that was interpolated
 * @param {object} interpolationResult - Result from evaluateTemporal()
 * @param {object} [energyResult] - Result from evaluateEnergyBindings()
 * @param {object} [options] - The SAME algorithm options the result was
 *   evaluated with. The replay must reproduce the caller's conditions; replaying
 *   under different options diverges from a perfectly deterministic
 *   interpolation and refuses the gene for a fault it does not have.
 * @returns {object} Certification record (frozen)
 */
export function certifyInterpolation(gene, time, interpolationResult, energyResult = {}, options = {}) {
  const { state, bracket, localT } = interpolationResult;

  // Compute projection checksum
  const projectionChecksum = computeProjectionChecksum({
    geneChecksum: gene.checksum,
    algorithm: gene.algorithm,
    time,
    bracketFrom: bracket.from,
    bracketTo: bracket.to,
    localT,
    state,
    energy: energyResult,
  });

  // Determinism verification: re-interpolate and compare
  const replay = evaluateTemporal(gene, time, options);
  const replayFlat = flattenState(replay.state);
  const originalFlat = flattenState(state);
  const deterministic = replayFlat.length === originalFlat.length
    && replayFlat.every((v, i) => v === originalFlat[i]);

  return Object.freeze({
    certified: deterministic,
    geneChecksum: gene.checksum,
    projectionChecksum,
    algorithm: gene.algorithm,
    engineVersion: INTERPOLATION_ENGINE_VERSION,
    governorVersion: TEMPORAL_GOVERNOR_VERSION,
    time,
    bracket,
    localT,
    deterministic,
    code: deterministic
      ? TEMPORAL_HEALTH_CODES.INTERPOLATION_CERTIFIED
      : TEMPORAL_HEALTH_CODES.DRIFT_DETECTED,
  });
}

// ─── Replay Verification ─────────────────────────────────────────────────────

/**
 * Verify that a frame can be replayed from keyframes.
 *
 * Re-evaluates the temporal gene at the given time and compares the
 * projection checksum. If they match, the frame is replayable.
 *
 * @param {object} gene - The temporal gene
 * @param {number} time - The time to replay
 * @param {string} expectedProjectionChecksum - The checksum to verify against
 * @param {object} [options] - The SAME algorithm options the frame was compiled
 *   with. A replay under different options is a different projection.
 * @returns {object} Replay verification record (frozen)
 */
export function verifyReplay(gene, time, expectedProjectionChecksum, options = {}) {
  const result = evaluateTemporal(gene, time, options);
  const energy = evaluateEnergyBindings(gene, time);

  const actualChecksum = computeProjectionChecksum({
    geneChecksum: gene.checksum,
    algorithm: gene.algorithm,
    time,
    bracketFrom: result.bracket.from,
    bracketTo: result.bracket.to,
    localT: result.localT,
    state: result.state,
    energy,
  });

  const matches = actualChecksum === expectedProjectionChecksum;

  return Object.freeze({
    verified: matches,
    expectedChecksum: expectedProjectionChecksum,
    actualChecksum,
    geneChecksum: gene.checksum,
    time,
    code: matches
      ? TEMPORAL_HEALTH_CODES.REPLAY_VERIFIED
      : TEMPORAL_HEALTH_CODES.DRIFT_DETECTED,
    driftDiagnosis: matches ? null : diagnoseDrift(gene, time, expectedProjectionChecksum, actualChecksum),
  });
}

// ─── Drift Diagnosis ─────────────────────────────────────────────────────────

/**
 * Diagnose the cause of a projection checksum mismatch.
 *
 * The dual-checksum model localizes drift:
 *   - Gene checksum stable + projection diverged → engine/algorithm changed
 *   - Gene checksum diverged → curated intent changed (re-approval needed)
 *   - Both diverged → full re-certification needed
 *
 * @param {object} gene - The temporal gene
 * @param {number} time - The time that was evaluated
 * @param {string} expected - Expected projection checksum
 * @param {string} actual - Actual projection checksum
 * @returns {object} Diagnosis (frozen)
 */
export function diagnoseDrift(gene, time, expected, actual) {
  // Re-verify gene checksum
  const recomputedGene = computeTemporalChecksum(gene);
  const geneStable = recomputedGene === gene.checksum;

  if (!geneStable) {
    return Object.freeze({
      cause: 'GENE_MUTATED',
      detail: 'Gene checksum no longer matches stored value. Curated intent has changed. Re-approval required.',
      action: 'RE_APPROVE',
    });
  }

  // Gene is stable, projection diverged → engine or algorithm changed
  return Object.freeze({
    cause: 'ENGINE_DRIFT',
    detail: `Gene checksum stable (${gene.checksum.slice(0, 16)}...) but projection diverged. ` +
      `Interpolation engine version or algorithm behavior has changed. ` +
      `Expected: ${expected.slice(0, 16)}..., Actual: ${actual.slice(0, 16)}...`,
    action: 'VERSION_BUMP_AND_RE_CERTIFY',
    engineVersion: INTERPOLATION_ENGINE_VERSION,
    governorVersion: TEMPORAL_GOVERNOR_VERSION,
  });
}

// ─── Batch Certification ─────────────────────────────────────────────────────

/**
 * Certify an entire frame sequence.
 *
 * Generates frames via the interpolation engine, then certifies each one.
 * Returns a certification manifest with per-frame checksums.
 *
 * @param {object} gene - The temporal gene
 * @param {number} frameCount - Number of frames
 * @param {object} [options] - Algorithm-specific options
 * @returns {object} Certification manifest (frozen)
 */
export function certifySequence(gene, frameCount, options = {}) {
  // First certify the gene itself
  const geneCert = certifyGene(gene);
  if (!geneCert.certified) {
    return Object.freeze({
      certified: false,
      geneCertification: geneCert,
      frames: [],
      code: TEMPORAL_HEALTH_CODES.APPROVAL_REQUIRED,
    });
  }

  const startTime = gene.keyframes[0].time;
  const endTime = gene.keyframes[gene.keyframes.length - 1].time;
  const frames = [];

  for (let i = 0; i < frameCount; i++) {
    const time = frameCount === 1
      ? startTime
      : startTime + (endTime - startTime) * (i / (frameCount - 1));

    const result = evaluateTemporal(gene, time, options);
    const energy = evaluateEnergyBindings(gene, time);
    const cert = certifyInterpolation(gene, time, result, energy);

    frames.push(Object.freeze({
      frame: i,
      time: cert.time,
      projectionChecksum: cert.projectionChecksum,
      certified: cert.certified,
    }));
  }

  const allCertified = frames.every(f => f.certified);

  return Object.freeze({
    certified: allCertified,
    geneCertification: geneCert,
    frameCount,
    frames: Object.freeze(frames),
    engineVersion: INTERPOLATION_ENGINE_VERSION,
    governorVersion: TEMPORAL_GOVERNOR_VERSION,
    code: allCertified
      ? TEMPORAL_HEALTH_CODES.INTERPOLATION_CERTIFIED
      : TEMPORAL_HEALTH_CODES.DRIFT_DETECTED,
  });
}

// ─── Approval Record ─────────────────────────────────────────────────────────

/**
 * Create an approval record for a temporal gene.
 *
 * The curator approves BOTH the authored intent (gene) AND its deterministic
 * manifestation (projection). The record binds:
 *   - geneChecksum (identity of curated intent)
 *   - projectionChecksum (identity of realized structure)
 *   - previewChecksum (identity of the preview the curator saw)
 *   - algorithm + engine + governor versions
 *   - projectionMode (explicit / derived / hybrid)
 *
 * @param {object} params
 * @param {string} params.geneChecksum
 * @param {string} params.projectionChecksum
 * @param {string} params.previewChecksum
 * @param {string} params.approvedBy
 * @param {string} params.projectionMode
 * @param {string} params.algorithm
 * @returns {object} Approval record (frozen)
 */
export function createApprovalRecord(params) {
  if (!params.approvedBy || params.approvedBy !== 'human') {
    const err = new Error('ART_GENE_REQUIRES_HUMAN_APPROVAL: source must be "human"');
    err.bytecode = 'PB-ERR-v1-TEMPORAL-APPROVAL-REQUIRED';
    throw err;
  }

  const record = {
    geneChecksum: params.geneChecksum,
    projectionChecksum: params.projectionChecksum,
    previewChecksum: params.previewChecksum,
    approvedBy: 'human',
    approvedAt: null, // EXEMPT — metadata only, not bound into checksums
    projectionMode: params.projectionMode ?? 'derived',
    algorithm: params.algorithm,
    engineVersion: INTERPOLATION_ENGINE_VERSION,
    governorVersion: TEMPORAL_GOVERNOR_VERSION,
  };

  // Compute approval checksum (excludes approvedAt)
  const canonical = canonicalConstructionStringify({
    geneChecksum: record.geneChecksum,
    projectionChecksum: record.projectionChecksum,
    previewChecksum: record.previewChecksum,
    approvedBy: record.approvedBy,
    projectionMode: record.projectionMode,
    algorithm: record.algorithm,
    engineVersion: record.engineVersion,
    governorVersion: record.governorVersion,
  });
  record.approvalChecksum = `sha256-canonical-v1:${sha256Hex(canonical)}`;

  return Object.freeze(record);
}

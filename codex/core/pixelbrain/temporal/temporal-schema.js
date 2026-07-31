/**
 * PB-TEMPORAL-GENE-v1 — Temporal gene schema, keyframe definitions, algorithm registry.
 * PDR: 2026-07-25-geometric-construction-solver-pdr.md (temporal extension)
 *
 * A temporal gene carries the CONSTRUCTION GENOTYPE for animation:
 * keyframes (curated states), interpolation algorithm (the "verb tense"),
 * and temporal parameters (duration, easing, looping).
 *
 * The gene says WHAT changes and HOW. The interpolation engine derives WHERE.
 * BytecodeHealth governs (certifies, versions, audits) but never interpolates.
 *
 * Determinism contract (VAELRIX_LAW §6):
 *   - Same gene + same algorithm version + same t → same state
 *   - All meaningful inputs bound into checksum
 *   - No randomness, no unseeded clocks in computation paths
 */

import { sha256Hex } from '../sha256.js';
import { canonicalConstructionStringify } from '../construction/construction-schema.js';

// ─── Contract Constants ──────────────────────────────────────────────────────

export const TEMPORAL_CONTRACT = 'PB-TEMPORAL-GENE-v1';
export const TEMPORAL_VERSION = '1.0.0';

/**
 * Interpolation algorithm registry.
 * Each algorithm is a pure function: (stateA, stateB, t) → stateT
 * Version is bound into checksums for causal drift detection.
 */
export const INTERPOLATION_ALGORITHMS = Object.freeze({
  'linear-v1': {
    id: 'linear-v1',
    description: 'Linear interpolation between keyframe states.',
    deterministic: true,
    continuous: true,
  },
  'hermite-v1': {
    id: 'hermite-v1',
    description: 'Cubic Hermite spline with zero tangents at endpoints.',
    deterministic: true,
    continuous: true,
  },
  'bezier-v1': {
    id: 'bezier-v1',
    description: 'Cubic Bezier with authored control points.',
    deterministic: true,
    continuous: true,
  },
  'step-v1': {
    id: 'step-v1',
    description: 'Discrete step — holds stateA until t=1, then stateB.',
    deterministic: true,
    continuous: false,
  },
  'smoothstep-v1': {
    id: 'smoothstep-v1',
    description: 'Hermite smoothstep (3t² - 2t³) easing.',
    deterministic: true,
    continuous: true,
  },
});

/**
 * Temporal aspect (looping behavior).
 */
export const TEMPORAL_ASPECTS = Object.freeze({
  'one-shot': 'Plays once from start to end.',
  'loop': 'Repeats from start after reaching end.',
  'ping-pong': 'Reverses direction at each end.',
  'hold': 'Holds final state indefinitely.',
});

/**
 * Projection modes for temporal genes.
 */
export const PROJECTION_MODES = Object.freeze({
  explicit: 'Human curates exact per-frame states.',
  derived: 'Human curates keyframes; engine derives intermediates.',
  hybrid: 'Human curates some frames; engine derives the rest.',
});

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate a temporal gene spec without throwing.
 * Returns { valid, issues[] }.
 */
export function validateTemporalSpec(spec) {
  const issues = [];

  if (!spec || typeof spec !== 'object') {
    return { valid: false, issues: ['spec must be an object'] };
  }
  if (spec.contract !== TEMPORAL_CONTRACT) {
    issues.push(`contract must be '${TEMPORAL_CONTRACT}'`);
  }
  if (!spec.id || typeof spec.id !== 'string') {
    issues.push('id must be a non-empty string');
  }
  if (!spec.assetId || typeof spec.assetId !== 'string') {
    issues.push('assetId must be a non-empty string');
  }
  if (!Array.isArray(spec.keyframes) || spec.keyframes.length < 2) {
    issues.push('keyframes must be an array with at least 2 entries');
  }
  if (spec.keyframes) {
    for (let i = 0; i < spec.keyframes.length; i++) {
      const kf = spec.keyframes[i];
      if (typeof kf.time !== 'number' || !Number.isFinite(kf.time)) {
        issues.push(`keyframes[${i}].time must be a finite number`);
      }
      if (!kf.state || typeof kf.state !== 'object') {
        issues.push(`keyframes[${i}].state must be an object`);
      }
    }
    // Verify monotonically increasing time
    for (let i = 1; i < spec.keyframes.length; i++) {
      if (spec.keyframes[i].time <= spec.keyframes[i - 1].time) {
        issues.push(`keyframes[${i}].time must be > keyframes[${i - 1}].time`);
      }
    }
  }
  if (spec.algorithm && !INTERPOLATION_ALGORITHMS[spec.algorithm]) {
    issues.push(`algorithm '${spec.algorithm}' is not in the registry`);
  }
  if (spec.aspect && !TEMPORAL_ASPECTS[spec.aspect]) {
    issues.push(`aspect '${spec.aspect}' is not recognized`);
  }
  if (spec.projectionMode && !PROJECTION_MODES[spec.projectionMode]) {
    issues.push(`projectionMode '${spec.projectionMode}' is not recognized`);
  }

  return { valid: issues.length === 0, issues };
}

// ─── Checksum ────────────────────────────────────────────────────────────────

/**
 * Compute a stable checksum over the temporal gene's semantic content.
 * Binds: gene identity, keyframe states, algorithm version, aspect, canvas.
 * This is the "identity of curated temporal intent."
 */
export function computeTemporalChecksum(fields) {
  const canonical = canonicalConstructionStringify({
    contract: TEMPORAL_CONTRACT,
    version: TEMPORAL_VERSION,
    id: fields.id,
    assetId: fields.assetId,
    algorithm: fields.algorithm,
    aspect: fields.aspect,
    projectionMode: fields.projectionMode,
    canvas: fields.canvas,
    keyframes: fields.keyframes,
    energyBindings: fields.energyBindings ?? [],
  });
  return `sha256-canonical-v1:${sha256Hex(canonical)}`;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a frozen PB-TEMPORAL-GENE-v1 packet.
 * Throws on invalid spec.
 *
 * @param {object} spec - Temporal gene specification
 * @returns {object} Frozen temporal gene packet with checksum
 */
export function createTemporalGene(spec) {
  const { valid, issues } = validateTemporalSpec(spec);
  if (!valid) {
    const err = new Error(`Invalid temporal gene: ${issues.join('; ')}`);
    err.bytecode = 'PB-ERR-v1-TEMPORAL-SCHEMA-INVALID';
    err.issues = issues;
    throw err;
  }

  const gene = {
    contract: TEMPORAL_CONTRACT,
    version: TEMPORAL_VERSION,
    id: spec.id,
    assetId: spec.assetId,
    algorithm: spec.algorithm ?? 'linear-v1',
    aspect: spec.aspect ?? 'one-shot',
    projectionMode: spec.projectionMode ?? 'derived',
    canvas: spec.canvas ? { width: spec.canvas.width, height: spec.canvas.height } : null,
    keyframes: spec.keyframes.map(kf => ({
      time: kf.time,
      label: kf.label ?? null,
      state: deepClone(kf.state),
    })),
    energyBindings: (spec.energyBindings ?? []).map(eb => ({
      energyType: eb.energyType,
      from: eb.from,
      to: eb.to,
      startTime: eb.startTime,
      endTime: eb.endTime,
    })),
    metadata: spec.metadata ?? {},
  };

  gene.checksum = computeTemporalChecksum(gene);

  return Object.freeze(deepClone(gene));
}

// ─── Keyframe State Helpers ──────────────────────────────────────────────────

/**
 * Extract a numeric channel from a keyframe state for interpolation.
 * States are construction solver results: { parts: { [partId]: { spine, closedContour, ... } } }
 *
 * This flattens a state into a sorted array of numbers for interpolation.
 */
export function flattenState(state) {
  const values = [];
  const keys = Object.keys(state).sort();
  for (const key of keys) {
    const part = state[key];
    if (!part || typeof part !== 'object') continue;
    // Flatten all point arrays
    for (const field of ['spine', 'closedContour', 'leftBank', 'rightBank']) {
      if (Array.isArray(part[field])) {
        for (const point of part[field]) {
          if (Array.isArray(point)) {
            values.push(point[0], point[1]);
          }
        }
      }
    }
    // Flatten named points
    if (part.namedPoints && typeof part.namedPoints === 'object') {
      const npKeys = Object.keys(part.namedPoints).sort();
      for (const npKey of npKeys) {
        const pt = part.namedPoints[npKey];
        if (Array.isArray(pt)) {
          values.push(pt[0], pt[1]);
        }
      }
    }
    // Flatten scalar fields
    for (const scalarField of ['radiusX', 'radiusY', 'width', 'height', 'angle']) {
      if (typeof part[scalarField] === 'number') {
        values.push(part[scalarField]);
      }
    }
  }
  return values;
}

/**
 * Reconstruct a state from a flat numeric array, given a template state.
 * The template provides the structure; the values provide the numbers.
 */
export function unflattenState(template, values) {
  let idx = 0;
  const result = {};
  const keys = Object.keys(template).sort();

  for (const key of keys) {
    const part = template[key];
    if (!part || typeof part !== 'object') {
      result[key] = part;
      continue;
    }
    const newPart = { ...part };

    for (const field of ['spine', 'closedContour', 'leftBank', 'rightBank']) {
      if (Array.isArray(part[field])) {
        newPart[field] = part[field].map(point => {
          if (Array.isArray(point)) {
            return [values[idx++], values[idx++]];
          }
          return point;
        });
      }
    }

    if (part.namedPoints && typeof part.namedPoints === 'object') {
      const npKeys = Object.keys(part.namedPoints).sort();
      newPart.namedPoints = {};
      for (const npKey of npKeys) {
        const pt = part.namedPoints[npKey];
        if (Array.isArray(pt)) {
          newPart.namedPoints[npKey] = [values[idx++], values[idx++]];
        } else {
          newPart.namedPoints[npKey] = pt;
        }
      }
    }

    for (const scalarField of ['radiusX', 'radiusY', 'width', 'height', 'angle']) {
      if (typeof part[scalarField] === 'number') {
        newPart[scalarField] = values[idx++];
      }
    }

    result[key] = newPart;
  }

  return result;
}

// ─── Internal ────────────────────────────────────────────────────────────────

function deepClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepClone);
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, deepClone(v)]),
  );
}

/**
 * Temporal Interpolation Engine — pure functions for state interpolation.
 *
 * This is the "verb conjugation" layer. It derives intermediate states from
 * keyframe pairs. It is PURE: same inputs → same outputs, every time.
 *
 * BytecodeHealth GOVERNS this layer (certifies, versions, audits) but never
 * becomes it. The engine does not know BytecodeHealth exists.
 *
 * Architecture:
 *   interpolate(stateA, stateB, algorithm, t) → stateT
 *
 * All algorithms operate on flat numeric arrays (via flattenState/unflattenState).
 * The engine is versioned: INTERPOLATION_ENGINE_VERSION is bound into checksums
 * by the governor for causal drift detection.
 *
 * Determinism contract:
 *   - No randomness
 *   - No I/O
 *   - No mutable state
 *   - Quantized outputs (3 decimal places)
 *   - Fixed evaluation order
 */

import { quantize } from '../construction/construction-schema.js';
import { flattenState, unflattenState } from './temporal-schema.js';

// ─── Engine Version ──────────────────────────────────────────────────────────

export const INTERPOLATION_ENGINE_VERSION = '1.0.0';

// ─── Core Interpolation Functions ────────────────────────────────────────────

/**
 * Linear interpolation: lerp(a, b, t) = a + (b - a) * t
 */
export function lerpScalar(a, b, t) {
  return quantize(a + (b - a) * t);
}

/**
 * Cubic Hermite spline with zero tangents at endpoints.
 * h(t) = (2t³ - 3t² + 1)a + (-2t³ + 3t²)b
 */
export function hermiteScalar(a, b, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = -2 * t3 + 3 * t2;
  return quantize(h00 * a + h10 * b);
}

/**
 * Cubic Bezier with authored control points.
 * B(t) = (1-t)³a + 3(1-t)²t·c1 + 3(1-t)t²·c2 + t³·b
 * Control points default to 1/3 and 2/3 of the interval if not provided.
 */
export function bezierScalar(a, b, t, c1 = null, c2 = null) {
  const control1 = c1 ?? a + (b - a) / 3;
  const control2 = c2 ?? a + 2 * (b - a) / 3;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return quantize(mt3 * a + 3 * mt2 * t * control1 + 3 * mt * t2 * control2 + t3 * b);
}

/**
 * Step interpolation: holds stateA until t >= 1, then stateB.
 */
export function stepScalar(a, b, t) {
  return t >= 1 ? quantize(b) : quantize(a);
}

/**
 * Smoothstep: 3t² - 2t³ easing applied to linear interpolation.
 */
export function smoothstepScalar(a, b, t) {
  const s = t * t * (3 - 2 * t);
  return quantize(a + (b - a) * s);
}

// ─── Algorithm Dispatch ──────────────────────────────────────────────────────

const SCALAR_ALGORITHMS = Object.freeze({
  'linear-v1': lerpScalar,
  'hermite-v1': hermiteScalar,
  'bezier-v1': bezierScalar,
  'step-v1': stepScalar,
  'smoothstep-v1': smoothstepScalar,
});

/**
 * Interpolate a flat numeric array using the named algorithm.
 *
 * @param {number[]} valuesA - Source state (flat)
 * @param {number[]} valuesB - Target state (flat)
 * @param {string} algorithmId - Algorithm registry key
 * @param {number} t - Interpolation parameter [0, 1]
 * @param {object} [options] - Algorithm-specific options (e.g. bezier control points)
 * @returns {number[]} Interpolated state (flat, quantized)
 * @throws {Error} On unknown algorithm or dimension mismatch
 */
export function interpolateFlat(valuesA, valuesB, algorithmId, t, options = {}) {
  const fn = SCALAR_ALGORITHMS[algorithmId];
  if (!fn) {
    const err = new Error(`Unknown interpolation algorithm: '${algorithmId}'`);
    err.bytecode = 'PB-ERR-v1-TEMPORAL-ALGORITHM-UNKNOWN';
    throw err;
  }

  if (valuesA.length !== valuesB.length) {
    const err = new Error(
      `State dimension mismatch: ${valuesA.length} vs ${valuesB.length}. ` +
      `Keyframe states must have identical structure.`,
    );
    err.bytecode = 'PB-ERR-v1-TEMPORAL-DIMENSION-MISMATCH';
    throw err;
  }

  // Clamp t to [0, 1]
  const tc = Math.max(0, Math.min(1, t));

  const result = new Array(valuesA.length);
  for (let i = 0; i < valuesA.length; i++) {
    if (algorithmId === 'bezier-v1') {
      const c1 = options.controlPoints?.[i]?.[0] ?? null;
      const c2 = options.controlPoints?.[i]?.[1] ?? null;
      result[i] = fn(valuesA[i], valuesB[i], tc, c1, c2);
    } else {
      result[i] = fn(valuesA[i], valuesB[i], tc);
    }
  }

  return result;
}

// ─── State-Level Interpolation ───────────────────────────────────────────────

/**
 * Interpolate between two construction solver result states.
 *
 * @param {object} stateA - Source state (solver result: { parts: {...} })
 * @param {object} stateB - Target state (solver result: { parts: {...} })
 * @param {string} algorithmId - Algorithm registry key
 * @param {number} t - Interpolation parameter [0, 1]
 * @param {object} [options] - Algorithm-specific options
 * @returns {object} Interpolated state (same structure as inputs)
 */
export function interpolateState(stateA, stateB, algorithmId, t, options = {}) {
  const flatA = flattenState(stateA);
  const flatB = flattenState(stateB);

  const flatResult = interpolateFlat(flatA, flatB, algorithmId, t, options);

  return unflattenState(stateA, flatResult);
}

// ─── Temporal Evaluation ─────────────────────────────────────────────────────

/**
 * Evaluate a temporal gene at a specific time, producing the construction state.
 *
 * Handles aspect (looping) and finds the correct keyframe bracket.
 *
 * @param {object} gene - A PB-TEMPORAL-GENE-v1 packet
 * @param {number} time - Absolute time to evaluate at
 * @param {object} [options] - Algorithm-specific options
 * @returns {{ state: object, bracket: { from: number, to: number }, localT: number }}
 */
export function evaluateTemporal(gene, time, options = {}) {
  const keyframes = gene.keyframes;
  const startTime = keyframes[0].time;
  const endTime = keyframes[keyframes.length - 1].time;
  const duration = endTime - startTime;

  if (duration <= 0) {
    const err = new Error('Temporal gene has zero or negative duration');
    err.bytecode = 'PB-ERR-v1-TEMPORAL-ZERO-DURATION';
    throw err;
  }

  // Apply aspect (looping behavior)
  let effectiveTime = applyAspect(time, startTime, endTime, gene.aspect);

  // Find the bracketing keyframes
  let fromIdx = 0;
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (effectiveTime >= keyframes[i].time && effectiveTime <= keyframes[i + 1].time) {
      fromIdx = i;
      break;
    }
    if (i === keyframes.length - 2) {
      fromIdx = i; // Clamp to last bracket
    }
  }

  const kfA = keyframes[fromIdx];
  const kfB = keyframes[fromIdx + 1];
  const bracketDuration = kfB.time - kfA.time;
  const localT = bracketDuration > 0
    ? (effectiveTime - kfA.time) / bracketDuration
    : 1;

  // Interpolate
  const state = interpolateState(
    kfA.state,
    kfB.state,
    gene.algorithm,
    localT,
    options,
  );

  return {
    state,
    bracket: { from: kfA.time, to: kfB.time },
    localT: quantize(localT),
    effectiveTime: quantize(effectiveTime),
  };
}

/**
 * Apply temporal aspect (looping) to convert absolute time to effective time.
 */
function applyAspect(time, startTime, endTime, aspect) {
  const duration = endTime - startTime;

  switch (aspect) {
    case 'one-shot':
      return Math.max(startTime, Math.min(endTime, time));

    case 'loop': {
      if (time < startTime) return startTime;
      const elapsed = (time - startTime) % duration;
      return startTime + elapsed;
    }

    case 'ping-pong': {
      if (time < startTime) return startTime;
      const elapsed = (time - startTime) % (2 * duration);
      if (elapsed <= duration) {
        return startTime + elapsed;
      }
      return endTime - (elapsed - duration);
    }

    case 'hold':
      return Math.min(endTime, Math.max(startTime, time));

    default:
      return Math.max(startTime, Math.min(endTime, time));
  }
}

// ─── Energy Binding Evaluation ───────────────────────────────────────────────

/**
 * Evaluate energy bindings at a specific time.
 * Returns a map of energyType → interpolated value.
 *
 * @param {object} gene - A PB-TEMPORAL-GENE-v1 packet
 * @param {number} time - Absolute time
 * @returns {object} Map of energyType → value
 */
export function evaluateEnergyBindings(gene, time) {
  const result = {};

  for (const binding of (gene.energyBindings ?? [])) {
    const { energyType, from, to, startTime, endTime } = binding;
    const duration = endTime - startTime;

    let t;
    if (duration <= 0) {
      t = time >= endTime ? 1 : 0;
    } else {
      t = Math.max(0, Math.min(1, (time - startTime) / duration));
    }

    result[energyType] = quantize(from + (to - from) * t);
  }

  return result;
}

// ─── Batch Frame Generation ──────────────────────────────────────────────────

/**
 * Generate a sequence of frames from a temporal gene.
 *
 * @param {object} gene - A PB-TEMPORAL-GENE-v1 packet
 * @param {number} frameCount - Number of frames to generate
 * @param {object} [options] - Algorithm-specific options
 * @returns {Array<{ frame: number, time: number, state: object, energy: object }>}
 */
export function generateFrames(gene, frameCount, options = {}) {
  if (frameCount < 1) {
    const err = new Error('frameCount must be >= 1');
    err.bytecode = 'PB-ERR-v1-TEMPORAL-INVALID-FRAMECOUNT';
    throw err;
  }

  const startTime = gene.keyframes[0].time;
  const endTime = gene.keyframes[gene.keyframes.length - 1].time;
  const frames = [];

  for (let i = 0; i < frameCount; i++) {
    const rawTime = frameCount === 1
      ? startTime
      : startTime + (endTime - startTime) * (i / (frameCount - 1));
    // Quantize BEFORE any computation so all downstream consumers
    // (evaluateTemporal, evaluateEnergyBindings, checksums) see the
    // same canonical time value. This prevents float drift between
    // the time used for interpolation and the time stored in the frame.
    const time = quantize(rawTime);

    const { state } = evaluateTemporal(gene, time, options);
    const energy = evaluateEnergyBindings(gene, time);

    frames.push({
      frame: i,
      time,
      state,
      energy,
    });
  }

  return frames;
}
